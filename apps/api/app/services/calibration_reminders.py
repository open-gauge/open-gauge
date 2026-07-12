"""Daily sweep that emails a calibration's owning team when it's due soon or overdue.

Runs on an in-process scheduler (see main.py) — there's no separate worker process
in this stack, so this stays a lightweight periodic job rather than a queue.
Each calibration is reminded at most once per threshold (due-soon, then overdue),
tracked via due_reminder_sent_at / overdue_reminder_sent_at.
"""
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func

from ..core.database import SessionLocal
from ..models.asset import Asset
from ..models.calibration import Calibration
from ..repositories import email_settings as email_settings_repo
from . import mail as mail_svc
from . import mail_templates
from .notifications import team_member_emails

logger = logging.getLogger(__name__)


def _latest_calibrations(db, asset_ids: list) -> dict:
    """Latest (max due_date) calibration id per asset, as {asset_id: Calibration}."""
    latest_due = dict(
        db.query(Calibration.asset_id, func.max(Calibration.due_date))
        .filter(Calibration.asset_id.in_(asset_ids))
        .group_by(Calibration.asset_id)
        .all()
    )
    if not latest_due:
        return {}
    rows = (
        db.query(Calibration)
        .filter(Calibration.asset_id.in_(asset_ids))
        .order_by(Calibration.asset_id, Calibration.due_date.desc(), Calibration.created_at.desc())
        .all()
    )
    result: dict = {}
    for cal in rows:
        if cal.asset_id in result:
            continue
        if cal.due_date == latest_due.get(cal.asset_id):
            result[cal.asset_id] = cal
    return result


def run_reminder_sweep() -> None:
    """Scheduler entry point: opens its own session (see main.py's daily cron job)."""
    with SessionLocal() as db:
        try:
            sweep(db)
        except Exception:
            logger.exception("Calibration reminder sweep failed")


def sweep(db) -> None:
    """Runs the reminder sweep against the given session. Exposed separately from
    run_reminder_sweep() so tests can drive it with the test-transaction session."""
    if not mail_svc.is_enabled(db):
        return

    email_settings = email_settings_repo.get(db)
    reminder_days = email_settings.calibration_reminder_days if email_settings else 14

    today = date.today()
    due_soon_limit = today + timedelta(days=reminder_days)

    assets = db.query(Asset).filter(Asset.is_active.is_(True), Asset.owner.isnot(None)).all()
    if not assets:
        return
    assets_by_id = {a.id: a for a in assets}

    latest_cals = _latest_calibrations(db, list(assets_by_id.keys()))

    for asset_id, cal in latest_cals.items():
        asset = assets_by_id[asset_id]

        if cal.due_date < today and not cal.overdue_reminder_sent_at:
            _send_reminder(db, asset, cal, overdue=True)
        elif today <= cal.due_date <= due_soon_limit and not cal.due_reminder_sent_at:
            _send_reminder(db, asset, cal, overdue=False)


def _send_reminder(db, asset: Asset, cal: Calibration, overdue: bool) -> None:
    recipients = team_member_emails(db, asset, exclude_user_id=None)
    if not recipients:
        return

    subject, html_body, text_body = mail_templates.render_calibration_reminder_email(
        asset.name, asset.asset_id, cal.due_date, overdue
    )
    sent_any = False
    for email in recipients:
        try:
            mail_svc.send_email(db, email, subject, html_body, text_body)
            sent_any = True
        except mail_svc.MailError:
            logger.warning("Failed to send calibration reminder to %s for asset %s", email, asset.asset_id)

    if sent_any:
        now = datetime.now(timezone.utc)
        if overdue:
            cal.overdue_reminder_sent_at = now
        else:
            cal.due_reminder_sent_at = now
        db.commit()
