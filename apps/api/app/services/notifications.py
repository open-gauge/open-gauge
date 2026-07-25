"""Notifications to a calibration's owning organization when a new
calibration is recorded: an in-app Notification row (the guaranteed channel)
plus a best-effort email if SMTP is configured.

The public entry point runs as a FastAPI background task *after* the response
has already been sent, so it opens its own short-lived DB session rather than
reusing the request-scoped one (which FastAPI closes before background tasks
run). Never raise: a failed notification must never surface as an API error.
"""
import logging
import uuid

from ..core.database import SessionLocal
from ..models.asset import Asset
from ..models.calibration import Calibration
from ..models.notification_preference import NotificationCategory
from ..models.organization_member import OrganizationMember
from ..models.user import User, UserRole
from ..repositories import notification as notification_repo
from ..repositories import notification_preference as notification_preference_repo
from .certificate_service import resolve_organization
from . import mail as mail_svc
from . import mail_templates

logger = logging.getLogger(__name__)


def org_member_users(
    db, asset: Asset, calibration: Calibration, exclude_user_id: uuid.UUID | None
) -> list[User]:
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
    return query.all()


def org_member_emails(
    db, asset: Asset, calibration: Calibration, exclude_user_id: uuid.UUID | None
) -> list[str]:
    return [u.email for u in org_member_users(db, asset, calibration, exclude_user_id)]


def notify_new_calibration(calibration_id: uuid.UUID, actor_id: uuid.UUID) -> None:
    """Background task entry point: opens its own session (see module docstring)."""
    with SessionLocal() as db:
        _notify_new_calibration(db, calibration_id, actor_id)


def _notify_new_calibration(db, calibration_id: uuid.UUID, actor_id: uuid.UUID) -> None:
    """Core logic, exposed separately so tests can drive it with the
    test-transaction session (same split as services/calibration_reminders.sweep)."""
    cal = db.query(Calibration).filter(Calibration.id == calibration_id).first()
    if not cal:
        return
    asset = db.query(Asset).filter(Asset.id == cal.asset_id).first()
    if not asset:
        return
    recipients = org_member_users(db, asset, cal, exclude_user_id=actor_id)
    if not recipients:
        return

    category = NotificationCategory.calibration_created.value
    actor = db.query(User).filter(User.id == actor_id).first()
    performed_by = actor.name if actor else cal.performed_by_name

    # In-app is the guaranteed channel — created regardless of whether SMTP
    # is configured, same as organization join-request notifications.
    for user in recipients:
        if notification_preference_repo.is_enabled(db, user.id, category, "in_app"):
            notification_repo.create(
                db,
                user_id=user.id,
                type="calibration.created",
                title=f"New calibration recorded for {asset.name}",
                body=f"{performed_by} recorded a calibration due {cal.due_date.isoformat()}.",
                link=f"/assets/{asset.id}",
                entity_type="asset",
                entity_id=asset.id,
            )

    if not mail_svc.is_enabled(db):
        return
    subject, html_body, text_body = mail_templates.render_calibration_created_email(
        asset.name, asset.asset_id, cal.due_date, performed_by
    )
    for user in recipients:
        if not notification_preference_repo.is_enabled(db, user.id, category, "email"):
            continue
        try:
            mail_svc.send_email(db, user.email, subject, html_body, text_body)
        except mail_svc.MailError:
            logger.warning("Failed to notify %s about calibration %s", user.email, calibration_id)
