import uuid

from sqlalchemy.orm import Session

from ..models.organization import Organization


def get_by_id(db: Session, org_id: uuid.UUID) -> Organization | None:
    return db.query(Organization).filter(Organization.id == org_id).first()


def list_organizations(db: Session, skip: int = 0, limit: int = 50, is_active: bool | None = None) -> list[Organization]:
    q = db.query(Organization)
    if is_active is not None:
        q = q.filter(Organization.is_active == is_active)
    return q.order_by(Organization.name).offset(skip).limit(limit).all()


def create(db: Session, name: str, description: str | None = None) -> Organization:
    org = Organization(name=name, description=description)
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def update(db: Session, org: Organization, **kwargs) -> Organization:
    for key, value in kwargs.items():
        if value is not None:
            setattr(org, key, value)
    db.commit()
    db.refresh(org)
    return org


def deactivate(db: Session, org: Organization) -> Organization:
    org.is_active = False
    db.commit()
    db.refresh(org)
    return org


def set_logo(db: Session, org: Organization, file_id: uuid.UUID | None) -> Organization:
    org.logo_file_id = file_id
    db.commit()
    db.refresh(org)
    return org
