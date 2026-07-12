import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.security import create_access_token, hash_password, verify_password
from ..repositories import user as user_repo
from . import mail as mail_svc
from . import mail_templates

VERIFICATION_TOKEN_TTL_HOURS = 24


class AuthError(Exception):
    pass


def login(db: Session, email: str, password: str) -> str:
    user = user_repo.get_by_email(db, email)
    if not user or not verify_password(password, user.hashed_password):
        raise AuthError("Invalid email or password")
    if not user.is_active:
        raise AuthError("Account is disabled")
    if not user.is_verified:
        raise AuthError("Please verify your email address before signing in")
    return create_access_token({"sub": str(user.id), "email": user.email})


def register(db: Session, email: str, name: str, password: str) -> tuple[str | None, bool]:
    """Create a user account. Returns (access_token, verification_required).

    If email notifications aren't configured/enabled, the account is verified
    immediately and an access token is returned (today's behavior). Otherwise
    the account starts unverified and a verification email is sent.
    """
    if user_repo.get_by_email(db, email):
        raise AuthError("An account with this email already exists")

    mail_enabled = mail_svc.is_enabled(db)

    if not mail_enabled:
        user = user_repo.create(db, email=email, name=name, hashed_password=hash_password(password), is_verified=True)
        return create_access_token({"sub": str(user.id), "email": user.email}), False

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


def _send_verification_email(db: Session, email: str, name: str, token: str) -> None:
    verify_url = f"{settings.frontend_url}/auth/verify-email?token={token}"
    subject, html_body, text_body = mail_templates.render_verification_email(name, verify_url)
    try:
        mail_svc.send_email(db, email, subject, html_body, text_body)
    except mail_svc.MailError:
        # Best-effort: the account still exists and unverified; the user can use
        # "resend verification email" once the admin fixes the SMTP configuration.
        pass
