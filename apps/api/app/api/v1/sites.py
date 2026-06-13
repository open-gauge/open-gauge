import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.user import User
from ...repositories import site as site_repo
from ...schemas.site import SiteCreate, SiteResponse, SiteUpdate

router = APIRouter(prefix="/sites", tags=["Sites"])


@router.get("", response_model=list[SiteResponse])
def list_sites(
    skip: int = 0,
    limit: int = 50,
    organization_id: uuid.UUID | None = None,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[SiteResponse]:
    return site_repo.list_sites(db, skip=skip, limit=limit, organization_id=organization_id, is_active=is_active)


@router.post("", response_model=SiteResponse, status_code=status.HTTP_201_CREATED)
def create_site(
    body: SiteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SiteResponse:
    return site_repo.create(
        db,
        organization_id=body.organization_id,
        name=body.name,
        description=body.description,
        location=body.location,
        created_by=current_user.id,
    )


@router.get("/{site_id}", response_model=SiteResponse)
def get_site(
    site_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SiteResponse:
    site = site_repo.get_by_id(db, site_id)
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return site


@router.put("/{site_id}", response_model=SiteResponse)
def update_site(
    site_id: uuid.UUID,
    body: SiteUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SiteResponse:
    site = site_repo.get_by_id(db, site_id)
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return site_repo.update(db, site, **body.model_dump(exclude_none=True))


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_site(
    site_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    site = site_repo.get_by_id(db, site_id)
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    site_repo.archive(db, site)
