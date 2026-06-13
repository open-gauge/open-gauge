import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.asset import AssetCategory, CalibrationStatus
from ...models.user import User
from ...repositories import asset as asset_repo
from ...repositories import calibration as cal_repo
from ...repositories import certificate as cert_repo
from ...schemas.asset import AssetCreate, AssetListItem, AssetResponse, AssetUpdate
from ...schemas.calibration import CalibrationResponse
from ...schemas.certificate import CertificateResponse
from ...schemas.sensor import SensorDetails
from ...schemas.instrument import InstrumentDetails
from ...schemas.data_acquisition import DaqDetails

router = APIRouter(prefix="/assets", tags=["Assets"])


def _enrich(asset, db: Session) -> AssetResponse:
    sensor = asset_repo.get_sensor_details(db, asset.id)
    instrument = asset_repo.get_instrument_details(db, asset.id)
    daq = asset_repo.get_daq_details(db, asset.id)
    data = AssetResponse.model_validate(asset)
    if sensor:
        data.sensor_details = SensorDetails.model_validate(sensor)
    if instrument:
        data.instrument_details = InstrumentDetails.model_validate(instrument)
    if daq:
        data.daq_details = DaqDetails.model_validate(daq)
    return data


@router.get("", response_model=list[AssetListItem])
def list_assets(
    skip: int = 0,
    limit: int = Query(50, le=200),
    is_active: bool | None = True,
    calibration_status: CalibrationStatus | None = None,
    category: AssetCategory | None = None,
    laboratory_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[AssetListItem]:
    return asset_repo.list_assets(
        db,
        skip=skip,
        limit=limit,
        is_active=is_active,
        calibration_status=calibration_status,
        category=category,
        laboratory_id=laboratory_id,
    )


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(
    body: AssetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssetResponse:
    if asset_repo.get_by_asset_id(db, body.asset_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Asset ID already exists")
    data = body.model_dump()
    asset = asset_repo.create(db, created_by=current_user.id, **data)
    return _enrich(asset, db)


@router.get("/{asset_pk}", response_model=AssetResponse)
def get_asset(
    asset_pk: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> AssetResponse:
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return _enrich(asset, db)


@router.put("/{asset_pk}", response_model=AssetResponse)
def update_asset(
    asset_pk: uuid.UUID,
    body: AssetUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> AssetResponse:
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    asset_repo.update(db, asset, **body.model_dump(exclude_none=True))
    return _enrich(asset, db)


@router.delete("/{asset_pk}", status_code=status.HTTP_204_NO_CONTENT)
def retire_asset(
    asset_pk: uuid.UUID,
    reason: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    asset_repo.retire(db, asset, retired_by=current_user.id, reason=reason)


@router.get("/{asset_pk}/calibrations", response_model=list[CalibrationResponse])
def list_asset_calibrations(
    asset_pk: uuid.UUID,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CalibrationResponse]:
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return cal_repo.list_by_asset(db, asset_pk, skip=skip, limit=limit)


@router.get("/{asset_pk}/certificates", response_model=list[CertificateResponse])
def list_asset_certificates(
    asset_pk: uuid.UUID,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CertificateResponse]:
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return cert_repo.list_by_asset(db, asset_pk, skip=skip, limit=limit)
