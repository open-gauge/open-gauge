import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.user import User
from ...repositories import certificate_template as certtpl_repo
from ...repositories import stored_file as file_repo
from ...schemas.certificate_template import CertificateTemplateResponse, CertificateTemplateUpdate
from ...services import certificate_service
from ...services import latex_service
from ...services import storage as storage_svc
from ...services.latex_service import LatexCompileError

router = APIRouter(prefix="/certificate-templates", tags=["Certificate Templates"])


def _require_admin(user: User) -> None:
    if not (user.is_superuser or user.role in ("superadmin", "admin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")


def _require_superadmin(user: User) -> None:
    if not (user.is_superuser or user.role == "superadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin only (global templates affect every organization)")


@router.get("", response_model=list[CertificateTemplateResponse])
def list_templates(
    organization_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CertificateTemplateResponse]:
    return certtpl_repo.list_templates(db, organization_id=organization_id)


@router.post("", response_model=CertificateTemplateResponse, status_code=status.HTTP_201_CREATED)
async def upload_template(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str | None = Form(None),
    organization_id: uuid.UUID | None = Form(None),
    is_default: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CertificateTemplateResponse:
    """Upload a .tex Jinja certificate template. Validated with a dry-run compile
    (dummy data) before being persisted, so a bad template is rejected immediately
    rather than silently failing the next time a real certificate is generated."""
    if organization_id is None:
        _require_superadmin(current_user)
    else:
        _require_admin(current_user)

    data = await file.read()
    try:
        tex_source = data.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template must be a UTF-8 encoded .tex file")

    try:
        latex_service.dry_run_compile(tex_source)
    except LatexCompileError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Template failed to compile: {e}")

    checksum = storage_svc.sha256_hex(data)
    object_path = storage_svc.unique_object_name("certificate-templates", file.filename or "template.tex")
    bucket, path, size = storage_svc.upload_file(data, "text/x-tex", object_path)

    file_record = file_repo.create(
        db,
        original_filename=file.filename or "template.tex",
        storage_path=path,
        bucket=bucket,
        content_type="text/x-tex",
        size_bytes=size,
        checksum_sha256=checksum,
        entity_type="certificate_template",
        entity_id=None,
        uploaded_by=current_user.id,
    )

    if is_default:
        certtpl_repo.unset_default(db, organization_id)

    template = certtpl_repo.create(
        db,
        organization_id=organization_id,
        name=name,
        description=description,
        template_file_id=file_record.id,
        is_default=is_default,
        created_by=current_user.id,
    )
    return template


@router.put("/{template_id}", response_model=CertificateTemplateResponse)
def update_template(
    template_id: uuid.UUID,
    body: CertificateTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CertificateTemplateResponse:
    """Metadata-only update (name/description/is_default/is_active) — replacing the
    .tex source itself requires uploading a new template, keeping history immutable."""
    template = certtpl_repo.get_by_id(db, template_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    if template.organization_id is None:
        _require_superadmin(current_user)
    else:
        _require_admin(current_user)

    if body.is_default:
        certtpl_repo.unset_default(db, template.organization_id)

    return certtpl_repo.update(
        db, template,
        name=body.name, description=body.description,
        is_default=body.is_default, is_active=body.is_active,
    )


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Soft-deletes the template. If it was the active default, certificate
    generation simply falls back to the global/built-in default — no replacement
    needs to be designated first."""
    template = certtpl_repo.get_by_id(db, template_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    if template.organization_id is None:
        _require_superadmin(current_user)
    else:
        _require_admin(current_user)

    certtpl_repo.deactivate(db, template)


@router.post("/{template_id}/preview")
def preview_template(
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Re-compile the template with a freshly randomized 10-row sample dataset
    and return the PDF directly, so an admin can see what it looks like —
    dataset table, chart, everything — without generating a real certificate."""
    _ = current_user
    template = certtpl_repo.get_by_id(db, template_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    file_record = file_repo.get_by_id(db, template.template_file_id)
    if not file_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template file not found")

    data = storage_svc.download_file(file_record.storage_path, file_record.bucket)
    if data is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Storage unavailable")

    context, images = certificate_service.build_random_preview_context()
    try:
        rendered = latex_service.render_template(data.decode("utf-8"), context)
        pdf_bytes = latex_service.compile_tex(rendered, images)
    except LatexCompileError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Template failed to compile: {e}")

    return Response(content=pdf_bytes, media_type="application/pdf")


@router.post("/preview-builtin")
def preview_builtin_template(
    _: User = Depends(get_current_user),
) -> Response:
    """Preview the app's built-in default template (no DB row exists for it)
    with a freshly randomized 10-row sample dataset."""
    tex_source = latex_service.BUILTIN_TEMPLATE_PATH.read_text(encoding="utf-8")
    context, images = certificate_service.build_random_preview_context()
    try:
        rendered = latex_service.render_template(tex_source, context)
        pdf_bytes = latex_service.compile_tex(rendered, images)
    except LatexCompileError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Template failed to compile: {e}")
    return Response(content=pdf_bytes, media_type="application/pdf")
