import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.asset import Asset, AssetType
from ..models.calibration import Calibration
from ..models.calibration_method import CalibrationMethod
from ..models.sensor import Sensor
from ..models.daq import DAQ
from ..models.location import Location
from ..models.asset_location import AssetLocation
from ..models.team import Team
from ..schemas.sensor import SensorChannelCreate
from ..schemas.daq import DaqCreate


def get_by_id(db: Session, asset_pk: uuid.UUID) -> Asset | None:
    return db.query(Asset).filter(Asset.id == asset_pk).first()


def get_by_asset_id(db: Session, asset_id: str) -> Asset | None:
    return db.query(Asset).filter(Asset.asset_id == asset_id).first()


def _resolve_location_path(loc_id: uuid.UUID | None, all_locs: dict) -> tuple[str | None, str | None]:
    """Walk the location ancestor chain and return (root_name, leaf_name)."""
    if not loc_id:
        return None, None
    path: list[str] = []
    current = str(loc_id)
    while current and current in all_locs:
        loc = all_locs[current]
        path.append(loc.name)
        current = str(loc.parent_location_id) if loc.parent_location_id else ""
    path.reverse()  # [root, …, leaf]
    return path[0] if path else None, path[-1] if path else None


def list_assets(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    is_active: bool | None = None,
    asset_type: AssetType | None = None,
    location_id: uuid.UUID | None = None,
) -> list[dict]:
    today = date.today()

    # ------------------------------------------------------------------
    # 1. Load all locations once for path resolution (avoids N+1)
    # ------------------------------------------------------------------
    all_locs: dict[str, Location] = {
        str(loc.id): loc for loc in db.query(Location).all()
    }

    # ------------------------------------------------------------------
    # 2. Load assets
    # ------------------------------------------------------------------
    q = db.query(Asset)
    if is_active is not None:
        q = q.filter(Asset.is_active == is_active)
    if asset_type:
        q = q.filter(Asset.asset_type == asset_type)
    if location_id:
        q = q.filter(Asset.location_id == location_id)

    assets = q.order_by(Asset.updated_at.desc()).offset(skip).limit(limit).all()
    if not assets:
        return []

    asset_uuids = [a.id for a in assets]

    # ------------------------------------------------------------------
    # 3. Latest calibration due_date per asset (single aggregate query)
    # ------------------------------------------------------------------
    cal_rows = (
        db.query(Calibration.asset_id, func.max(Calibration.due_date))
        .filter(Calibration.asset_id.in_(asset_uuids))
        .group_by(Calibration.asset_id)
        .all()
    )
    cal_map: dict[str, date] = {str(row[0]): row[1] for row in cal_rows}

    # ------------------------------------------------------------------
    # 4. Sensor channels per asset
    # ------------------------------------------------------------------
    sensor_rows = (
        db.query(Sensor)
        .filter(Sensor.asset_id.in_(asset_uuids))
        .order_by(Sensor.created_at)
        .all()
    )
    sensor_map: dict[str, list[Sensor]] = {}
    for s in sensor_rows:
        sensor_map.setdefault(str(s.asset_id), []).append(s)

    # ------------------------------------------------------------------
    # 5. DAQ details per asset
    # ------------------------------------------------------------------
    daq_rows = db.query(DAQ).filter(DAQ.asset_id.in_(asset_uuids)).all()
    daq_map: dict[str, DAQ] = {str(d.asset_id): d for d in daq_rows}

    # ------------------------------------------------------------------
    # 6. Build result list
    # ------------------------------------------------------------------
    result: list[dict] = []
    for asset in assets:
        aid = str(asset.id)

        site_name, location_name = _resolve_location_path(asset.location_id, all_locs)

        # Calibration status
        due_date = cal_map.get(aid)
        if not asset.is_active:
            cal_status = "retired"
        elif due_date is None:
            cal_status = "not_calibrated"
        elif due_date < today:
            cal_status = "expired"
        elif due_date <= today + timedelta(days=30):
            cal_status = "due_soon"
        else:
            cal_status = "valid"

        # Sensor / DAQ specific fields
        channels: list[dict] = []
        subtype: str | None = None
        technology: str | None = None
        range_min: float | None = None
        range_max: float | None = None
        range_unit: str | None = None

        if asset.asset_type == AssetType.sensor:
            for ch in sensor_map.get(aid, []):
                channels.append({
                    "channel_id": ch.channel_id,
                    "physical_quantity": ch.physical_quantity,
                    "technology": ch.technology,
                    "measurement_min": float(ch.measurement_min) if ch.measurement_min is not None else None,
                    "measurement_max": float(ch.measurement_max) if ch.measurement_max is not None else None,
                    "unit": ch.unit,
                })
            if channels:
                first = channels[0]
                subtype = first["physical_quantity"]
                technology = first["technology"]
                range_min = first["measurement_min"]
                range_max = first["measurement_max"]
                range_unit = first["unit"]
        elif asset.asset_type == AssetType.daq:
            daq = daq_map.get(aid)
            if daq:
                subtype = daq.daq_type

        result.append({
            "id": asset.id,
            "asset_id": asset.asset_id,
            "asset_type": asset.asset_type,
            "name": asset.name,
            "manufacturer": asset.manufacturer,
            "model": asset.model,
            "serial_number": asset.serial_number,
            "health_score": asset.health_score,
            "is_active": asset.is_active,
            "updated_at": asset.updated_at,
            "site_name": site_name,
            "location_name": location_name,
            "calibration_status": cal_status,
            "next_due_at": due_date,
            "subtype": subtype,
            "technology": technology,
            "range_min": range_min,
            "range_max": range_max,
            "range_unit": range_unit,
            "channels": channels,
        })
    return result


