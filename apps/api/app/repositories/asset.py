import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models.asset import Asset, AssetCategory, CalibrationStatus
from ..models.sensor import Sensor, SensorType
from ..models.instrument import Instrument, InstrumentType
from ..models.data_acquisition import DataAcquisition, DaqType
from ..schemas.sensor import SensorDetails
from ..schemas.instrument import InstrumentDetails
from ..schemas.data_acquisition import DaqDetails


def get_by_id(db: Session, asset_pk: uuid.UUID) -> Asset | None:
    return db.query(Asset).filter(Asset.id == asset_pk).first()


def get_by_asset_id(db: Session, asset_id: str) -> Asset | None:
    return db.query(Asset).filter(Asset.asset_id == asset_id).first()


def list_assets(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    is_active: bool | None = True,
    calibration_status: CalibrationStatus | None = None,
    category: AssetCategory | None = None,
    laboratory_id: uuid.UUID | None = None,
) -> list[Asset]:
    q = db.query(Asset)
    if is_active is not None:
        q = q.filter(Asset.is_active == is_active)
    if calibration_status:
        q = q.filter(Asset.calibration_status == calibration_status)
    if category:
        q = q.filter(Asset.category == category)
    if laboratory_id:
        q = q.filter(Asset.laboratory_id == laboratory_id)
    return q.order_by(Asset.updated_at.desc()).offset(skip).limit(limit).all()


def create(db: Session, created_by: uuid.UUID, **kwargs) -> Asset:
    sensor_data: SensorDetails | None = kwargs.pop("sensor_details", None)
    instrument_data: InstrumentDetails | None = kwargs.pop("instrument_details", None)
    daq_data: DaqDetails | None = kwargs.pop("daq_details", None)

    asset = Asset(created_by=created_by, **kwargs)
    db.add(asset)
    db.flush()

    if sensor_data:
        db.add(Sensor(asset_id=asset.id, **sensor_data.model_dump()))
    if instrument_data:
        db.add(Instrument(asset_id=asset.id, **instrument_data.model_dump()))
    if daq_data:
        db.add(DataAcquisition(asset_id=asset.id, **daq_data.model_dump()))

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


def get_sensor_details(db: Session, asset_pk: uuid.UUID) -> Sensor | None:
    return db.query(Sensor).filter(Sensor.asset_id == asset_pk).first()


def get_instrument_details(db: Session, asset_pk: uuid.UUID) -> Instrument | None:
    return db.query(Instrument).filter(Instrument.asset_id == asset_pk).first()


def get_daq_details(db: Session, asset_pk: uuid.UUID) -> DataAcquisition | None:
    return db.query(DataAcquisition).filter(DataAcquisition.asset_id == asset_pk).first()
