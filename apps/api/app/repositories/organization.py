import uuid

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.asset import Asset
from ..models.organization import Organization
from ..models.organization_member import OrganizationMember, OrgRole
from ..models.user import User


def get_by_id(db: Session, org_id: uuid.UUID) -> Organization | None:
    return db.query(Organization).filter(Organization.id == org_id).first()


def list_organizations(db: Session, skip: int = 0, limit: int = 50, is_active: bool | None = None) -> list[Organization]:
    q = db.query(Organization)
    if is_active is not None:
        q = q.filter(Organization.is_active == is_active)
    return q.order_by(Organization.name).offset(skip).limit(limit).all()


def create(
    db: Session,
    name: str,
    full_name: str | None = None,
    description: str | None = None,
    website: str | None = None,
    location_id: uuid.UUID | None = None,
    email: str | None = None,
    phone: str | None = None,
    private: bool = False,
) -> Organization:
    org = Organization(
        name=name,
        full_name=full_name,
        description=description,
        website=website,
        location_id=location_id,
        email=email,
        phone=phone,
        private=private,
    )
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


def count_assets(db: Session, org_id: uuid.UUID) -> int:
    return (
        db.query(func.count(Asset.id))
        .filter(Asset.organization_id == org_id, Asset.is_active.is_(True))
        .scalar()
        or 0
    )


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------

def list_members(db: Session, org_id: uuid.UUID, active_only: bool = True) -> list[OrganizationMember]:
    q = db.query(OrganizationMember).filter(OrganizationMember.organization_id == org_id)
    if active_only:
        q = q.filter(OrganizationMember.active.is_(True))
    return q.order_by(OrganizationMember.created_at).all()


def count_members(db: Session, org_id: uuid.UUID) -> int:
    return (
        db.query(func.count(OrganizationMember.id))
        .filter(OrganizationMember.organization_id == org_id, OrganizationMember.active.is_(True))
        .scalar()
        or 0
    )


def upsert_membership(
    db: Session, org_id: uuid.UUID, user_id: uuid.UUID, role: OrgRole = OrgRole.member
) -> OrganizationMember:
    """Create a new membership, or reactivate/update the role of an existing
    (possibly inactive, from a past leave/removal) one — the unique
    (organization_id, user_id) constraint means there's ever at most one row
    per pair, so history is preserved rather than duplicated."""
    membership = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.organization_id == org_id, OrganizationMember.user_id == user_id)
        .first()
    )
    if membership:
        membership.role = role
        membership.active = True
    else:
        membership = OrganizationMember(organization_id=org_id, user_id=user_id, role=role, active=True)
        db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


def set_member_role(db: Session, membership: OrganizationMember, role: OrgRole) -> OrganizationMember:
    membership.role = role
    db.commit()
    db.refresh(membership)
    return membership


def deactivate_membership(db: Session, membership: OrganizationMember) -> OrganizationMember:
    membership.active = False
    db.commit()
    db.refresh(membership)
    return membership


def list_non_members(db: Session, org_id: uuid.UUID, q: str | None = None, limit: int = 50) -> list[User]:
    """Active users with no active membership in this org — candidates for
    the Add Member modal's dropdown."""
    active_member_ids = (
        db.query(OrganizationMember.user_id)
        .filter(OrganizationMember.organization_id == org_id, OrganizationMember.active.is_(True))
    )
    query = db.query(User).filter(User.is_active.is_(True), User.id.notin_(active_member_ids))
    if q:
        pattern = f"%{q}%"
        query = query.filter(or_(User.name.ilike(pattern), User.email.ilike(pattern)))
    return query.order_by(User.name).limit(limit).all()


def list_user_organizations(db: Session, user_id: uuid.UUID) -> list[Organization]:
    """Every organization the user is an active member of, oldest membership first."""
    return (
        db.query(Organization)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .filter(OrganizationMember.user_id == user_id, OrganizationMember.active.is_(True))
        .order_by(OrganizationMember.created_at)
        .all()
    )
