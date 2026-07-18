import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security import hash_password, verify_password
from ...dependencies.deps import get_current_user
from ...models.user import User
from ...repositories import audit_log as audit_log_repo
from ...repositories import stored_file as file_repo
from ...repositories import team_member as team_member_repo
from ...repositories import user as user_repo
from ...schemas.user import ChangePasswordRequest, UserCreate, UserResponse, UserSelfUpdate, UserUpdate
from ...services import storage as storage_svc

router = APIRouter(prefix="/users", tags=["Users"])


def _enrich_user(user: User, db: Session) -> UserResponse:
    data = UserResponse.model_validate(user)
    data.teams = team_member_repo.list_teams_for_user(db, user.id)
    if user.profile_picture_id:
        f = file_repo.get_by_id(db, user.profile_picture_id)
        if f:
            data.profile_picture_url = storage_svc.get_presigned_url(f.storage_path, f.bucket)
    return data


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
def get_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return _enrich_user(current_user, db)


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
    user_repo.update(db, current_user, **updates)
    return _enrich_user(current_user, db)


@router.post("/me/picture", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def upload_my_picture(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Upload or replace the current user's profile picture. Replaces and deletes any previous picture."""
    data = await file.read()
    try:
        content_type = storage_svc.validate_image_upload(file.content_type, len(data))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    old_file_id = current_user.profile_picture_id

    checksum = storage_svc.sha256_hex(data)
    object_path = storage_svc.unique_object_name(f"users/{current_user.id}", file.filename or "picture")
    bucket, path, size = storage_svc.upload_file(data, content_type, object_path)

    record = file_repo.create(
        db,
        original_filename=file.filename or "picture",
        storage_path=path,
        bucket=bucket,
        content_type=content_type,
        size_bytes=size,
        checksum_sha256=checksum,
        entity_type="user_profile_picture",
        entity_id=current_user.id,
        uploaded_by=current_user.id,
    )
    user_repo.set_profile_picture(db, current_user, record.id)

    if old_file_id:
        old_file = file_repo.get_by_id(db, old_file_id)
        if old_file:
            storage_svc.delete_file(old_file.storage_path, old_file.bucket)
            file_repo.delete(db, old_file_id)

    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="user.picture_updated",
        entity_type="user",
        entity_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return _enrich_user(current_user, db)


@router.delete("/me/picture", response_model=UserResponse)
def delete_my_picture(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Remove the current user's profile picture, if one is set."""
    if current_user.profile_picture_id:
        old_file = file_repo.get_by_id(db, current_user.profile_picture_id)
        user_repo.set_profile_picture(db, current_user, None)
        if old_file:
            storage_svc.delete_file(old_file.storage_path, old_file.bucket)
            file_repo.delete(db, old_file.id)
        audit_log_repo.create(
            db,
            actor_id=current_user.id,
            actor_email=current_user.email,
            action="user.picture_removed",
            entity_type="user",
            entity_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    return _enrich_user(current_user, db)


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
    return _enrich_user(user, db)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Admin-only: role, organization, team, is_active, and is_verified are all
    privilege-bearing fields. Self-service updates go through PATCH /users/me
    (UserSelfUpdate) instead, which only allows name/email/team."""
    if not (current_user.is_superuser or current_user.role in ("superadmin", "admin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
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
