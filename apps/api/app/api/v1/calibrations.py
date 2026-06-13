import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.user import User
from ...repositories import calibration as cal_repo
from ...repositories import asset as asset_repo
from ...schemas.calibration import CalibrationCreate, CalibrationResponse
from ...schemas.calibration_coefficient import CalibrationCoefficientCreate, CalibrationCoefficientResponse

router = APIRouter(prefix="/calibrations", tags=["Calibrations"])


@router.get("", response_model=list[CalibrationResponse])
def list_calibrations(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CalibrationResponse]:
    return cal_repo.list_calibrations(db, skip=skip, limit=limit)


@router.post("", response_model=CalibrationResponse, status_code=status.HTTP_201_CREATED)
def create_calibration(
    body: CalibrationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CalibrationResponse:
    asset = asset_repo.get_by_id(db, body.asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return cal_repo.create(db, created_by=current_user.id, **body.model_dump())


@router.get("/{cal_id}", response_model=CalibrationResponse)
def get_calibration(
    cal_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CalibrationResponse:
    cal = cal_repo.get_by_id(db, cal_id)
    if not cal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calibration not found")
    return cal


@router.get("/{cal_id}/coefficients", response_model=list[CalibrationCoefficientResponse])
def list_coefficients(
    cal_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CalibrationCoefficientResponse]:
    cal = cal_repo.get_by_id(db, cal_id)
    if not cal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calibration not found")
    return cal_repo.list_coefficients(db, cal_id)


@router.post("/{cal_id}/coefficients", response_model=CalibrationCoefficientResponse, status_code=status.HTTP_201_CREATED)
def create_coefficient(
    cal_id: uuid.UUID,
    body: CalibrationCoefficientCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CalibrationCoefficientResponse:
    cal = cal_repo.get_by_id(db, cal_id)
    if not cal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calibration not found")
    data = body.model_dump()
    data["calibration_id"] = cal_id
    return cal_repo.create_coefficient(db, **data)
