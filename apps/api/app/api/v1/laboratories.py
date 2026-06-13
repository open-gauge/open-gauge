import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.user import User
from ...repositories import laboratory as lab_repo
from ...schemas.laboratory import LaboratoryCreate, LaboratoryResponse, LaboratoryUpdate

router = APIRouter(prefix="/laboratories", tags=["Laboratories"])


@router.get("", response_model=list[LaboratoryResponse])
def list_laboratories(
    skip: int = 0,
    limit: int = 50,
    site_id: uuid.UUID | None = None,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[LaboratoryResponse]:
    return lab_repo.list_laboratories(db, skip=skip, limit=limit, site_id=site_id, is_active=is_active)


@router.post("", response_model=LaboratoryResponse, status_code=status.HTTP_201_CREATED)
def create_laboratory(
    body: LaboratoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LaboratoryResponse:
    return lab_repo.create(db, site_id=body.site_id, name=body.name, description=body.description, created_by=current_user.id)


@router.get("/{lab_id}", response_model=LaboratoryResponse)
def get_laboratory(
    lab_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> LaboratoryResponse:
    lab = lab_repo.get_by_id(db, lab_id)
    if not lab:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laboratory not found")
    return lab


@router.put("/{lab_id}", response_model=LaboratoryResponse)
def update_laboratory(
    lab_id: uuid.UUID,
    body: LaboratoryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> LaboratoryResponse:
    lab = lab_repo.get_by_id(db, lab_id)
    if not lab:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laboratory not found")
    return lab_repo.update(db, lab, **body.model_dump(exclude_none=True))


@router.delete("/{lab_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_laboratory(
    lab_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    lab = lab_repo.get_by_id(db, lab_id)
    if not lab:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laboratory not found")
    lab_repo.archive(db, lab)
