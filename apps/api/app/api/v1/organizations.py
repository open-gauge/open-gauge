import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.organization import Organization
from ...models.team import Team
from ...models.user import User
from ...repositories import audit_log as audit_log_repo
from ...repositories import organization as org_repo
from ...repositories import stored_file as file_repo
from ...schemas.organization import OrganizationCreate, OrganizationResponse, OrganizationUpdate
from ...services import storage as storage_svc

router = APIRouter(prefix="/organizations", tags=["Organizations"])


def _require_admin(user: User) -> None:
    if not (user.is_superuser or user.role in ("superadmin", "admin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")


def _enrich_org(org: Organization, db: Session) -> OrganizationResponse:
    data = OrganizationResponse.model_validate(org)
    if org.logo_file_id:
        f = file_repo.get_by_id(db, org.logo_file_id)
        if f:
            data.logo_url = storage_svc.get_presigned_url(f.storage_path, f.bucket)
    return data


@router.get("", response_model=list[OrganizationResponse])
def list_organizations(
    skip: int = 0,
    limit: int = 50,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[OrganizationResponse]:
    orgs = org_repo.list_organizations(db, skip=skip, limit=limit, is_active=is_active)
    return [_enrich_org(o, db) for o in orgs]


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
def create_organization(
    body: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrganizationResponse:
    _require_admin(current_user)
    org = org_repo.create(db, name=body.name, description=body.description)
    return _enrich_org(org, db)


@router.get("/{org_id}", response_model=OrganizationResponse)
def get_organization(
    org_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> OrganizationResponse:
    org = org_repo.get_by_id(db, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return _enrich_org(org, db)


@router.put("/{org_id}", response_model=OrganizationResponse)
def update_organization(
    org_id: uuid.UUID,
    body: OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrganizationResponse:
    _require_admin(current_user)
    org = org_repo.get_by_id(db, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    org = org_repo.update(db, org, **body.model_dump(exclude_none=True))
    return _enrich_org(org, db)


@router.post("/{org_id}/logo", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def upload_org_logo(
    org_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrganizationResponse:
    """Upload or replace an organization's logo. Admin only."""
    _require_admin(current_user)
    org = org_repo.get_by_id(db, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    data = await file.read()
    try:
        content_type = storage_svc.validate_image_upload(file.content_type, len(data))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    old_file_id = org.logo_file_id

    checksum = storage_svc.sha256_hex(data)
    object_path = storage_svc.unique_object_name(f"organizations/{org.id}", file.filename or "logo")
    bucket, path, size = storage_svc.upload_file(data, content_type, object_path)

    record = file_repo.create(
        db,
        original_filename=file.filename or "logo",
        storage_path=path,
        bucket=bucket,
        content_type=content_type,
        size_bytes=size,
        checksum_sha256=checksum,
        entity_type="organization_logo",
        entity_id=org.id,
        uploaded_by=current_user.id,
    )
    org_repo.set_logo(db, org, record.id)

    if old_file_id:
        old_file = file_repo.get_by_id(db, old_file_id)
        if old_file:
            storage_svc.delete_file(old_file.storage_path, old_file.bucket)
            file_repo.delete(db, old_file_id)

    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="organization.logo_updated",
        entity_type="organization",
        entity_id=org.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return _enrich_org(org, db)


@router.delete("/{org_id}/logo", response_model=OrganizationResponse)
def delete_org_logo(
    org_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrganizationResponse:
    """Remove an organization's logo, if one is set. Admin only."""
    _require_admin(current_user)
    org = org_repo.get_by_id(db, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    if org.logo_file_id:
        old_file = file_repo.get_by_id(db, org.logo_file_id)
        org_repo.set_logo(db, org, None)
        if old_file:
            storage_svc.delete_file(old_file.storage_path, old_file.bucket)
            file_repo.delete(db, old_file.id)
        audit_log_repo.create(
            db,
            actor_id=current_user.id,
            actor_email=current_user.email,
            action="organization.logo_removed",
            entity_type="organization",
            entity_id=org.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    return _enrich_org(org, db)


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_organization(
    org_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    _require_admin(current_user)
    org = org_repo.get_by_id(db, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    # Cascade: deactivate all teams in this org
    db.query(Team).filter(
        Team.organization_id == org.id, Team.is_active.is_(True)
    ).update({"is_active": False})
    # Cascade: clear organization from affected users (their team memberships
    # are already moot once the teams above are deactivated)
    from ...models.user import User as UserModel  # avoid name clash
    db.query(UserModel).filter(
        UserModel.organization_id == org.id
    ).update({"organization_id": None})
    org_repo.deactivate(db, org)