def create(db: Session, created_by: uuid.UUID, **kwargs) -> Asset:
    sensor_channels: list[SensorChannelCreate] | None = kwargs.pop("sensor_channels", None)
    daq_data: DaqCreate | None = kwargs.pop("daq_details", None)

    asset = Asset(created_by=created_by, **kwargs)
    db.add(asset)
    db.flush()

    if sensor_channels:
        for ch in sensor_channels:
            db.add(Sensor(asset_id=asset.id, **ch.model_dump()))

    if daq_data:
        db.add(DAQ(asset_id=asset.id, **daq_data.model_dump()))

    if asset.location_id:
        db.add(AssetLocation(
            asset_id=asset.id,
            location_id=asset.location_id,
            moved_by=created_by,
            reason="Initial placement",
        ))

    db.commit()
    db.refresh(asset)
    return asset


def move(db: Session, asset: Asset, location_id: uuid.UUID, moved_by: uuid.UUID, reason: str | None = None) -> Asset:
    asset.location_id = location_id
    asset.version += 1
    db.add(AssetLocation(
        asset_id=asset.id,
        location_id=location_id,
        moved_by=moved_by,
        reason=reason,
    ))
    db.commit()
    db.refresh(asset)
    return asset


def update(db: Session, asset: Asset, **kwargs) -> Asset:
    asset.version += 1
    for key, value in kwargs.items():
        if value is not None:
            setattr(asset, key, value)
    db.commit()
    db.refresh(asset)
    return asset


def retire(db: Session, asset: Asset, retired_by: uuid.UUID, reason: str | None = None) -> Asset:
    asset.is_active = False
    asset.retired_at = datetime.now(timezone.utc)
    asset.retired_by = retired_by
    asset.retired_reason = reason
    asset.version += 1
    db.commit()
    db.refresh(asset)
    return asset


def get_profile_extras(db: Session, asset_pk: uuid.UUID) -> dict:
    """Compute enriched fields for the asset profile endpoint."""
    asset = get_by_id(db, asset_pk)
    if not asset:
        return {}
    today = date.today()

    # Location path + leaf location details
    all_locs: dict[str, Location] = {
        str(loc.id): loc for loc in db.query(Location).all()
    }
    site_name, location_name = _resolve_location_path(asset.location_id, all_locs)

    location_code: str | None = None
    location_description: str | None = None
    location_latitude: float | None = None
    location_longitude: float | None = None
    if asset.location_id:
        leaf = all_locs.get(str(asset.location_id))
        if leaf:
            location_code = leaf.code
            location_description = leaf.description
            location_latitude = float(leaf.latitude) if leaf.latitude is not None else None
            location_longitude = float(leaf.longitude) if leaf.longitude is not None else None

    # Owner team name
    owner_name: str | None = None
    if asset.owner:
        team = db.query(Team).filter(Team.id == asset.owner).first()
        if team:
            owner_name = team.name

    # Calibration summary
    cals = (
        db.query(Calibration)
        .filter(Calibration.asset_id == asset_pk)
        .order_by(Calibration.calibration_date.desc())
        .all()
    )
    cal_count = len(cals)
    last_cal_date: date | None = cals[0].calibration_date if cals else None
    latest_due: date | None = max((c.due_date for c in cals), default=None)

    if not asset.is_active:
        cal_status = "retired"
    elif not cals:
        cal_status = "not_calibrated"
    elif latest_due < today:  # type: ignore[operator]
        cal_status = "expired"
    elif latest_due <= today + timedelta(days=30):  # type: ignore[operator]
        cal_status = "due_soon"
    else:
        cal_status = "valid"

    # Subtype / technology from first channel
    channels = get_sensor_channels(db, asset_pk)
    daq = get_daq_details(db, asset_pk)
    subtype: str | None = None
    technology: str | None = None
    if asset.asset_type == AssetType.sensor and channels:
        subtype = channels[0].physical_quantity
        technology = channels[0].technology
    elif asset.asset_type == AssetType.daq and daq:
        subtype = daq.daq_type

    return {
        "site_name": site_name,
        "location_name": location_name,
        "location_code": location_code,
        "location_description": location_description,
        "location_latitude": location_latitude,
        "location_longitude": location_longitude,
        "calibration_status": cal_status,
        "next_due_at": latest_due,
        "last_calibration_date": last_cal_date,
        "calibration_count": cal_count,
        "subtype": subtype,
        "technology": technology,
        "owner_name": owner_name,
    }


def get_sensor_channels(db: Session, asset_pk: uuid.UUID) -> list[Sensor]:
    return db.query(Sensor).filter(Sensor.asset_id == asset_pk).all()


def get_daq_details(db: Session, asset_pk: uuid.UUID) -> DAQ | None:
    return db.query(DAQ).filter(DAQ.asset_id == asset_pk).first()


def get_location_history(db: Session, asset_pk: uuid.UUID) -> list[AssetLocation]:
    return (
        db.query(AssetLocation)
        .filter(AssetLocation.asset_id == asset_pk)
        .order_by(AssetLocation.moved_at.desc())
        .all()
    )
