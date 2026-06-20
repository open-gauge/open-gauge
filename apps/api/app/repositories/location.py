import uuid
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.asset import Asset
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
) -> list[dict]:
    q = db.query(Location)
    if organization_id:
        q = q.filter(Location.organization_id == organization_id)
    if parent_location_id is not None:
        q = q.filter(Location.parent_location_id == parent_location_id)
    if is_active is not None:
        q = q.filter(Location.is_active == is_active)
    locations = q.order_by(Location.name).offset(skip).limit(limit).all()

    if not locations:
        return []

    # Count active assets per location in a single query
    loc_ids = [loc.id for loc in locations]
    count_rows = (
        db.query(Asset.location_id, func.count(Asset.id))
        .filter(Asset.location_id.in_(loc_ids), Asset.is_active.is_(True))
        .group_by(Asset.location_id)
        .all()
    )
    count_map: dict[str, int] = {str(row[0]): row[1] for row in count_rows}

    result: list[dict] = []
    for loc in locations:
        result.append({
            "id": loc.id,
            "organization_id": loc.organization_id,
            "parent_location_id": loc.parent_location_id,
            "name": loc.name,
            "description": loc.description,
            "location_type": loc.location_type,
            "code": loc.code,
            "address": loc.address,
            "latitude": float(loc.latitude) if loc.latitude is not None else None,
            "longitude": float(loc.longitude) if loc.longitude is not None else None,
            "is_active": loc.is_active,
            "archived_at": loc.archived_at,
            "created_by": loc.created_by,
            "created_at": loc.created_at,
            "updated_at": loc.updated_at,
            "asset_count": count_map.get(str(loc.id), 0),
        })
    return result


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
