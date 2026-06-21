import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.calibration_method import Procedure
from ...models.user import User
from ...repositories import stored_file as file_repo
from ...schemas.procedure import ProcedureCreate, ProcedureResponse, ProcedureUpdate
from ...schemas.stored_file import StoredFileResponse
from ...services import storage as storage_svc

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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    return proc


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
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ProcedureResponse:
    proc = db.query(Procedure).filter(Procedure.id == proc_pk).first()
    if not proc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procedure not found")
    data = body.model_dump(exclude_unset=True)
    for field in ("equipment", "materials", "environment", "steps", "acceptance_criteria"):
        if field in data and data[field]:
            data[field] = [item.model_dump() if hasattr(item, "model_dump") else item for item in data[field]]
    for k, v in data.items():
        setattr(proc, k, v)
    db.commit()
    db.refresh(proc)
    return proc


@router.delete("/{proc_pk}", status_code=status.HTTP_204_NO_CONTENT)
def delete_procedure(
    proc_pk: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    proc = db.query(Procedure).filter(Procedure.id == proc_pk).first()
    if not proc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Procedure not found")
    proc.is_active = False
    db.commit()


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
    current_user: User = Depends(get_current_user),
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
    _: User = Depends(get_current_user),
) -> None:
    f = file_repo.get_by_id(db, file_id)
    if not f or f.entity_id != proc_pk:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    storage_svc.delete_file(f.storage_path, f.bucket)
    file_repo.delete(db, file_id)
