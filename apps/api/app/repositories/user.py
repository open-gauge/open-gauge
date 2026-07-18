import uuid

from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from ..models.user import User, UserRole


def get_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def get_by_verification_token(db: Session, token: str) -> User | None:
    return db.query(User).filter(User.verification_token == token).first()


def get_by_password_reset_token(db: Session, token: str) -> User | None:
    return db.query(User).filter(User.password_reset_token == token).first()


def get_by_id(db: Session, user_id: uuid.UUID) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def list_users(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    is_active: bool | None = None,
    q: str | None = None,
) -> list[User]:
    query = db.query(User)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    if q:
        pattern = f"%{q.lower()}%"
        query = query.filter(
            or_(func.lower(User.name).like(pattern), func.lower(User.email).like(pattern))
        )
    return query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()


def count_users(
    db: Session,
    is_active: bool | None = None,
    q: str | None = None,
) -> int:
    query = db.query(func.count(User.id))
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    if q:
        pattern = f"%{q.lower()}%"
        query = query.filter(
            or_(func.lower(User.name).like(pattern), func.lower(User.email).like(pattern))
        )
    return query.scalar() or 0


def create(
    db: Session,
    email: str,
    name: str,
    hashed_password: str | None,
    role: UserRole = UserRole.viewer,
    organization_id: uuid.UUID | None = None,
    is_superuser: bool = False,
    is_verified: bool = True,
    verification_token: str | None = None,
    verification_token_expires_at=None,
) -> User:
    user = User(
        email=email,
        name=name,
        hashed_password=hashed_password,
        role=role,
        organization_id=organization_id,
        is_superuser=is_superuser,
        is_verified=is_verified,
        verification_token=verification_token,
        verification_token_expires_at=verification_token_expires_at,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update(db: Session, user: User, **kwargs) -> User:
    for key, value in kwargs.items():
        if value is not None:
            setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


def set_profile_picture(db: Session, user: User, file_id: uuid.UUID | None) -> User:
    user.profile_picture_id = file_id
    db.commit()
    db.refresh(user)
    return user


def mark_verified(db: Session, user: User) -> User:
    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires_at = None
    db.commit()
    db.refresh(user)
    return user


def set_verification_token(db: Session, user: User, token: str, expires_at) -> User:
    user.verification_token = token
    user.verification_token_expires_at = expires_at
    db.commit()
    db.refresh(user)
    return user


def set_password_reset_token(db: Session, user: User, token: str, expires_at) -> User:
    user.password_reset_token = token
    user.password_reset_token_expires_at = expires_at
    db.commit()
    db.refresh(user)
    return user


def reset_password(db: Session, user: User, hashed_password: str) -> User:
    user.hashed_password = hashed_password
    user.password_reset_token = None
    user.password_reset_token_expires_at = None
    db.commit()
    db.refresh(user)
    return user


def deactivate(db: Session, user: User) -> User:
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user
