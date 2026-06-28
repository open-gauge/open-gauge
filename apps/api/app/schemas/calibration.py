import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


# ------------------------------------------------------------------ #
# Analyze endpoint                                                    #
# ------------------------------------------------------------------ #

class AnalyzePointIn(BaseModel):
    reference: float
    measured: float


class AnalyzeRequest(BaseModel):
    points: list[AnalyzePointIn] = Field(min_length=2)
    reference_unit: str
    measured_unit: str
    physical_quantity: str = ""
    poly_degree: int | None = None
    distribution_type: str = "normal"
    confidence_level: float = 95.0
    coverage_factor: float = 2.0
    channel_accuracy_value: float | None = None
    channel_accuracy_type: str | None = None


class AnalyzePointOut(BaseModel):
    point_index: int
    reference_value: float
    measured_value: float
    calculated_value: float | None
    residual_abs: float | None
    residual_pct: float | None


class AnalyzeResponse(BaseModel):
    poly_degree: int
    coefficients: list[float]
    r_squared: float
    rmse: float
    standard_error: float
    max_error: float
    full_scale_error_pct: float
    non_linearity_pct: float
    repeatability: float | None
    hysteresis: float | None
    combined_uncertainty: float
    expanded_uncertainty: float
    distribution_type: str
    confidence_level: float
    coverage_factor: float
    valid_range_min: float
    valid_range_max: float
    passed: bool
    points: list[AnalyzePointOut]


# ------------------------------------------------------------------ #
# Calibration data points                                            #
# ------------------------------------------------------------------ #

class CalibrationPointInline(BaseModel):
    point_index: int
    reference_value: float
    measured_value: float
    calculated_value: float | None = None
    residual_abs: float | None = None
    residual_pct: float | None = None
    reference_unit: str
    measured_unit: str


class CalibrationPointResponse(BaseModel):
    id: uuid.UUID
    calibration_id: uuid.UUID
    point_index: int
    reference_value: float
    measured_value: float
    calculated_value: float | None
    residual_abs: float | None
    residual_pct: float | None
    reference_unit: str
    measured_unit: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ------------------------------------------------------------------ #
# Calibration create / response (flat)                               #
# ------------------------------------------------------------------ #

class CalibrationCreate(BaseModel):
    asset_id: uuid.UUID
    calibration_date: date
    due_date: date
    performed_by_name: str = Field(min_length=1, max_length=255)
    performed_by_user_id: uuid.UUID | None = None
    external_lab_name: str | None = None
    notes: str | None = None

    # Metadata
    sensor_id: uuid.UUID | None = None
    calibration_type: str = "external"
    calibration_version: int = 1
    calibration_interval: int | None = None
    tolerance_criteria: str | None = None

    # Traceability
    internal_reference_asset_id: uuid.UUID | None = None
    internal_procedure_id: uuid.UUID | None = None
    external_lab_certificate_number: str | None = None
    daq_id: uuid.UUID | None = None
    calibration_location_id: uuid.UUID | None = None

    # Environmental conditions (canonical units: °C, %RH, Pa)
    temperature: float | None = None
    humidity: float | None = None
    pressure: float | None = None

    # Polynomial model
    poly_order: int | None = None
    poly_coefficients: list[float] | None = None
    range_min: float | None = None
    range_max: float | None = None

    # Regression statistics
    r_squared: float | None = None
    rmse: float | None = None
    standard_error: float | None = None
    max_error: float | None = None
    full_scale_error: float | None = None
    non_linearity: float | None = None
    repeatability: float | None = None
    hysteresis: float | None = None
    distribution_type: str | None = None
    confidence_level: float | None = None
    coverage_factor: float | None = None
    combined_uncertainty: float | None = None
    expanded_uncertainty: float | None = None
    valid_range_min: float | None = None
    valid_range_max: float | None = None

    # Embedded data points
    points: list[CalibrationPointInline] = Field(default_factory=list)


class CalibrationResponse(BaseModel):
    id: uuid.UUID
    asset_id: uuid.UUID
    calibration_date: date
    due_date: date
    performed_by_user_id: uuid.UUID | None
    performed_by_name: str
    external_lab_name: str | None
    notes: str | None
    calibration_file_id: uuid.UUID | None
    created_by: uuid.UUID
    created_at: datetime

    # Metadata
    sensor_id: uuid.UUID | None
    calibration_type: str
    calibration_version: int
    calibration_interval: int | None
    tolerance_criteria: str | None

    # Traceability
    internal_reference_asset_id: uuid.UUID | None
    internal_procedure_id: uuid.UUID | None
    external_lab_certificate_number: str | None
    daq_id: uuid.UUID | None
    calibration_data_id: uuid.UUID | None
    calibration_location_id: uuid.UUID | None = None

    # Environmental conditions
    temperature: float | None
    humidity: float | None
    pressure: float | None

    # Polynomial model
    poly_order: int | None
    poly_coefficients: Any | None
    range_min: float | None
    range_max: float | None

    # Regression statistics
    r_squared: float | None
    rmse: float | None
    standard_error: float | None
    max_error: float | None
    full_scale_error: float | None
    non_linearity: float | None
    repeatability: float | None
    hysteresis: float | None
    distribution_type: str | None
    confidence_level: float | None
    coverage_factor: float | None
    combined_uncertainty: float | None
    expanded_uncertainty: float | None
    valid_range_min: float | None
    valid_range_max: float | None

    model_config = {"from_attributes": True}
