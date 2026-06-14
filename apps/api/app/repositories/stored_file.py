import uuid

from sqlalchemy.orm import Session

from ..models.stored_file import StoredFile


def list_by_entity(db: Session, entity_id: uuid.UUID) -> list[StoredFile]:
    return (
        db.query(StoredFile)
        .filter(StoredFile.entity_id == entity_id)
        .order_by(StoredFile.created_at.desc())
        .all()
    )
