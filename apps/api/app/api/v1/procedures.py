import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user, require_admin, require_not_viewer
from ...models.calibration_method import Procedure
from ...models.user import User
from ...repositories import audit_log as audit_log_repo
from ...repositories import stored_file as file_repo
from ...schemas.procedure import ProcedureBulkExportRequest, ProcedureCreate, ProcedureResponse, ProcedureUpdate
from ...schemas.procedure_import import ProcedureImportPreview, ProcedureImportResponse
from ...schemas.stored_file import StoredFileResponse
from ...services import procedure_export as export_svc
from ...services import procedure_import as import_svc
from ...services import storage as storage_svc
from ...utils.audit_diff import diff_snapshots, snapshot

router = APIRouter(prefix="/procedures", tags=["Procedures"])


@router.get("", response_model=list[ProcedureResponse])
def list_procedures(
    q: str | None = None,
    physical_quantity: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[ProcedureResponse]:
    query = db.query(Procedure).filter(Procedure.is_active == True)  # noqa: E712
    if physical_quantity:
        query = query.filter(Procedure.physical_quantity == physical_quantity)
    if q:
        query = query.filter(Procedure.name.ilike(f"%{q}%"))
    return query.order_by(Procedure.proc_id.nullslast(), Procedure.name).all()


@router.post("", response_model=ProcedureResponse, status_code=status.HTTP_201_CREATED)
def create_procedure(
    body: ProcedureCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> ProcedureResponse:
    existing = db.query(Procedure).filter(Procedure.proc_id == body.proc_id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Procedure ID already exists")
    data = body.model_dump()
    # Serialize nested Pydantic objects to dicts for JSONB columns
    for field in ("equipment", "materials", "environment", "steps", "acceptance_criteria"):
        if data.get(field):
            data[field] = [item.model_dump() if hasattr(item, "model_dump") else item for item in data[field]]
    proc = Procedure(**data, created_by=current_user.id)
    db.add(proc)
    db.commit()
    db.refresh(proc)
    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="procedure.created",
        entity_type="procedure",
        entity_id=proc.id,
        after_state={"name": proc.name, "proc_id": proc.proc_id},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return proc


@router.post(
    "/export/bulk",
    summary="Bulk export procedures",
    description="Export multiple procedures as one ZIP archive, one folder per procedure "
    "(metadata + steps + associated step attachments). Admin/superadmin only.",
    tags=["Procedures"],
)
def export_procedures_bulk(
    body: ProcedureBulkExportRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Response:
    procedures = [
        p for pk in body.proc_ids
        if (p := db.query(Procedure).filter(Procedure.id == pk).first())
    ]
    if not procedures:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No matching procedures found")
    zip_bytes = export_svc.build_bulk_export_zip(db, procedures)
    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="procedure.exported_bulk",
        entity_type="procedure",
        entity_id=None,
        after_state={"proc_ids": [p.proc_id for p in procedures], "count": len(procedures)},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="procedures-export-{stamp}.zip"'},
    )


@router.post(
    "/import/validate",
    response_model=ProcedureImportPreview,
    summary="Validate a single-procedure import ZIP",
    description="Check whether a ZIP contains exactly one valid, importable procedure (used by the "
    "'New Procedure → Import from file' flow). Never creates anything — always returns 200 with a "
    "`valid` flag rather than an error status, so the UI can show either the procedure preview or a "
    "plain 'not a valid procedure' message. Admin/superadmin only.",
    tags=["Procedures"],
)
async def validate_import_zip(
    file: UploadFile = File(...),
    _: User = Depends(require_admin),
) -> ProcedureImportPreview:
    data = await file.read()
    return import_svc.preview_procedure_zip(data)


@router.post(
    "/import",
    response_model=ProcedureImportResponse,
    summary="Import procedures from a ZIP",
    description="Import one or more procedures from a ZIP archive produced by the procedure export "
    "feature. Each top-level folder containing a procedure.yaml is imported independently — "
    "a failure importing one procedure does not block the others in the same file. Used by both "
    "the registry's bulk 'Import' button and the 'New Procedure → Import from file' flow. "
    "Admin/superadmin only.",
    tags=["Procedures"],
)
async def import_procedures(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> ProcedureImportResponse:
    data = await file.read()
    results = import_svc.import_procedures_zip(db, data, created_by=current_user.id)
    db.commit()
    for r in results:
        audit_log_repo.create(
            db,
            actor_id=current_user.id,
            actor_email=current_user.email,
            action="procedure.imported" if r.status == "created" else "procedure.import_failed",
            entity_type="procedure",
            entity_id=r.new_proc_pk,
            after_state={"source_folder": r.source_folder, "error_message": r.error_message}
            if r.status == "error" else None,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    return ProcedureImportResponse(results=results)


@router.get("/{proc_pk}", response_model=ProcedureResponse)
def get_procedure(
    proc_pk: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ProcedureResponse:
    proc = db.query(Procedure).filter(Procedure.id == proc_pk).first()
    if not proc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procedure not found")
    return proc


@router.put("/{proc_pk}", response_model=ProcedureResponse)
def update_procedure(
    proc_pk: uuid.UUID,
    body: ProcedureUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> ProcedureResponse:
    proc = db.query(Procedure).filter(Procedure.id == proc_pk).first()
    if not proc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procedure not found")
    data = body.model_dump(exclude_unset=True)

    new_proc_id = data.get("proc_id")
    if new_proc_id and new_proc_id != proc.proc_id:
        existing = db.query(Procedure).filter(Procedure.proc_id == new_proc_id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Procedure ID already exists")

    for field in ("equipment", "materials", "environment", "steps", "acceptance_criteria"):
        if field in data and data[field]:
            data[field] = [item.model_dump() if hasattr(item, "model_dump") else item for item in data[field]]

    before = snapshot(proc, data.keys())
    for k, v in data.items():
        setattr(proc, k, v)
    db.commit()
    db.refresh(proc)
    after = snapshot(proc, data.keys())
    before_state, after_state = diff_snapshots(before, after)

    if before_state or after_state:
        audit_log_repo.create(
            db,
            actor_id=current_user.id,
            actor_email=current_user.email,
            action="procedure.updated",
            entity_type="procedure",
            entity_id=proc.id,
            before_state=before_state,
            after_state=after_state,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    return proc


@router.delete("/{proc_pk}", status_code=status.HTTP_204_NO_CONTENT)
def delete_procedure(
    proc_pk: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> None:
    proc = db.query(Procedure).filter(Procedure.id == proc_pk).first()
    if not proc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procedure not found")
    proc.is_active = False
    db.commit()
    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="procedure.deactivated",
        entity_type="procedure",
        entity_id=proc.id,
        after_state={"name": proc.name, "proc_id": proc.proc_id},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


@router.get(
    "/{proc_pk}/export",
    summary="Export a procedure",
    description="Export a single procedure as a downloadable ZIP archive: procedure.yaml with all "
    "metadata and steps, plus a media/ folder with the step attachments. Admin/superadmin only.",
    tags=["Procedures"],
)
def export_procedure(
    proc_pk: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Response:
    proc = db.query(Procedure).filter(Procedure.id == proc_pk).first()
    if not proc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procedure not found")
    zip_bytes = export_svc.build_procedure_export_zip(db, proc)
    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="procedure.exported",
        entity_type="procedure",
        entity_id=proc.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    filename = proc.proc_id or str(proc.id)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}.zip"'},
    )


# ---------------------------------------------------------------------------
# Procedure step file attachments
# ---------------------------------------------------------------------------

def _enrich_files(files: list) -> list[StoredFileResponse]:
    result = []
    for f in files:
        resp = StoredFileResponse.model_validate(f)
        resp.url = storage_svc.get_presigned_url(f.storage_path, f.bucket)
        result.append(resp)
    return result


@router.get("/{proc_pk}/files", response_model=list[StoredFileResponse])
def list_procedure_files(
    proc_pk: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[StoredFileResponse]:
    proc = db.query(Procedure).filter(Procedure.id == proc_pk).first()
    if not proc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procedure not found")
    return _enrich_files(file_repo.list_by_entity(db, proc_pk))


@router.post("/{proc_pk}/files", response_model=StoredFileResponse, status_code=status.HTTP_201_CREATED)
async def upload_procedure_step_file(
    proc_pk: uuid.UUID,
    step_index: int = Query(..., ge=0),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> StoredFileResponse:
    proc = db.query(Procedure).filter(Procedure.id == proc_pk).first()
    if not proc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procedure not found")

    data = await file.read()
    checksum = storage_svc.sha256_hex(data)
    object_path = storage_svc.unique_object_name(
        f"procedures/{proc_pk}/steps/{step_index}",
        file.filename or "file",
    )
    content_type = file.content_type or "application/octet-stream"

    bucket, path, size = storage_svc.upload_file(data, content_type, object_path)

    record = file_repo.create(
        db,
        original_filename=file.filename or "file",
        storage_path=path,
        bucket=bucket,
        content_type=content_type,
        size_bytes=size,
        checksum_sha256=checksum,
        entity_type="procedure",
        entity_id=proc_pk,
        uploaded_by=current_user.id,
        step_index=step_index,
    )

    resp = StoredFileResponse.model_validate(record)
    resp.url = storage_svc.get_presigned_url(record.storage_path, record.bucket)
    return resp


@router.delete("/{proc_pk}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_procedure_file(
    proc_pk: uuid.UUID,
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_not_viewer),
) -> None:
    f = file_repo.get_by_id(db, file_id)
    if not f or f.entity_id != proc_pk:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    storage_svc.delete_file(f.storage_path, f.bucket)
    file_repo.delete(db, file_id)
