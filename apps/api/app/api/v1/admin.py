import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.asset import Asset
from ...models.calibration import Calibration
from ...models.calibration_method import Procedure
from ...models.email_settings import EmailSettings
from ...models.organization import Organization
from ...models.team import Team
from ...models.user import User
from ...repositories import audit_log as audit_log_repo
from ...repositories import email_settings as email_settings_repo
from ...schemas.email_settings import EmailSettingsResponse, EmailSettingsUpdate, TestEmailRequest
from ...services import mail as mail_svc

router = APIRouter(prefix="/admin", tags=["Admin"])

_START_TIME = time.time()


def _require_admin(user: User) -> None:
    if not (user.is_superuser or user.role in ("superadmin", "admin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")


class AdminStatsResponse(BaseModel):
    assets: int
    procedures: int
    calibrations: int
    users: int
    organizations: int
    teams: int


class AdminSystemResponse(BaseModel):
    uptime_seconds: float
    db_status: str
    api_version: str


@router.get("/stats", response_model=AdminStatsResponse)
def get_admin_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AdminStatsResponse:
    _require_admin(current_user)

    def count(model, *filters):  # type: ignore[no-untyped-def]
        q = db.query(func.count(model.id))
        for f in filters:
            q = q.filter(f)
        return q.scalar() or 0

    return AdminStatsResponse(
        assets=count(Asset, Asset.is_active.is_(True)),
        procedures=count(Procedure, Procedure.is_active.is_(True)),
        calibrations=count(Calibration, Calibration.is_active.is_(True)),
        users=count(User, User.is_active.is_(True)),
        organizations=count(Organization, Organization.is_active.is_(True)),
        teams=count(Team, Team.is_active.is_(True)),
    )


@router.get("/system", response_model=AdminSystemResponse)
def get_admin_system(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AdminSystemResponse:
    _require_admin(current_user)
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return AdminSystemResponse(
        uptime_seconds=round(time.time() - _START_TIME, 1),
        db_status="ok" if db_ok else "error",
        api_version="0.1.0",
    )


# ---------------------------------------------------------------------------
# Email settings — SMTP configuration for registration and calibration
# notification emails. Admin/superadmin only.
# ---------------------------------------------------------------------------

def _email_settings_response(settings: EmailSettings) -> EmailSettingsResponse:
    return EmailSettingsResponse(
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_username=settings.smtp_username,
        has_smtp_password=bool(settings.smtp_password),
        smtp_use_tls=settings.smtp_use_tls,
        from_email=settings.from_email,
        from_name=settings.from_name,
        enabled=settings.enabled,
        calibration_reminder_days=settings.calibration_reminder_days,
        updated_at=settings.updated_at,
    )


@router.get("/email-settings", response_model=EmailSettingsResponse)
def get_email_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmailSettingsResponse:
    """Get the SMTP configuration used for registration and calibration
    notification emails. The password is never returned — only whether one is
    set. Admin/superadmin only."""
    _require_admin(current_user)
    settings = email_settings_repo.get_or_create(db)
    return _email_settings_response(settings)


@router.put("/email-settings", response_model=EmailSettingsResponse)
def update_email_settings(
    body: EmailSettingsUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmailSettingsResponse:
    """Update the SMTP configuration. Fields are partial: omit smtp_password to
    leave it unchanged, or pass an empty string to clear it. Admin/superadmin
    only; the change is recorded in the audit log with the password redacted."""
    _require_admin(current_user)
    settings = email_settings_repo.get_or_create(db)

    before = _email_settings_response(settings).model_dump(mode="json")

    updates = body.model_dump(exclude_unset=True)
    # Omitted field leaves the stored password unchanged; "" explicitly clears it.
    if "smtp_password" in updates:
        settings.smtp_password = updates.pop("smtp_password") or None

    settings = email_settings_repo.update(db, settings, updated_by=current_user.id, **updates)

    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="email_settings.updated",
        entity_type="email_settings",
        entity_id=settings.id,
        before_state=before,
        after_state=_email_settings_response(settings).model_dump(mode="json"),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return _email_settings_response(settings)


@router.post("/email-settings/test", status_code=status.HTTP_204_NO_CONTENT)
def send_test_email(
    body: TestEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Send a one-off test email using the currently saved SMTP settings, to
    verify the configuration works before relying on it. Admin/superadmin only."""
    _require_admin(current_user)
    settings = email_settings_repo.get_or_create(db)
    try:
        mail_svc.send_test_email(settings, body.to_email)
    except mail_svc.MailError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
