"""Best-effort email notifications to a calibration's owning organization.

These run as FastAPI background tasks *after* the response has already been
sent, so each entry point opens its own short-lived DB session rather than
reusing the request-scoped one (which FastAPI closes before background tasks
run). Never raise: a failed notification must never surface as an API error.
"""
import logging
import uuid

from ..core.database import SessionLocal
from ..models.asset import Asset
from ..models.calibration import Calibration
from ..models.organization_member import OrganizationMember
from ..models.user import User, UserRole
from .certificate_service import resolve_organization
from . import mail as mail_svc
from . import mail_templates

logger = logging.getLogger(__name__)


def org_member_emails(
    db, asset: Asset, calibration: Calibration, exclude_user_id: uuid.UUID | None
) -> list[str]:
    """Active Technician/Admin/Super Admin users who are active members of the
    asset's organization (resolved the same way certificates are: the asset's
    own organization_id, falling back to its location, then the performing
    user's organization). Viewers are excluded — they can't act on a
    calibration, so notifying them would be noise."""
    organization = resolve_organization(db, asset, calibration)
    if not organization:
        return []
    query = (
        db.query(User)
        .join(OrganizationMember, OrganizationMember.user_id == User.id)
        .filter(
            OrganizationMember.organization_id == organization.id,
            OrganizationMember.active.is_(True),
            User.is_active.is_(True),
            User.role != UserRole.viewer,
        )
    )
    if exclude_user_id:
        query = query.filter(User.id != exclude_user_id)
    return [u.email for u in query.all()]


def notify_new_calibration(calibration_id: uuid.UUID, actor_id: uuid.UUID) -> None:
    with SessionLocal() as db:
        if not mail_svc.is_enabled(db):
            return
        cal = db.query(Calibration).filter(Calibration.id == calibration_id).first()
        if not cal:
            return
        asset = db.query(Asset).filter(Asset.id == cal.asset_id).first()
        if not asset:
            return
        recipients = org_member_emails(db, asset, cal, exclude_user_id=actor_id)
        if not recipients:
            return
        actor = db.query(User).filter(User.id == actor_id).first()
        performed_by = actor.name if actor else cal.performed_by_name
        subject, html_body, text_body = mail_templates.render_calibration_created_email(
            asset.name, asset.asset_id, cal.due_date, performed_by
        )
        for email in recipients:
            try:
                mail_svc.send_email(db, email, subject, html_body, text_body)
            except mail_svc.MailError:
                logger.warning("Failed to notify %s about calibration %s", email, calibration_id)
