import uuid
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.asset import AssetType
from ...models.user import User
from ...models.calibration_method import Procedure
from ...repositories import asset as asset_repo
from ...repositories import calibration as cal_repo
from ...repositories import audit_log as audit_log_repo
from ...repositories import stored_file as file_repo
from ...schemas.asset import AssetCreate, AssetDuplicateRequest, AssetListItem, AssetProfileResponse, AssetResponse, AssetUpdate
from ...schemas.calibration import CalibrationResponse
from ...health import service as health_service
from ...health.models import AssetHealthResponse, CurveComparisonResponse
from ...schemas.sensor import SensorChannelResponse
from ...schemas.daq import DaqResponse
from ...schemas.audit_log import AuditLogResponse
from ...schemas.stored_file import StoredFileResponse
from ...services import storage as storage_svc

router = APIRouter(prefix="/assets", tags=["Assets"])


def _enrich(asset, db: Session) -> AssetResponse:
    channels = asset_repo.get_sensor_channels(db, asset.id)

    # Resolve calibration method names in one query
    method_ids = {ch.calibration_method_id for ch in channels if ch.calibration_method_id}
    method_map: dict[uuid.UUID, str] = {}
    if method_ids:
        methods = db.query(Procedure).filter(Procedure.id.in_(method_ids)).all()
        method_map = {m.id: m.name for m in methods}

    daq = asset_repo.get_daq_details(db, asset.id)
    data = AssetResponse.model_validate(asset)
    enriched_channels = []
    for ch in channels:
        ch_data = SensorChannelResponse.model_validate(ch)
        if ch.calibration_method_id:
            ch_data.calibration_method_name = method_map.get(ch.calibration_method_id)
        enriched_channels.append(ch_data)
    data.sensor_channels = enriched_channels
    if daq:
        data.daq_details = DaqResponse.model_validate(daq)
    if asset.picture_id:
        picture_file = file_repo.get_by_id(db, asset.picture_id)
        if picture_file:
            data.picture_url = storage_svc.get_presigned_url(picture_file.storage_path, picture_file.bucket)
    return data


