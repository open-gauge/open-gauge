import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models.location import Location


def get_by_id(db: Session, location_id: uuid.UUID) -> Location | None:
    return db.query(Location).filter(Location.id == location_id).first()


def list_locations(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    organization_id: uuid.UUID | None = None,
    parent_location_id: uuid.UUID | None = None,
    is_active: bool | None = None,
) -> list[Location]:
    q = db.query(Location)
    if organization_id:
        q = q.filter(Location.organization_id == organization_id)
    if parent_location_id is not None:
        q = q.filter(Location.parent_location_id == parent_location_id)
    if is_active is not None:
        q = q.filter(Location.is_active == is_active)
    return q.order_by(Location.name).offset(skip).limit(limit).all()


def create(db: Session, created_by: uuid.UUID, **kwargs) -> Location:
    location = Location(created_by=created_by, **kwargs)
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


def update(db: Session, location: Location, **kwargs) -> Location:
    for key, value in kwargs.items():
        if value is not None:
            setattr(location, key, value)
    db.commit()
    db.refresh(location)
    return location


def archive(db: Session, location: Location) -> Location:
    location.is_active = False
    location.archived_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(location)
    return location
