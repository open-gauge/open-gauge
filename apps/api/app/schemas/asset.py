import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field

from ..models.asset import AssetType
from .sensor import SensorChannelCreate, SensorChannelResponse
from .daq import DaqCreate, DaqResponse


class ChannelListItem(BaseModel):
    channel_id: str
    physical_quantity: str
    technology: str | None
    measurement_min: float | None
    measurement_max: float | None
    unit: str
    calibration_role: str | None = None


class AssetCreate(BaseModel):
    asset_id: str = Field(min_length=1, max_length=20, pattern=r"^MAR-\d{5}$")
    asset_type: AssetType
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    manufacturer: str = Field(min_length=1, max_length=255)
    model: str = Field(min_length=1, max_length=255)
    serial_number: str | None = None
    manufacturer_part_number: str | None = None
    location_id: uuid.UUID | None = None
    owner: uuid.UUID | None = None
    datasheet_url: str | None = None
    firmware_version: str | None = None
    power_supply: str | None = None
    power_consumption_w: int | None = None
    dimensions: str | None = None
    weight_kg: float | None = None
    mounting_type: str | None = None
    connection_type: str | None = None
    displays_readings: bool = False
    ip_rating: str | None = None
    hazardous_area_rating: str | None = None
    operating_temperature_min: float | None = None
    operating_temperature_max: float | None = None
    operating_humidity_min: float | None = None
    operating_humidity_max: float | None = None
    price_eur: float | None = None
    purchase_date: date | None = None
    warranty_expiry_date: date | None = None
    notes: str | None = None
    pinout_table: list[dict[str, Any]] | None = None
    pinout_image_id: uuid.UUID | None = None
    sensor_image_id: uuid.UUID | None = None
    sensor_schematic_id: uuid.UUID | None = None
    sensor_channels: list[SensorChannelCreate] | None = None
    daq_details: DaqCreate | None = None


class AssetUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    manufacturer_part_number: str | None = None
    owner: uuid.UUID | None = None
    location_id: uuid.UUID | None = None
    firmware_version: str | None = None
    power_supply: str | None = None
    power_consumption_w: int | None = None
    dimensions: str | None = None
    weight_kg: float | None = None
    mounting_type: str | None = None
    connection_type: str | None = None
    displays_readings: bool | None = None
    ip_rating: str | None = None
    hazardous_area_rating: str | None = None
    operating_temperature_min: float | None = None
    operating_temperature_max: float | None = None
    operating_humidity_min: float | None = None
    operating_humidity_max: float | None = None
    health_score: int | None = Field(None, ge=0, le=100)
    price_eur: float | None = None
    purchase_date: date | None = None
    warranty_expiry_date: date | None = None
    notes: str | None = None
    pinout_table: list[dict[str, Any]] | None = None
    sensor_channels: list[SensorChannelCreate] | None = None


class AssetResponse(BaseModel):
    id: uuid.UUID
    asset_id: str
    asset_type: AssetType
    name: str
    description: str | None
    manufacturer: str
    model: str
    serial_number: str | None
    manufacturer_part_number: str | None
    location_id: uuid.UUID | None
    owner: uuid.UUID | None
    datasheet_url: str | None
    firmware_version: str | None
    power_supply: str | None
    power_consumption_w: int | None
    dimensions: str | None
    weight_kg: float | None
    mounting_type: str | None
    connection_type: str | None
    displays_readings: bool
    ip_rating: str | None
    hazardous_area_rating: str | None
    operating_temperature_min: float | None
    operating_temperature_max: float | None
    operating_humidity_min: float | None
    operating_humidity_max: float | None
    health_score: int
    price_eur: float | None
    purchase_date: date | None
    warranty_expiry_date: date | None
    is_active: bool
    retired_at: datetime | None
    retired_reason: str | None
    version: int
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    notes: str | None
    pinout_table: list[dict[str, Any]] | None = None
    pinout_image_id: uuid.UUID | None = None
    sensor_image_id: uuid.UUID | None = None
    sensor_schematic_id: uuid.UUID | None = None
    sensor_channels: list[SensorChannelResponse] = []
    daq_details: DaqResponse | None = None

    model_config = {"from_attributes": True}


class AssetProfileResponse(AssetResponse):
    site_name: str | None = None
    location_name: str | None = None
    location_code: str | None = None
    location_description: str | None = None
    location_latitude: float | None = None
    location_longitude: float | None = None
    calibration_status: str = "not_calibrated"
    next_due_at: date | None = None
    last_calibration_date: date | None = None
    calibration_count: int = 0
    subtype: str | None = None
    technology: str | None = None
    owner_name: str | None = None


class AssetListItem(BaseModel):
    id: uuid.UUID
    asset_id: str
    asset_type: AssetType
    name: str
    manufacturer: str
    model: str
    serial_number: str | None = None
    health_score: int
    is_active: bool
    updated_at: datetime
    # location path
    site_name: str | None = None       # highest-level ancestor
    location_name: str | None = None   # direct location (may equal site_name)
    # calibration
    calibration_status: str = "not_calibrated"
    next_due_at: date | None = None
    # type info
    subtype: str | None = None         # physical_quantity (sensor) or daq_type (DAQ)
    technology: str | None = None      # sensor technology (first channel)
    # measurement range (first / primary channel)
    range_min: float | None = None
    range_max: float | None = None
    range_unit: str | None = None
    # all sensor channels
    channels: list[ChannelListItem] = []
