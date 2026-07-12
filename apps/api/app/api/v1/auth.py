from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...schemas.auth import (
    LoginRequest,
    RegisterRequest,
    RegisterResponse,
    ResendVerificationRequest,
    TokenResponse,
)
from ...services.auth import AuthError, login, register, resend_verification, verify_email

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
    """Create a local account. If an admin has configured and enabled SMTP
    (see /admin/email-settings), the account starts unverified and a
    verification email is sent — sign-in is blocked until it's confirmed via
    /auth/verify-email. Otherwise the account is verified immediately and an
    access token is returned right away, same as before this existed."""
    try:
        token, verification_required = register(db, body.email, body.name, body.password)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if verification_required:
        return RegisterResponse(
            verification_required=True,
            message="Account created. Check your email to verify your address before signing in.",
        )
    return RegisterResponse(access_token=token, verification_required=False, message="Account created.")


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
