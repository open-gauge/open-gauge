import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class SensorChannelCreate(BaseModel):
    sensor_id: uuid.UUID | None = None  # stable identifier for updates; ignored on create
    channel_id: str = Field(min_length=1, max_length=255)
    physical_quantity: str = Field(min_length=1, max_length=255)
    measurement_type: str | None = None
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
    calibration_method_id: uuid.UUID | None = None
    calibration_interval: int | None = None
    # Default report template for this channel's calibrations — at most one of the pair.
    default_certificate_template_id: uuid.UUID | None = None
    default_document_template_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _at_most_one_default_template(self) -> "SensorChannelCreate":
        if self.default_certificate_template_id and self.default_document_template_id:
            raise ValueError("Set at most one of default_certificate_template_id / default_document_template_id")
        return self


class SensorChannelResponse(SensorChannelCreate):
    id: uuid.UUID
    asset_id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime
    calibration_method_name: str | None = None  # resolved via join in _enrich
    default_certificate_template_name: str | None = None  # resolved via join in _enrich
    default_document_template_name: str | None = None  # resolved via join in _enrich

    model_config = {"from_attributes": True}
