from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from ...services.auth import AuthError, login, register

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
def login_endpoint(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        token = login(db, body.email, body.password)
        return TokenResponse(access_token=token)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register_endpoint(body: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        token = register(db, body.email, body.name, body.password)
        return TokenResponse(access_token=token)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
