from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    RegisterResponse,
    ResendVerificationRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from ...services import mail as mail_svc
from ...services.auth import (
    AuthError,
    forgot_password,
    login,
    register,
    resend_verification,
    reset_password,
    verify_email,
)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
def login_endpoint(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        token = login(db, body.email, body.password)
        return TokenResponse(access_token=token)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register_endpoint(body: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    """Create a local account. Every new account requires activation before it can
    sign in. If an admin has configured and enabled SMTP (see /admin/email-settings),
    activation is self-service via an emailed verification link (/auth/verify-email).
    Otherwise an admin must activate the account manually from Admin -> Users."""
    try:
        _, verification_required = register(db, body.email, body.name, body.password)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    message = (
        "Account created. Check your email to verify your address before signing in."
        if mail_svc.is_enabled(db)
        else "Account created. An administrator needs to activate your account before you can sign in."
    )
    return RegisterResponse(verification_required=verification_required, message=message)


@router.get("/verify-email", response_model=TokenResponse)
def verify_email_endpoint(token: str, db: Session = Depends(get_db)) -> TokenResponse:
    """Confirm the token from a registration verification email, activating the
    account and returning an access token for immediate sign-in. Tokens expire
    24 hours after registration."""
    try:
        access_token = verify_email(db, token)
        return TokenResponse(access_token=access_token)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/resend-verification", status_code=status.HTTP_204_NO_CONTENT)
def resend_verification_endpoint(body: ResendVerificationRequest, db: Session = Depends(get_db)) -> None:
    """Re-send the verification email. Always responds 204 regardless of whether
    the address exists or is already verified, to avoid leaking account existence."""
    resend_verification(db, body.email)


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
def forgot_password_endpoint(body: ForgotPasswordRequest, db: Session = Depends(get_db)) -> None:
    """Send a password reset link if email is configured and the address matches an
    account. Always responds 204 regardless of outcome, to avoid leaking account
    existence — the frontend shows a generic message either way. Without SMTP
    configured there is no self-service reset path at all; contact your administrator."""
    forgot_password(db, body.email)


@router.post("/reset-password", response_model=TokenResponse)
def reset_password_endpoint(body: ResetPasswordRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Complete a password reset from the emailed link and sign the user in.
    Tokens expire 1 hour after being requested."""
    try:
        access_token = reset_password(db, body.token, body.new_password)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return TokenResponse(access_token=access_token)
