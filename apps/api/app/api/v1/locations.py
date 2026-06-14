import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.user import User
from ...repositories import location as location_repo
from ...schemas.location import LocationCreate, LocationResponse, LocationUpdate

router = APIRouter(prefix="/locations", tags=["Locations"])


@router.get("", response_model=list[LocationResponse])
def list_locations(
    skip: int = 0,
    limit: int = 100,
    organization_id: uuid.UUID | None = None,
    parent_location_id: uuid.UUID | None = None,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[LocationResponse]:
    return location_repo.list_locations(
        db,
        skip=skip,
        limit=limit,
        organization_id=organization_id,
        parent_location_id=parent_location_id,
        is_active=is_active,
    )


@router.post("", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
def create_location(
    body: LocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LocationResponse:
    return location_repo.create(db, created_by=current_user.id, **body.model_dump())


@router.get("/{location_id}", response_model=LocationResponse)
def get_location(
    location_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> LocationResponse:
    loc = location_repo.get_by_id(db, location_id)
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return loc


@router.put("/{location_id}", response_model=LocationResponse)
def update_location(
    location_id: uuid.UUID,
    body: LocationUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> LocationResponse:
    loc = location_repo.get_by_id(db, location_id)
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return location_repo.update(db, loc, **body.model_dump(exclude_none=True))


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_location(
    location_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    loc = location_repo.get_by_id(db, location_id)
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    location_repo.archive(db, loc)
