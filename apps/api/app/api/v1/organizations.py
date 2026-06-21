import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.team import Team
from ...models.user import User
from ...repositories import organization as org_repo
from ...schemas.organization import OrganizationCreate, OrganizationResponse, OrganizationUpdate

router = APIRouter(prefix="/organizations", tags=["Organizations"])


def _require_admin(user: User) -> None:
    if not (user.is_superuser or user.role in ("superadmin", "admin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")


@router.get("", response_model=list[OrganizationResponse])
def list_organizations(
    skip: int = 0,
    limit: int = 50,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[OrganizationResponse]:
    return org_repo.list_organizations(db, skip=skip, limit=limit, is_active=is_active)


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
def create_organization(
    body: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrganizationResponse:
    _require_admin(current_user)
    return org_repo.create(db, name=body.name, description=body.description)


@router.get("/{org_id}", response_model=OrganizationResponse)
def get_organization(
    org_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> OrganizationResponse:
    org = org_repo.get_by_id(db, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org


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
    return org_repo.update(db, org, **body.model_dump(exclude_none=True))


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
    # Cascade: clear organization and team from affected users
    from ...models.user import User as UserModel  # avoid name clash
    db.query(UserModel).filter(
        UserModel.organization_id == org.id
    ).update({"organization_id": None, "team": None})
    org_repo.deactivate(db, org)
