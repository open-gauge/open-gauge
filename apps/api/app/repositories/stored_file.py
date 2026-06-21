import uuid

from sqlalchemy.orm import Session

from ..models.stored_file import StoredFile


def list_by_entity(db: Session, entity_id: uuid.UUID) -> list[StoredFile]:
    return (
        db.query(StoredFile)
        .filter(StoredFile.entity_id == entity_id)
        .order_by(StoredFile.created_at.asc())
        .all()
    )


def get_by_id(db: Session, file_id: uuid.UUID) -> StoredFile | None:
    return db.query(StoredFile).filter(StoredFile.id == file_id).first()


def create(
    db: Session,
    *,
    original_filename: str,
    storage_path: str,
    bucket: str,
    content_type: str,
    size_bytes: int,
    checksum_sha256: str,
    entity_type: str,
    entity_id: uuid.UUID | None,
    uploaded_by: uuid.UUID,
    step_index: int | None = None,
) -> StoredFile:
    f = StoredFile(
        original_filename=original_filename,
        storage_path=storage_path,
        bucket=bucket,
        content_type=content_type,
        size_bytes=size_bytes,
        checksum_sha256=checksum_sha256,
        entity_type=entity_type,
        entity_id=entity_id,
        uploaded_by=uploaded_by,
        step_index=step_index,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def delete(db: Session, file_id: uuid.UUID) -> bool:
    f = get_by_id(db, file_id)
    if not f:
        return False
    db.delete(f)
    db.commit()
    return True