@router.get("", response_model=list[AssetListItem])
def list_assets(
    skip: int = 0,
    limit: int = Query(50, le=200),
    is_active: bool | None = None,
    asset_type: AssetType | None = None,
    location_id: uuid.UUID | None = None,
    include_descendants: bool = False,
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
        include_descendants=include_descendants,
    )


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(
    body: AssetCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssetResponse:
    if asset_repo.get_by_asset_id(db, body.asset_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Asset ID already exists")
    data = body.model_dump()
    asset = asset_repo.create(db, created_by=current_user.id, **data)
    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="asset.created",
        entity_type="asset",
        entity_id=asset.id,
        entity_asset_id=asset.asset_id,
        after_state={"name": asset.name, "asset_type": asset.asset_type},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
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
    extras["calibration_health_score"] = health_service.get_asset_calibration_health_score(db, asset_pk)
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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssetResponse:
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    update_data = body.model_dump(exclude_unset=True)

    # Reject if asset_id is changing but the new value is already taken by another asset
    new_asset_id = update_data.get("asset_id")
    if new_asset_id and new_asset_id != asset.asset_id:
        if asset_repo.get_by_asset_id(db, new_asset_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Asset ID already exists")

    # Snapshot the fields being changed (before state)
    def _serialize(v: object) -> object:
        if isinstance(v, (date, datetime)):
            return v.isoformat()
        if isinstance(v, uuid.UUID):
            return str(v)
        if isinstance(v, Decimal):
            return float(v)
        return v

    before_state = {
        k: _serialize(getattr(asset, k, None))
        for k in update_data
        if k != "sensor_channels"
    }

    asset_repo.update(db, asset, **update_data)

    after_state = {
        k: _serialize(getattr(asset, k, None))
        for k in update_data
        if k != "sensor_channels"
    }
    if "sensor_channels" in update_data:
        after_state["sensor_channels_count"] = len(update_data["sensor_channels"])

    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="asset.updated",
        entity_type="asset",
        entity_id=asset.id,
        entity_asset_id=asset.asset_id,
        before_state=before_state,
        after_state=after_state,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return _enrich(asset, db)


@router.delete("/{asset_pk}", status_code=status.HTTP_204_NO_CONTENT)
def retire_asset(
    asset_pk: uuid.UUID,
    request: Request,
    reason: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    asset_repo.retire(db, asset, retired_by=current_user.id, reason=reason)
    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="asset.retired",
        entity_type="asset",
        entity_id=asset.id,
        entity_asset_id=asset.asset_id,
        after_state={"reason": reason} if reason else None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


@router.post("/{asset_pk}/duplicate", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def duplicate_asset(
    asset_pk: uuid.UUID,
    body: AssetDuplicateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssetResponse:
    source = asset_repo.get_by_id(db, asset_pk)
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    if asset_repo.get_by_asset_id(db, body.new_asset_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Asset ID already exists")
    new_asset = asset_repo.duplicate(db, source=source, new_asset_id=body.new_asset_id, created_by=current_user.id)
    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="asset.duplicated",
        entity_type="asset",
        entity_id=new_asset.id,
        entity_asset_id=new_asset.asset_id,
        after_state={"duplicated_from": source.asset_id},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return _enrich(new_asset, db)


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


@router.get("/{asset_pk}/health", response_model=AssetHealthResponse)
def get_asset_health(
    asset_pk: uuid.UUID,
    sensor_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> AssetHealthResponse:
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return health_service.get_asset_health(db, asset_pk, sensor_id)


@router.get("/{asset_pk}/health/curve-comparison", response_model=CurveComparisonResponse)
def get_asset_health_curve_comparison(
    asset_pk: uuid.UUID,
    reference_calibration_id: uuid.UUID,
    current_calibration_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CurveComparisonResponse:
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    try:
        return health_service.get_curve_comparison(
            db, asset_pk, reference_calibration_id, current_calibration_id
        )
    except health_service.CalibrationNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


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


def _enrich_files(files: list) -> list[StoredFileResponse]:
    result = []
    for f in files:
        resp = StoredFileResponse.model_validate(f)
        resp.url = storage_svc.get_presigned_url(f.storage_path, f.bucket)
        result.append(resp)
    return result


@router.get("/{asset_pk}/files", response_model=list[StoredFileResponse])
def list_asset_files(
    asset_pk: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[StoredFileResponse]:
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return _enrich_files(file_repo.list_by_entity(db, asset_pk))


@router.post("/{asset_pk}/files", response_model=StoredFileResponse, status_code=status.HTTP_201_CREATED)
async def upload_asset_file(
    asset_pk: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StoredFileResponse:
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    data = await file.read()
    checksum = storage_svc.sha256_hex(data)
    object_path = storage_svc.unique_object_name(f"assets/{asset_pk}", file.filename or "file")
    content_type = file.content_type or "application/octet-stream"

    bucket, path, size = storage_svc.upload_file(data, content_type, object_path)

    record = file_repo.create(
        db,
        original_filename=file.filename or "file",
        storage_path=path,
        bucket=bucket,
        content_type=content_type,
        size_bytes=size,
        checksum_sha256=checksum,
        entity_type="asset",
        entity_id=asset_pk,
        uploaded_by=current_user.id,
    )

    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="asset.file_uploaded",
        entity_type="asset",
        entity_id=asset.id,
        entity_asset_id=asset.asset_id,
        after_state={"filename": record.original_filename},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    resp = StoredFileResponse.model_validate(record)
    resp.url = storage_svc.get_presigned_url(record.storage_path, record.bucket)
    return resp


@router.delete("/{asset_pk}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset_file(
    asset_pk: uuid.UUID,
    file_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    asset = asset_repo.get_by_id(db, asset_pk)
    f = file_repo.get_by_id(db, file_id)
    if not f or f.entity_id != asset_pk:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    storage_svc.delete_file(f.storage_path, f.bucket)
    file_repo.delete(db, file_id)
    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="asset.file_deleted",
        entity_type="asset",
        entity_id=asset_pk,
        entity_asset_id=asset.asset_id if asset else None,
        after_state={"filename": f.original_filename},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


@router.post("/{asset_pk}/picture", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
async def upload_asset_picture(
    asset_pk: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssetResponse:
    """Upload or replace the asset's picture (a photo of the physical unit, shown circled on the asset detail header). Replaces and deletes any previous picture."""
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    data = await file.read()
    try:
        content_type = storage_svc.validate_image_upload(file.content_type, len(data))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    old_file_id = asset.picture_id

    checksum = storage_svc.sha256_hex(data)
    object_path = storage_svc.unique_object_name(f"assets/{asset_pk}/picture", file.filename or "picture")
    bucket, path, size = storage_svc.upload_file(data, content_type, object_path)

    record = file_repo.create(
        db,
        original_filename=file.filename or "picture",
        storage_path=path,
        bucket=bucket,
        content_type=content_type,
        size_bytes=size,
        checksum_sha256=checksum,
        entity_type="asset_picture",
        entity_id=asset_pk,
        uploaded_by=current_user.id,
    )
    asset_repo.set_picture(db, asset, record.id)

    if old_file_id:
        old_file = file_repo.get_by_id(db, old_file_id)
        if old_file:
            storage_svc.delete_file(old_file.storage_path, old_file.bucket)
            file_repo.delete(db, old_file_id)

    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="asset.picture_updated",
        entity_type="asset",
        entity_id=asset.id,
        entity_asset_id=asset.asset_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return _enrich(asset, db)


@router.delete("/{asset_pk}/picture", response_model=AssetResponse)
def delete_asset_picture(
    asset_pk: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssetResponse:
    """Remove the asset's picture, if one is set."""
    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    if asset.picture_id:
        old_file = file_repo.get_by_id(db, asset.picture_id)
        asset_repo.set_picture(db, asset, None)
        if old_file:
            storage_svc.delete_file(old_file.storage_path, old_file.bucket)
            file_repo.delete(db, old_file.id)
        audit_log_repo.create(
            db,
            actor_id=current_user.id,
            actor_email=current_user.email,
            action="asset.picture_removed",
            entity_type="asset",
            entity_id=asset.id,
            entity_asset_id=asset.asset_id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    return _enrich(asset, db)


@router.get("/{asset_pk}/label")
def get_asset_label(
    asset_pk: uuid.UUID,
    size: str = Query("4x2", pattern="^(2x2|4x2)$"),
    format: str = Query("png", pattern="^(png|jpg|pdf)$"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Response:
    """Generate and return an asset label/sticker in the requested size and format."""
    from ...services.label_service import generate_label
    from ...models.calibration_method import Procedure
    from ...models.team import Team

    asset = asset_repo.get_by_id(db, asset_pk)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    # Latest calibration
    cals = cal_repo.list_by_asset(db, asset_pk, skip=0, limit=1)
    latest_cal = cals[0] if cals else None

    # A few data points (just need units for equation)
    from ...repositories import calibration as _cal_repo
    points = _cal_repo.list_points(db, latest_cal.id) if latest_cal else []

    # Owner team name
    owner_name: str | None = None
    if asset.owner:
        team = db.query(Team).filter(Team.id == asset.owner).first()
        if team:
            owner_name = team.name

    from ...core.config import settings
    content, content_type = generate_label(
        asset=asset,
        calibration=latest_cal,
        points=points,
        owner_name=owner_name,
        size=size,
        fmt=format,
        base_url=settings.frontend_url,
    )

    ext = "pdf" if format == "pdf" else ("jpg" if format == "jpg" else "png")
    filename = f"label-{asset.asset_id}-{size}.{ext}"

    return Response(
        content=content,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
