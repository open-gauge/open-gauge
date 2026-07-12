"""SMTP mail delivery, configured entirely from the admin-managed EmailSettings row.

There is no env-var fallback by design: SMTP is a runtime, admin-editable setting
(see /admin/email-settings), not a deployment-time constant. If it isn't configured
or is disabled, sending is a no-op everywhere it's called from — the rest of the
app must keep working without it (self-hosted installs may never set up mail).
"""
import logging
import smtplib
from email.message import EmailMessage

from sqlalchemy.orm import Session

from ..models.email_settings import EmailSettings
from ..repositories import email_settings as email_settings_repo

logger = logging.getLogger(__name__)


class MailError(Exception):
    pass


def is_enabled(db: Session) -> bool:
    settings = email_settings_repo.get(db)
    return bool(settings and settings.enabled and settings.smtp_host and settings.from_email)


def send_email(db: Session, to_email: str, subject: str, html_body: str, text_body: str) -> None:
    """Send an email using the current admin-configured SMTP settings.

    Raises MailError if mail isn't configured/enabled, or if delivery fails.
    Callers that treat email as best-effort (notifications, reminders) should
    catch MailError and log rather than propagate.
    """
    settings = email_settings_repo.get(db)
    if not settings or not settings.enabled:
        raise MailError("Email notifications are not enabled")
    if not settings.smtp_host or not settings.from_email:
        raise MailError("SMTP is not fully configured")

    _send(settings, to_email, subject, html_body, text_body)


def send_test_email(settings: EmailSettings, to_email: str) -> None:
    """Send a one-off test email using the given (possibly unsaved) settings."""
    if not settings.smtp_host or not settings.from_email:
        raise MailError("SMTP host and from address are required")
    subject = "Open Gauge test email"
    text_body = "This is a test email from your Open Gauge instance. If you received this, SMTP is configured correctly."
    html_body = f"<p>{text_body}</p>"
    _send(settings, to_email, subject, html_body, text_body)


def _send(settings: EmailSettings, to_email: str, subject: str, html_body: str, text_body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{settings.from_name} <{settings.from_email}>"
    msg["To"] = to_email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    try:
        if settings.smtp_use_tls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
                smtp.starttls()
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password or "")
                smtp.send_message(msg)
        else:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password or "")
                smtp.send_message(msg)
    except (smtplib.SMTPException, OSError) as e:
        logger.warning("Failed to send email to %s: %s", to_email, e)
        raise MailError(str(e)) from e
