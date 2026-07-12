import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.security import create_access_token, hash_password, verify_password
from ..repositories import user as user_repo
from . import mail as mail_svc
from . import mail_templates

VERIFICATION_TOKEN_TTL_HOURS = 24
PASSWORD_RESET_TOKEN_TTL_HOURS = 1


class AuthError(Exception):
    pass


def login(db: Session, email: str, password: str) -> str:
    user = user_repo.get_by_email(db, email)
    if not user or not verify_password(password, user.hashed_password):
        raise AuthError("Invalid email or password")
    if not user.is_active:
        raise AuthError("Account is disabled")
    if not user.is_verified:
        raise AuthError("Your account is pending activation. Contact your administrator.")
    return create_access_token({"sub": str(user.id), "email": user.email})


def register(db: Session, email: str, name: str, password: str) -> tuple[str | None, bool]:
    """Create a user account. Returns (access_token, verification_required).

    Every self-registered account starts unverified and cannot sign in until it's
    activated — there is no path where self-registration grants instant access.
    If email notifications are configured, activation is self-service (a
    verification email with a link). If not, only an admin can activate the
    account (Admin -> Users), same as the "forgot password without mail" story.
    access_token is therefore always None here; it's kept on the response shape
    for symmetry with verify_email(), which does return one once activated.
    """
    if user_repo.get_by_email(db, email):
        raise AuthError("An account with this email already exists")

    mail_enabled = mail_svc.is_enabled(db)

    if not mail_enabled:
        user_repo.create(db, email=email, name=name, hashed_password=hash_password(password), is_verified=False)
        return None, True

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=VERIFICATION_TOKEN_TTL_HOURS)
    user = user_repo.create(
        db,
        email=email,
        name=name,
        hashed_password=hash_password(password),
        is_verified=False,
        verification_token=token,
        verification_token_expires_at=expires_at,
    )
    _send_verification_email(db, user.email, user.name, token)
    return None, True


def resend_verification(db: Session, email: str) -> None:
    """Best-effort resend; always succeeds silently to avoid leaking account existence."""
    user = user_repo.get_by_email(db, email)
    if not user or user.is_verified or not mail_svc.is_enabled(db):
        return
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=VERIFICATION_TOKEN_TTL_HOURS)
    user_repo.set_verification_token(db, user, token, expires_at)
    _send_verification_email(db, user.email, user.name, token)


def verify_email(db: Session, token: str) -> str:
    """Marks the account verified and returns an access token for immediate sign-in."""
    user = user_repo.get_by_verification_token(db, token)
    if not user:
        raise AuthError("Invalid or expired verification link")
    if user.verification_token_expires_at and user.verification_token_expires_at < datetime.now(timezone.utc):
        raise AuthError("This verification link has expired. Request a new one.")
    user_repo.mark_verified(db, user)
    return create_access_token({"sub": str(user.id), "email": user.email})


def forgot_password(db: Session, email: str) -> None:
    """Best-effort; always succeeds silently regardless of whether the account
    exists, to avoid leaking account existence. Without mail configured there is
    no self-service path at all — the caller-facing message directs the user to
    their administrator instead, same as the "new account without mail" story."""
    if not mail_svc.is_enabled(db):
        return
    user = user_repo.get_by_email(db, email)
    if not user:
        return
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=PASSWORD_RESET_TOKEN_TTL_HOURS)
    user_repo.set_password_reset_token(db, user, token, expires_at)
    _send_password_reset_email(db, user.email, user.name, token)


def reset_password(db: Session, token: str, new_password: str) -> str:
    """Sets the new password and returns an access token for immediate sign-in."""
    user = user_repo.get_by_password_reset_token(db, token)
    if not user:
        raise AuthError("Invalid or expired reset link")
    if user.password_reset_token_expires_at and user.password_reset_token_expires_at < datetime.now(timezone.utc):
        raise AuthError("This reset link has expired. Request a new one.")
    user_repo.reset_password(db, user, hash_password(new_password))
    return create_access_token({"sub": str(user.id), "email": user.email})


def _send_verification_email(db: Session, email: str, name: str, token: str) -> None:
    verify_url = f"{settings.frontend_url}/auth/verify-email?token={token}"
    subject, html_body, text_body = mail_templates.render_verification_email(name, verify_url)
    try:
        mail_svc.send_email(db, email, subject, html_body, text_body)
    except mail_svc.MailError:
        # Best-effort: the account still exists and unverified; the user can use
        # "resend verification email" once the admin fixes the SMTP configuration.
        pass


def _send_password_reset_email(db: Session, email: str, name: str, token: str) -> None:
    reset_url = f"{settings.frontend_url}/auth/reset-password?token={token}"
    subject, html_body, text_body = mail_templates.render_password_reset_email(name, reset_url)
    try:
        mail_svc.send_email(db, email, subject, html_body, text_body)
    except mail_svc.MailError:
        # Best-effort: the user can just request another reset link once SMTP is fixed.
        pass
