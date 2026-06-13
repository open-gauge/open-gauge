from sqlalchemy.orm import Session

from ..core.security import create_access_token, hash_password, verify_password
from ..repositories import user as user_repo


class AuthError(Exception):
    pass


def login(db: Session, email: str, password: str) -> str:
    user = user_repo.get_by_email(db, email)
    if not user or not verify_password(password, user.hashed_password):
        raise AuthError("Invalid email or password")
    if not user.is_active:
        raise AuthError("Account is disabled")
    return create_access_token({"sub": str(user.id), "email": user.email})


def register(db: Session, email: str, name: str, password: str) -> str:
    if user_repo.get_by_email(db, email):
        raise AuthError("An account with this email already exists")
    user = user_repo.create(db, email=email, name=name, hashed_password=hash_password(password))
    return create_access_token({"sub": str(user.id), "email": user.email})
