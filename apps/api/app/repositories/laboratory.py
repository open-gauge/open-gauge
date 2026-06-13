import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models.laboratory import Laboratory


def get_by_id(db: Session, lab_id: uuid.UUID) -> Laboratory | None:
    return db.query(Laboratory).filter(Laboratory.id == lab_id).first()


def list_laboratories(db: Session, skip: int = 0, limit: int = 50, site_id: uuid.UUID | None = None, is_active: bool | None = None) -> list[Laboratory]:
    q = db.query(Laboratory)
    if site_id:
        q = q.filter(Laboratory.site_id == site_id)
    if is_active is not None:
        q = q.filter(Laboratory.is_active == is_active)
    return q.order_by(Laboratory.name).offset(skip).limit(limit).all()


def create(db: Session, site_id: uuid.UUID, name: str, created_by: uuid.UUID, description: str | None = None) -> Laboratory:
    lab = Laboratory(site_id=site_id, name=name, description=description, created_by=created_by)
    db.add(lab)
    db.commit()
    db.refresh(lab)
    return lab


def update(db: Session, lab: Laboratory, **kwargs) -> Laboratory:
    for key, value in kwargs.items():
        if value is not None:
            setattr(lab, key, value)
    db.commit()
    db.refresh(lab)
    return lab


def archive(db: Session, lab: Laboratory) -> Laboratory:
    lab.is_active = False
    lab.archived_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(lab)
    return lab
