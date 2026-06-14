import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SensorChannelCreate(BaseModel):
    channel_id: str = Field(min_length=1, max_length=255)
    physical_quantity: str = Field(min_length=1, max_length=255)
    unit: str = Field(min_length=1, max_length=50)
    technology: str | None = None
    measurement_min: float | None = None
    measurement_max: float | None = None
    accuracy_value: float | None = None
    accuracy_type: str | None = None
    accuracy_unit: str | None = None
    resolution: float | None = None
    resolution_unit: str | None = None
    measurement_uncertainty: float | None = None
    uncertainty_unit: str | None = None
    confidence_level: float | None = Field(None, ge=0, le=100)
    coverage_factor: float | None = None
    drift_rate: float | None = None
    drift_unit: str | None = None
    sensitivity: float | None = None
    sensitivity_unit: str | None = None
    response_time_ms: float | None = None
    bandwidth_hz: float | None = None
    output_signal_min: float | None = None
    output_signal_max: float | None = None
    output_signal_unit: str | None = None
    output_type: str | None = None
    calibration_role: str | None = None
    criticality: str | None = None


class SensorChannelResponse(SensorChannelCreate):
    id: uuid.UUID
    asset_id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
