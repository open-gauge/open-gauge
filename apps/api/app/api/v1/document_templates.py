import json
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user, require_not_viewer
from ...models.document_template import DocumentTemplate
from ...models.user import User
from ...repositories import audit_log as audit_log_repo
from ...repositories import document_template as template_repo
from ...repositories import stored_file as file_repo
from ...schemas.document_template import (
    DocumentTemplateCreate,
    DocumentTemplateDuplicateRequest,
    DocumentTemplateListItem,
    DocumentTemplateResponse,
    DocumentTemplateUpdate,
    SetEnabledRequest,
    _validate_document_shape,
)
from ...schemas.stored_file import StoredFileResponse
from ...services import storage as storage_svc
from ...services import template_defaults_service
from ...services.template_defaults_service import BaseTemplateError
from ...utils.audit_diff import diff_snapshots, snapshot

router = APIRouter(prefix="/document-templates", tags=["Document Templates"])


def _get_or_404(db: Session, template_id: uuid.UUID) -> DocumentTemplate:
    template = template_repo.get_by_id(db, template_id)
    if not template or not template.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return template


def _audit(
    db: Session,
    request: Request,
    current_user: User,
    *,
    action: str,
    template: DocumentTemplate,
    before_state: dict | None = None,
    after_state: dict | None = None,
) -> None:
    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action=action,
        entity_type="document_template",
        entity_id=template.id,
        before_state=before_state,
        after_state=after_state,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


@router.get(
    "",
    response_model=list[DocumentTemplateListItem],
    summary="List document templates",
    description="Returns the latest version of every template (one row per template group). "
    "Filter by `type` (certificate/procedure), `status` (draft/published/archived), or `q` "
    "(name search).",
)
def list_document_templates(
    type: str | None = None,
    status_: str | None = Query(None, alias="status"),
    q: str | None = None,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DocumentTemplate]:
    # Procedures have no legacy .tex fallback the way certificates do — their base template only
    # exists as a lazily-created DocumentTemplate row (see template_defaults_service.py).
    if type is None or type == "procedure":
        template_defaults_service.ensure_builtin_procedure_template(db, current_user.id)
    return template_repo.list_latest(db, type=type, status=status_, q=q, include_archived=include_archived)


