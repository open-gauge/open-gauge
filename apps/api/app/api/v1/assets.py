import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.asset import AssetType
from ...models.user import User
from ...repositories import asset as asset_repo
from ...repositories import calibration as cal_repo
from ...repositories import certificate as cert_repo
from ...repositories import audit_log as audit_log_repo
from ...repositories import stored_file as file_repo
from ...schemas.asset import AssetCreate, AssetListItem, AssetProfileResponse, AssetResponse, AssetUpdate
from ...schemas.calibration import CalibrationResponse
from ...schemas.certificate import CertificateResponse
from ...schemas.sensor import SensorChannelResponse
from ...schemas.daq import DaqResponse
from ...schemas.audit_log import AuditLogResponse
from ...schemas.stored_file import StoredFileResponse

router = APIRouter(prefix="/assets", tags=["Assets"])


def _enrich(asset, db: Session) -> AssetResponse:
    channels = asset_repo.get_sensor_channels(db, asset.id)
    daq = asset_repo.get_daq_details(db, asset.id)
    data = AssetResponse.model_validate(asset)
    data.sensor_channels = [SensorChannelResponse.model_validate(ch) for ch in channels]
    if daq:
        data.daq_details = DaqResponse.model_validate(daq)
    return data


@router.get("", response_model=list[AssetListItem])
def list_assets(
    skip: int = 0,
    limit: int = Query(50, le=200),
    is_active: bool | None = None,
    asset_type: AssetType | None = None,
    location_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[AssetListItem]:
    return asset_repo.list_assets(
        db,
        skip=skip,
        limit=limit,
        is_active=is_active,
        asset_type=asset_type,
        location_id=location_id,
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


@router.get("/{asset_pk}/profile", response_model=AssetProfileResponse)
def get_asset_profile(
    asset_pk: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> AssetProfileResponse:
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    base = _enrich(asset, db)
    extras = asset_repo.get_profile_extras(db, asset_pk)
    return AssetProfileResponse(**base.model_dump(), **extras)


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


@router.get("/{asset_pk}/audit-logs", response_model=list[AuditLogResponse])
def list_asset_audit_logs(
    asset_pk: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[AuditLogResponse]:
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return audit_log_repo.list_logs(db, entity_id=asset_pk, skip=skip, limit=limit)


@router.get("/{asset_pk}/files", response_model=list[StoredFileResponse])
def list_asset_files(
    asset_pk: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[StoredFileResponse]:
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return file_repo.list_by_entity(db, asset_pk)
