import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.user import User
from ...repositories import audit_log as audit_log_repo
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
    is_calibration_lab: bool | None = None,
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
        is_calibration_lab=is_calibration_lab,
    )


@router.post("", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
def create_location(
    body: LocationCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LocationResponse:
    loc = location_repo.create(db, created_by=current_user.id, **body.model_dump())
    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="location.created",
        entity_type="location",
        entity_id=loc.id,
        after_state={"name": loc.name, "code": loc.code},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return loc


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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LocationResponse:
    loc = location_repo.get_by_id(db, location_id)
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    update_data = body.model_dump(exclude_unset=True)
    updated = location_repo.update(db, loc, **update_data)
    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="location.updated",
        entity_type="location",
        entity_id=updated.id,
        after_state={"name": updated.name, "fields_changed": list(update_data.keys())},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return updated


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_location(
    location_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    loc = location_repo.get_by_id(db, location_id)
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    name, code = loc.name, loc.code
    location_repo.delete_location(db, loc)
    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="location.deleted",
        entity_type="location",
        entity_id=location_id,
        after_state={"name": name, "code": code},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
