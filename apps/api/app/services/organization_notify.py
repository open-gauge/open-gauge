"""Notifications for organization join requests.

The in-app Notification row is the guaranteed channel — it's created
synchronously in the request's own session so it's never lost and is visible
immediately. Email (when SMTP is configured) is a best-effort bonus on top,
sent from a FastAPI background task with its own short-lived session, the
same shape as services/notifications.py, since SMTP I/O shouldn't block the
response and must never surface as an API error.
"""
import logging
import uuid

from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.database import SessionLocal
from ..models.notification_preference import NotificationCategory
from ..models.organization import Organization
from ..models.organization_join_request import OrganizationJoinRequest
from ..models.organization_member import OrgRole
from ..models.user import User
from ..repositories import notification as notification_repo
from ..repositories import notification_preference as notification_preference_repo
from ..repositories import organization as org_repo
from . import mail as mail_svc
from . import mail_templates

logger = logging.getLogger(__name__)


def _org_url(org_id: uuid.UUID) -> str:
    return f"{settings.frontend_url.rstrip('/')}/organizations/{org_id}"


def create_join_request_notifications(db: Session, org: Organization, requester: User) -> None:
    """Synchronous: one Notification row per admin of `org`, in the caller's
    own session — called directly from the join-request endpoint, not as a
    background task, so it's committed atomically with the request itself."""
    admins = [m for m in org_repo.list_members(db, org.id) if m.role == OrgRole.admin]
    for membership in admins:
        if not notification_preference_repo.is_enabled(
            db, membership.user_id, NotificationCategory.organization_join_request.value, "in_app"
        ):
            continue
        notification_repo.create(
            db,
            user_id=membership.user_id,
            type="organization.join_requested",
            title=f"{requester.name} requested to join {org.name}",
            body=f"{requester.email} is asking to join {org.name}.",
            link=f"/organizations/{org.id}?edit=1",
            entity_type="organization",
            entity_id=org.id,
        )


def create_join_decision_notification(db: Session, request: OrganizationJoinRequest, org: Organization, approved: bool) -> None:
    """Synchronous counterpart to create_join_request_notifications, for the
    requester once an admin approves/rejects."""
    if not notification_preference_repo.is_enabled(
        db, request.user_id, NotificationCategory.organization_join_decision.value, "in_app"
    ):
        return
    notification_repo.create(
        db,
        user_id=request.user_id,
        type="organization.join_approved" if approved else "organization.join_rejected",
        title=f"Your request to join {org.name} was {'approved' if approved else 'declined'}",
        link=f"/organizations/{org.id}",
        entity_type="organization",
        entity_id=org.id,
    )


def send_join_request_emails(organization_id: uuid.UUID, requester_id: uuid.UUID) -> None:
    """Background task: best-effort email to every admin, if SMTP is configured."""
    with SessionLocal() as db:
        if not mail_svc.is_enabled(db):
            return
        org = org_repo.get_by_id(db, organization_id)
        requester = db.query(User).filter(User.id == requester_id).first()
        if not org or not requester:
            return

        admins = [m for m in org_repo.list_members(db, org.id) if m.role == OrgRole.admin]
        subject, html_body, text_body = mail_templates.render_organization_join_request_email(
            org.name, requester.name, requester.email, _org_url(org.id)
        )
        for membership in admins:
            if not notification_preference_repo.is_enabled(
                db, membership.user_id, NotificationCategory.organization_join_request.value, "email"
            ):
                continue
            admin_user = db.query(User).filter(User.id == membership.user_id).first()
            if not admin_user:
                continue
            try:
                mail_svc.send_email(db, admin_user.email, subject, html_body, text_body)
            except mail_svc.MailError:
                logger.warning("Failed to email org admin %s about join request", admin_user.email)


def send_join_decision_email(request_id: uuid.UUID, approved: bool) -> None:
    """Background task: best-effort email to the requester, if SMTP is configured."""
    with SessionLocal() as db:
        if not mail_svc.is_enabled(db):
            return
        request = db.query(OrganizationJoinRequest).filter(OrganizationJoinRequest.id == request_id).first()
        if not request:
            return
        org = org_repo.get_by_id(db, request.organization_id)
        requester = db.query(User).filter(User.id == request.user_id).first()
        if not org or not requester:
            return
        if not notification_preference_repo.is_enabled(
            db, requester.id, NotificationCategory.organization_join_decision.value, "email"
        ):
            return

        subject, html_body, text_body = mail_templates.render_organization_join_decided_email(
            org.name, approved, _org_url(org.id)
        )
        try:
            mail_svc.send_email(db, requester.email, subject, html_body, text_body)
        except mail_svc.MailError:
            logger.warning("Failed to email %s about join decision", requester.email)
