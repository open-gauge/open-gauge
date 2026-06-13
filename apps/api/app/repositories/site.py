import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models.site import Site


def get_by_id(db: Session, site_id: uuid.UUID) -> Site | None:
    return db.query(Site).filter(Site.id == site_id).first()


def list_sites(db: Session, skip: int = 0, limit: int = 50, organization_id: uuid.UUID | None = None, is_active: bool | None = None) -> list[Site]:
    q = db.query(Site)
    if organization_id:
        q = q.filter(Site.organization_id == organization_id)
    if is_active is not None:
        q = q.filter(Site.is_active == is_active)
    return q.order_by(Site.name).offset(skip).limit(limit).all()


def create(db: Session, organization_id: uuid.UUID, name: str, created_by: uuid.UUID, description: str | None = None, location: str | None = None) -> Site:
    site = Site(organization_id=organization_id, name=name, description=description, location=location, created_by=created_by)
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


def update(db: Session, site: Site, **kwargs) -> Site:
    for key, value in kwargs.items():
        if value is not None:
            setattr(site, key, value)
    db.commit()
    db.refresh(site)
    return site


def archive(db: Session, site: Site) -> Site:
    site.is_active = False
    site.archived_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(site)
    return site
