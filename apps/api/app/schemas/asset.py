import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from ..models.asset import AssetCategory, CalibrationStatus
from .sensor import SensorDetails
from .instrument import InstrumentDetails
from .data_acquisition import DaqDetails


class AssetCreate(BaseModel):
    asset_id: str = Field(min_length=1, max_length=20, pattern=r"^MAR-\d{5}$")
    laboratory_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    category: AssetCategory
    manufacturer: str = Field(min_length=1, max_length=255)
    model: str = Field(min_length=1, max_length=255)
    serial_number: str | None = None
    firmware_version: str | None = None
    purchase_date: date | None = None
    warranty_expiry_date: date | None = None
    calibration_interval_days: int | None = None
    notes: str | None = None
    sensor_details: SensorDetails | None = None
    instrument_details: InstrumentDetails | None = None
    daq_details: DaqDetails | None = None


class AssetUpdate(BaseModel):
    laboratory_id: uuid.UUID | None = None
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    firmware_version: str | None = None
    purchase_date: date | None = None
    warranty_expiry_date: date | None = None
    calibration_interval_days: int | None = None
    calibration_status: CalibrationStatus | None = None
    next_due_at: datetime | None = None
    health_score: int | None = Field(None, ge=0, le=100)
    notes: str | None = None


class AssetResponse(BaseModel):
    id: uuid.UUID
    asset_id: str
    laboratory_id: uuid.UUID | None
    name: str
    description: str | None
    category: AssetCategory
    manufacturer: str
    model: str
    serial_number: str | None
    firmware_version: str | None
    purchase_date: date | None
    warranty_expiry_date: date | None
    calibration_status: CalibrationStatus
    calibration_interval_days: int | None
    next_due_at: datetime | None
    health_score: int
    notes: str | None
    is_active: bool
    retired_at: datetime | None
    retired_reason: str | None
    version: int
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    sensor_details: SensorDetails | None = None
    instrument_details: InstrumentDetails | None = None
    daq_details: DaqDetails | None = None

    model_config = {"from_attributes": True}


class AssetListItem(BaseModel):
    id: uuid.UUID
    asset_id: str
    name: str
    category: AssetCategory
    manufacturer: str
    model: str
    calibration_status: CalibrationStatus
    next_due_at: datetime | None
    health_score: int
    is_active: bool
    updated_at: datetime

    model_config = {"from_attributes": True}
