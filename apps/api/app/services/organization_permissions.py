"""Organization-scoped permission checks.

Kept as plain functions rather than FastAPI dependencies since every check
depends on a specific organization row (loaded inside the route handler),
matching the existing per-row conditional pattern in certificate_templates.py
rather than the flat require_admin/require_superadmin dependencies in deps.py.
"""
import uuid

from sqlalchemy.orm import Session

from ..models.organization import Organization
from ..models.organization_member import OrganizationMember, OrgRole
from ..models.user import User, UserRole


def get_membership(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> OrganizationMember | None:
    return (
        db.query(OrganizationMember)
        .filter(OrganizationMember.organization_id == org_id, OrganizationMember.user_id == user_id)
        .first()
    )


def is_org_admin(db: Session, user: User, org: Organization) -> bool:
    """Super Admin overrides every organization; otherwise only that org's
    own active admin members can manage it — the global `admin` role has no
    special access to an organization it doesn't belong to. Viewer is blocked
    from managing any organization regardless of their per-org role — the
    global RBAC restriction wins over the org-level one for this."""
    if user.role == UserRole.viewer:
        return False
    if user.role == UserRole.superadmin:
        return True
    membership = get_membership(db, org.id, user.id)
    return bool(membership and membership.active and membership.role == OrgRole.admin)


def is_org_member(db: Session, user: User, org: Organization) -> bool:
    if user.role == UserRole.superadmin:
        return True
    membership = get_membership(db, org.id, user.id)
    return bool(membership and membership.active)


def is_last_admin(db: Session, user: User, org: Organization) -> bool:
    """True if the caller's own (real, non-superadmin-override) membership is
    an active admin role and they're the org's only one — used to tailor the
    Leave confirmation before the user even clicks it."""
    membership = get_membership(db, org.id, user.id)
    if not membership or not membership.active or membership.role != OrgRole.admin:
        return False
    return count_active_admins(db, org.id) <= 1


def count_active_admins(db: Session, org_id: uuid.UUID) -> int:
    return (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.active.is_(True),
            OrganizationMember.role == OrgRole.admin,
        )
        .count()
    )