@router.post(
    "",
    response_model=DocumentTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a document template",
    description="Creates version 1 of a new template as a draft, with an empty document.",
)
def create_document_template(
    body: DocumentTemplateCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> DocumentTemplate:
    template = template_repo.create(
        db, name=body.name, description=body.description, type=body.type, created_by=current_user.id
    )
    _audit(
        db, request, current_user,
        action="document_template.created", template=template,
        after_state={"name": template.name, "type": template.type},
    )
    return template


@router.post(
    "/import",
    response_model=DocumentTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Import a document template from an exported JSON file",
    description="Creates a new draft (its own version history) from a JSON file previously "
    "produced by GET /{template_id}/export — round-trips through the live editor, unlike a raw "
    "LaTeX upload (see /certificate-templates for that).",
)
async def import_document_template(
    request: Request,
    file: UploadFile = File(...),
    name: str | None = Form(None),
    version: int = Form(1),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> DocumentTemplate:
    raw = await file.read()
    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid JSON file: {e}")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expected a JSON object")
    # `name` (form field) lets the picker override the file's own embedded name — falls back to it
    # when not given, same as picking "keep the imported name" in the UI.
    resolved_name = (name or "").strip() or payload.get("name")
    template_type = payload.get("type")
    document = payload.get("document")
    if not resolved_name or template_type not in ("certificate", "procedure") or not isinstance(document, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is missing name/type/document")
    try:
        _validate_document_shape(document)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    template = template_repo.create(
        db, name=resolved_name, description=payload.get("description"), type=template_type, created_by=current_user.id
    )
    template = template_repo.update(db, template, document=document, version=version)
    _audit(
        db, request, current_user,
        action="document_template.imported", template=template,
        after_state={"name": template.name, "type": template.type},
    )
    return template


@router.get("/{template_id}", response_model=DocumentTemplateResponse, summary="Get a document template version")
def get_document_template(
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DocumentTemplate:
    return _get_or_404(db, template_id)


@router.get(
    "/{template_id}/export",
    summary="Export a document template as a JSON file",
    description="Downloads this version's name/description/type/document as a JSON file, "
    "importable again via POST /import — round-trips through the live editor.",
)
def export_document_template(
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Response:
    template = _get_or_404(db, template_id)
    payload = {
        "name": template.name,
        "description": template.description,
        "type": template.type,
        "document": template.document,
    }
    filename = f"{template.name.strip().replace(' ', '_') or 'template'}.json"
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/{template_id}/preview",
    summary="Preview a document template as PDF, with static sample data",
    description="Compiles the template with the same sample catalog the editor's own \"Preview "
    "Data\" mode uses (not real calibration data) — works for any status, including a draft, so "
    "an admin can see the rendered result while iterating, before publishing.",
)
def preview_document_template(
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Response:
    from ...services import certificate_service, latex_service, procedure_document
    from ...services.document_template_latex import document_to_latex
    from ...services.latex_service import LatexCompileError

    template = _get_or_404(db, template_id)
    context, images = (
        procedure_document.build_sample_procedure_context()
        if template.type == "procedure"
        else certificate_service.build_sample_document_context()
    )
    images_by_file_id = certificate_service.resolve_uploaded_images(db, template.document)
    try:
        tex_source = document_to_latex(template.document, context, images, images_by_file_id)
        pdf_bytes = latex_service.compile_tex(tex_source, images)
    except LatexCompileError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Template failed to compile: {e}")
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.get(
    "/{template_id}/versions",
    response_model=list[DocumentTemplateListItem],
    summary="List every version of a template's group",
)
def list_document_template_versions(
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[DocumentTemplate]:
    template = _get_or_404(db, template_id)
    return template_repo.list_versions(db, template.template_group_id)


@router.put(
    "/{template_id}",
    response_model=DocumentTemplateResponse,
    summary="Update a draft document template",
    description="Only the draft version of a template may be edited. A published template is "
    "immutable — use `POST /{id}/new-version` to branch a new editable draft off it.",
)
def update_document_template(
    template_id: uuid.UUID,
    body: DocumentTemplateUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> DocumentTemplate:
    template = _get_or_404(db, template_id)
    if template.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Published templates are immutable. Create a new version to edit this template.",
        )
    data = body.model_dump(exclude_unset=True)
    before = snapshot(template, data.keys())
    template = template_repo.update(db, template, **data)
    after = snapshot(template, data.keys())
    before_state, after_state = diff_snapshots(before, after)
    if before_state or after_state:
        _audit(
            db, request, current_user,
            action="document_template.updated", template=template,
            before_state=before_state, after_state=after_state,
        )
    return template


@router.post(
    "/{template_id}/new-version",
    response_model=DocumentTemplateResponse,
    summary="Branch a new draft version off a published template",
    description="If a draft already exists in this template's group, returns that existing draft "
    "instead of creating another one.",
)
def branch_new_version(
    template_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> DocumentTemplate:
    source = _get_or_404(db, template_id)
    if source.is_builtin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The base template cannot be edited")
    existing_draft = template_repo.get_draft_in_group(db, source.template_group_id)
    if existing_draft:
        return existing_draft
    new_version = template_repo.create_new_version(db, source, created_by=current_user.id)
    _audit(
        db, request, current_user,
        action="document_template.new_version", template=new_version,
        after_state={"version": new_version.version, "branched_from_version": source.version},
    )
    return new_version


@router.post(
    "/{template_id}/publish",
    response_model=DocumentTemplateResponse,
    summary="Publish a draft template",
    description="Publishing freezes this version — it can no longer be edited in place.",
)
def publish_document_template(
    template_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> DocumentTemplate:
    template = _get_or_404(db, template_id)
    if template.status != "draft":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only a draft can be published")
    template = template_repo.publish(db, template)
    _audit(
        db, request, current_user,
        action="document_template.published", template=template,
        after_state={"version": template.version},
    )
    return template


@router.post(
    "/{template_id}/archive",
    response_model=DocumentTemplateResponse,
    summary="Archive a document template",
    description="Soft-deletes a template by marking its latest version archived. The template's "
    "history is preserved, not removed.",
)
def archive_document_template(
    template_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> DocumentTemplate:
    template = _get_or_404(db, template_id)
    if template.is_builtin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The base template cannot be deleted")
    if template.status == "archived":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template is already archived")
    was_default = template.is_default
    template = template_repo.archive(db, template)
    if was_default:
        fallback = (
            template_defaults_service.ensure_procedure_default_fallback
            if template.type == "procedure"
            else template_defaults_service.ensure_report_default_fallback
        )
        fallback(db, current_user.id)
    _audit(db, request, current_user, action="document_template.archived", template=template)
    return template


@router.post(
    "/{template_id}/set-default",
    response_model=DocumentTemplateResponse,
    summary="Mark a published template as the default",
    description="For a \"procedure\" template, this is the default used whenever a procedure is "
    "downloaded without an explicit template choice. For a \"certificate\" template, it competes "
    "with legacy .tex certificate templates for the same global default — see "
    "template_defaults_service.set_report_default.",
)
def set_document_template_default(
    template_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> DocumentTemplate:
    template = _get_or_404(db, template_id)
    if template.status != "published":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only a published template can be marked default")
    if not template.is_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A disabled template cannot be marked default")
    if template.type == "procedure":
        template_repo.set_default(db, template)
    else:
        template_defaults_service.set_report_default(db, document_template_id=template_id)
    db.refresh(template)
    _audit(db, request, current_user, action="document_template.set_default", template=template)
    return template


@router.post(
    "/{template_id}/set-enabled",
    response_model=DocumentTemplateResponse,
    summary="Enable or disable a template for selection when downloading",
    description="Distinct from archive (above), which soft-removes a template from the admin list "
    "entirely — a disabled template stays visible/editable but drops out of the download picker.",
)
def set_document_template_enabled(
    template_id: uuid.UUID,
    body: SetEnabledRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> DocumentTemplate:
    template = _get_or_404(db, template_id)
    if not body.enabled:
        try:
            template_defaults_service.assert_can_disable(template.is_builtin, template.is_default)
        except BaseTemplateError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    was_default = template.is_default
    updated = template_repo.set_enabled(db, template, body.enabled)
    if not body.enabled and was_default:
        fallback = (
            template_defaults_service.ensure_procedure_default_fallback
            if template.type == "procedure"
            else template_defaults_service.ensure_report_default_fallback
        )
        fallback(db, current_user.id)
    _audit(
        db, request, current_user,
        action="document_template.set_enabled", template=updated, after_state={"is_enabled": body.enabled},
    )
    return updated


@router.post(
    "/{template_id}/duplicate",
    response_model=DocumentTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Duplicate a document template",
    description="Creates a brand-new, independent template (its own version history) pre-filled "
    "with this version's document content.",
)
def duplicate_document_template(
    template_id: uuid.UUID,
    body: DocumentTemplateDuplicateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> DocumentTemplate:
    source = _get_or_404(db, template_id)
    name = body.name or f"{source.name} (copy)"
    clone = template_repo.duplicate(db, source, name=name, created_by=current_user.id)
    _audit(
        db, request, current_user,
        action="document_template.duplicated", template=clone,
        after_state={"duplicated_from": str(source.id)},
    )
    return clone


# ---------------------------------------------------------------------------
# Image block file attachments
# ---------------------------------------------------------------------------

def _enrich_files(files: list) -> list[StoredFileResponse]:
    result = []
    for f in files:
        resp = StoredFileResponse.model_validate(f)
        resp.url = storage_svc.get_presigned_url(f.storage_path, f.bucket)
        result.append(resp)
    return result


@router.get("/{template_id}/files", response_model=list[StoredFileResponse], summary="List a template's uploaded images")
def list_document_template_files(
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[StoredFileResponse]:
    _get_or_404(db, template_id)
    return _enrich_files(file_repo.list_by_entity(db, template_id))


@router.post(
    "/{template_id}/files",
    response_model=StoredFileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an image for use in an image block",
)
async def upload_document_template_file(
    template_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> StoredFileResponse:
    _get_or_404(db, template_id)
    data = await file.read()
    try:
        content_type = storage_svc.validate_image_upload(file.content_type, len(data))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    checksum = storage_svc.sha256_hex(data)
    object_path = storage_svc.unique_object_name(f"document-templates/{template_id}", file.filename or "file")
    bucket, path, size = storage_svc.upload_file(data, content_type, object_path)

    record = file_repo.create(
        db,
        original_filename=file.filename or "file",
        storage_path=path,
        bucket=bucket,
        content_type=content_type,
        size_bytes=size,
        checksum_sha256=checksum,
        entity_type="document_template",
        entity_id=template_id,
        uploaded_by=current_user.id,
    )

    resp = StoredFileResponse.model_validate(record)
    resp.url = storage_svc.get_presigned_url(record.storage_path, record.bucket)
    return resp


@router.delete("/{template_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a template image")
def delete_document_template_file(
    template_id: uuid.UUID,
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_not_viewer),
) -> None:
    f = file_repo.get_by_id(db, file_id)
    if not f or f.entity_id != template_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    storage_svc.delete_file(f.storage_path, f.bucket)
    file_repo.delete(db, file_id)
