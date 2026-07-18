import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.database import SessionLocal, get_db
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
from ...services import database_admin_service as db_admin_svc
from ...services import mail as mail_svc

router = APIRouter(prefix="/admin", tags=["Admin"])

_START_TIME = time.time()


def _require_admin(user: User) -> None:
    if not (user.is_superuser or user.role in ("superadmin", "admin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")


def _require_superuser(user: User) -> None:
    """Stricter than _require_admin — the database export/import/reset endpoints
    can destroy every organization's data, not just the current one."""
    if not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin only")


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
        api_version=settings.app_version,
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


# ---------------------------------------------------------------------------
# Database — export/import/reset the whole PostgreSQL database. Destructive,
# superadmin-only, and logged to the audit trail. Lives under Admin -> Database
# in the UI, behind an explicit confirmation on every action.
# ---------------------------------------------------------------------------

class DatabaseResetRequest(BaseModel):
    confirm: str


def _log_database_action(db: Session, request: Request, current_user: User, action: str) -> None:
    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action=action,
        entity_type="database",
        entity_id=None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


@router.get("/database/export")
def export_database(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Download a full PostgreSQL dump (pg_dump custom format) of the entire
    database — every organization, asset, calibration, and user. Superadmin
    only. Restore it with POST /admin/database/import."""
    _require_superuser(current_user)
    try:
        dump = db_admin_svc.export_database()
    except db_admin_svc.DatabaseAdminError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    _log_database_action(db, request, current_user, "database.exported")

    filename = f"opengauge-backup-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.dump"
    return Response(
        content=dump,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/database/import", status_code=status.HTTP_204_NO_CONTENT)
def import_database(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(...),
) -> None:
    """Restore a pg_dump custom-format archive produced by GET /admin/database/export,
    replacing every table's contents. Superadmin only — this overwrites the
    entire database, including the account making the request."""
    _require_superuser(current_user)
    dump = file.file.read()
    actor_email = current_user.email
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    # Close this session's connection before pg_restore --clean drops and
    # recreates objects out from under it. Logging beforehand would be
    # pointless too — --clean wipes the audit_logs table along with everything
    # else, so any entry written on this session is discarded by the restore.
    db.close()

    try:
        db_admin_svc.import_database(dump)
    except db_admin_svc.DatabaseAdminError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    # Log against the just-restored database, in a fresh session, with no
    # actor_id — the restored data is a different snapshot and may not
    # contain this account at all. Best-effort: a logging failure here
    # shouldn't surface as an error for an otherwise-successful restore.
    try:
        with SessionLocal() as fresh_db:
            audit_log_repo.create(
                fresh_db,
                actor_email=actor_email,
                action="database.imported",
                entity_type="database",
                ip_address=ip_address,
                user_agent=user_agent,
            )
    except Exception:
        pass


@router.post("/database/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_database(
    body: DatabaseResetRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete every organization, asset, location, procedure, calibration, and
    non-superadmin user, and empty file storage — resetting the app to the
    same clean state a fresh install starts in. Superadmin accounts (including
    the caller) are preserved. Superadmin only; requires the literal
    confirmation string "RESET" to guard against an accidental call."""
    _require_superuser(current_user)
    if body.confirm != "RESET":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Type "RESET" to confirm this action.',
        )

    # Logged *after* the wipe — reset_to_clean_state truncates audit_logs like
    # every other table, so anything written beforehand would be discarded.
    # Superadmins keep their id across the reset, so the FK on actor_id holds.
    db_admin_svc.reset_to_clean_state(db)
    _log_database_action(db, request, current_user, "database.reset")
