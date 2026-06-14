import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models.asset import Asset, AssetType
from ..models.sensor import Sensor
from ..models.daq import DAQ
from ..models.location import Location
from ..models.asset_location import AssetLocation
from ..schemas.sensor import SensorChannelCreate
from ..schemas.daq import DaqCreate


def get_by_id(db: Session, asset_pk: uuid.UUID) -> Asset | None:
    return db.query(Asset).filter(Asset.id == asset_pk).first()


def get_by_asset_id(db: Session, asset_id: str) -> Asset | None:
    return db.query(Asset).filter(Asset.asset_id == asset_id).first()


def list_assets(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    is_active: bool | None = True,
    asset_type: AssetType | None = None,
    location_id: uuid.UUID | None = None,
) -> list[dict]:
    q = (
        db.query(Asset, Location.name)
        .outerjoin(Location, Location.id == Asset.location_id)
    )
    if is_active is not None:
        q = q.filter(Asset.is_active == is_active)
    if asset_type:
        q = q.filter(Asset.asset_type == asset_type)
    if location_id:
        q = q.filter(Asset.location_id == location_id)

    rows = q.order_by(Asset.updated_at.desc()).offset(skip).limit(limit).all()

    result = []
    for asset, location_name in rows:
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
            "location_name": location_name,
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
