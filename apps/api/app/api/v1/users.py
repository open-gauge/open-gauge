import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security import hash_password, verify_password
from ...dependencies.deps import get_current_user
from ...models.user import User
from ...repositories import user as user_repo
from ...schemas.user import ChangePasswordRequest, UserCreate, UserResponse, UserSelfUpdate, UserUpdate

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=list[UserResponse])
def list_users(
    skip: int = 0,
    limit: int = 50,
    is_active: bool | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[UserResponse]:
    if not (current_user.is_superuser or current_user.role in ("superadmin", "admin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user_repo.list_users(db, skip=skip, limit=limit, is_active=is_active, q=q)


@router.get("/count")
def count_users(
    is_active: bool | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not (current_user.is_superuser or current_user.role in ("superadmin", "admin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return {"count": user_repo.count_users(db, is_active=is_active, q=q)}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return current_user


@router.patch("/me", response_model=UserResponse)
def update_me(
    body: UserSelfUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    updates = body.model_dump(exclude_none=True)
    if "email" in updates and updates["email"] != current_user.email:
        if user_repo.get_by_email(db, updates["email"]):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")
    # Allow clearing team by passing empty string
    if "team" in updates and updates["team"] == "":
        updates["team"] = None
    return user_repo.update(db, current_user, **updates)


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_my_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not current_user.hashed_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password login not enabled for this account")
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    user_repo.update(db, current_user, hashed_password=hash_password(body.new_password))


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    user_repo.deactivate(db, current_user)


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    if not (current_user.is_superuser or current_user.role in ("superadmin", "admin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    if user_repo.get_by_email(db, body.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    return user_repo.create(
        db,
        email=body.email,
        name=body.name,
        hashed_password=hash_password(body.password),
        role=body.role,
        organization_id=body.organization_id,
        team=body.team,
    )


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    # Any authenticated user may view a colleague's public profile
    _ = current_user
    user = user_repo.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    if current_user.id != user_id and not (current_user.is_superuser or current_user.role in ("superadmin", "admin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    user = user_repo.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user_repo.update(db, user, **body.model_dump(exclude_none=True))


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not (current_user.is_superuser or current_user.role in ("superadmin", "admin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    user = user_repo.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user_repo.deactivate(db, user)
