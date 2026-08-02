"""Notifications for the calibration approval workflow: the assigned checker
is notified when named at creation, and the registrant (performed_by_user_id)
is notified once the checker approves or rejects.

The in-app Notification row is the guaranteed channel — created synchronously
in the request's own session (one cheap insert), same shape as
organization_notify.py. Email (when SMTP is configured) is a best-effort
bonus from a FastAPI background task with its own short-lived session.
"""
import logging
import uuid

from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.database import SessionLocal
from ..models.asset import Asset
from ..models.calibration import Calibration
from ..models.notification_preference import NotificationCategory
from ..models.user import User
from ..repositories import notification as notification_repo
from ..repositories import notification_preference as notification_preference_repo
from . import mail as mail_svc
from . import mail_templates

logger = logging.getLogger(__name__)


def _cal_url(asset_id: uuid.UUID, cal_id: uuid.UUID) -> str:
    return f"{settings.frontend_url.rstrip('/')}/assets/{asset_id}?cal={cal_id}"


def notify_checker_assigned(db: Session, cal: Calibration, asset: Asset, registrant: User) -> None:
    """Synchronous: one Notification row for the assigned checker, in the
    caller's own session — committed atomically with calibration creation."""
    if not cal.checked_by_user_id:
        return
    if not notification_preference_repo.is_enabled(
        db, cal.checked_by_user_id, NotificationCategory.calibration_checker_assigned.value, "in_app"
    ):
        return
    notification_repo.create(
        db,
        user_id=cal.checked_by_user_id,
        type="calibration.checker_assigned",
        title=f"Calibration awaiting your approval for {asset.name}",
        body=f"{registrant.name} registered a calibration for {asset.name} and named you as the checker.",
        link=f"/assets/{asset.id}?cal={cal.id}",
        entity_type="asset",
        entity_id=asset.id,
    )


def notify_decision(db: Session, cal: Calibration, asset: Asset, approved: bool, decided_by: User) -> None:
    """Synchronous counterpart, for the registrant once the checker (or an
    admin override) decides. Skipped entirely if performed_by_user_id is
    null — a free-text/no-account historical registrant has no user to notify."""
    if not cal.performed_by_user_id:
        return
    if not notification_preference_repo.is_enabled(
        db, cal.performed_by_user_id, NotificationCategory.calibration_decided.value, "in_app"
    ):
        return
    notification_repo.create(
        db,
        user_id=cal.performed_by_user_id,
        type="calibration.approved" if approved else "calibration.rejected",
        title=f"Your calibration for {asset.name} was {'approved' if approved else 'rejected'}",
        body=cal.decision_reason if (not approved and cal.decision_reason) else None,
        link=f"/assets/{asset.id}?cal={cal.id}",
        entity_type="asset",
        entity_id=asset.id,
    )


def send_checker_assigned_email(cal_id: uuid.UUID) -> None:
    """Background task: best-effort email to the checker, if SMTP is configured."""
    with SessionLocal() as db:
        if not mail_svc.is_enabled(db):
            return
        cal = db.query(Calibration).filter(Calibration.id == cal_id).first()
        if not cal or not cal.checked_by_user_id:
            return
        asset = db.query(Asset).filter(Asset.id == cal.asset_id).first()
        checker = db.query(User).filter(User.id == cal.checked_by_user_id).first()
        if not asset or not checker:
            return
        if not notification_preference_repo.is_enabled(
            db, checker.id, NotificationCategory.calibration_checker_assigned.value, "email"
        ):
            return
        registrant_name = cal.performed_by_name
        subject, html_body, text_body = mail_templates.render_calibration_checker_assigned_email(
            asset.name, asset.asset_id, registrant_name, _cal_url(asset.id, cal.id)
        )
        try:
            mail_svc.send_email(db, checker.email, subject, html_body, text_body)
        except mail_svc.MailError:
            logger.warning("Failed to email checker %s about calibration %s", checker.email, cal_id)


def send_decision_email(cal_id: uuid.UUID, approved: bool) -> None:
    """Background task: best-effort email to the registrant, if SMTP is configured."""
    with SessionLocal() as db:
        if not mail_svc.is_enabled(db):
            return
        cal = db.query(Calibration).filter(Calibration.id == cal_id).first()
        if not cal or not cal.performed_by_user_id:
            return
        asset = db.query(Asset).filter(Asset.id == cal.asset_id).first()
        registrant = db.query(User).filter(User.id == cal.performed_by_user_id).first()
        if not asset or not registrant:
            return
        if not notification_preference_repo.is_enabled(
            db, registrant.id, NotificationCategory.calibration_decided.value, "email"
        ):
            return
        subject, html_body, text_body = mail_templates.render_calibration_decided_email(
            asset.name, asset.asset_id, approved, cal.decision_reason, _cal_url(asset.id, cal.id)
        )
        try:
            mail_svc.send_email(db, registrant.email, subject, html_body, text_body)
        except mail_svc.MailError:
            logger.warning("Failed to email registrant %s about calibration decision %s", registrant.email, cal_id)
