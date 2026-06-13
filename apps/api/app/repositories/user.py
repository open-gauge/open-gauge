import uuid

from sqlalchemy.orm import Session

from ..models.user import User, UserRole


def get_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def get_by_id(db: Session, user_id: uuid.UUID) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def list_users(db: Session, skip: int = 0, limit: int = 50, is_active: bool | None = None) -> list[User]:
    q = db.query(User)
    if is_active is not None:
        q = q.filter(User.is_active == is_active)
    return q.order_by(User.created_at.desc()).offset(skip).limit(limit).all()


def create(
    db: Session,
    email: str,
    name: str,
    hashed_password: str | None,
    role: UserRole = UserRole.viewer,
    organization_id: uuid.UUID | None = None,
    team: str | None = None,
    is_superuser: bool = False,
) -> User:
    user = User(
        email=email,
        name=name,
        hashed_password=hashed_password,
        role=role,
        organization_id=organization_id,
        team=team,
        is_superuser=is_superuser,
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


def deactivate(db: Session, user: User) -> User:
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user
