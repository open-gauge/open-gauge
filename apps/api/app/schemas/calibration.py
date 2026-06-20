import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field

from ..models.calibration import CalibrationResult


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
# Calibration create / response                                       #
# ------------------------------------------------------------------ #

class CalibrationCoefficientInline(BaseModel):
    """Coefficient data embedded in the atomic CalibrationCreate payload."""
    channel: str | None = None
    unit_input: str | None = None
    unit_output: str | None = None
    # The wizard always submits polynomial coefficients
    poly_degree: int
    poly_coefficients: list[float]
    range_min: float | None = None
    range_max: float | None = None
    # Statistics from analysis
    r_squared: float | None = None
    rmse: float | None = None
    standard_error: float | None = None
    max_error: float | None = None
    full_scale_error_pct: float | None = None
    non_linearity_pct: float | None = None
    repeatability: float | None = None
    hysteresis: float | None = None
    distribution_type: str | None = None
    confidence_level: float | None = None
    combined_uncertainty: float | None = None
    expanded_uncertainty: float | None = None
    valid_range_min: float | None = None
    valid_range_max: float | None = None
    notes: str | None = None


class CalibrationPointInline(BaseModel):
    """Raw data point embedded in the atomic CalibrationCreate payload."""
    point_index: int
    reference_value: float
    measured_value: float
    calculated_value: float | None = None
    residual_abs: float | None = None
    residual_pct: float | None = None
    reference_unit: str
    measured_unit: str


class CalibrationCreate(BaseModel):
    asset_id: uuid.UUID
    calibration_date: date
    due_date: date
    performed_by_name: str = Field(min_length=1, max_length=255)
    performed_by_user_id: uuid.UUID | None = None
    external_lab_name: str | None = None
    external_lab_accreditation: str | None = None
    result: CalibrationResult
    notes: str | None = None
    # Migration 004 fields
    sensor_id: uuid.UUID | None = None
    calibration_type: str = "external"
    reference_asset_id: uuid.UUID | None = None
    calibration_method_id: uuid.UUID | None = None
    certificate_number: str | None = None
    certificate_expiry_date: date | None = None
    calibration_interval: int | None = None
    version: int = 1
    temperature_value: float | None = None
    temperature_unit: str | None = None
    pressure_value: float | None = None
    pressure_unit: str | None = None
    humidity_value: float | None = None
    humidity_unit: str | None = None
    # Embedded coefficient and points (optional — coefficients-only flow skips points)
    coefficient: CalibrationCoefficientInline | None = None
    points: list[CalibrationPointInline] = Field(default_factory=list)


class CalibrationResponse(BaseModel):
    id: uuid.UUID
    asset_id: uuid.UUID
    calibration_date: date
    due_date: date
    performed_by_user_id: uuid.UUID | None
    performed_by_name: str
    external_lab_name: str | None
    external_lab_accreditation: str | None
    result: CalibrationResult
    temperature_c: float | None
    humidity_pct: float | None
    pressure_hpa: float | None
    notes: str | None
    calibration_file_id: uuid.UUID | None
    created_by: uuid.UUID
    created_at: datetime
    # Migration 004
    sensor_id: uuid.UUID | None
    calibration_type: str
    reference_asset_id: uuid.UUID | None
    calibration_method_id: uuid.UUID | None
    certificate_number: str | None
    certificate_expiry_date: date | None
    calibration_interval: int | None
    version: int
    temperature_value: float | None
    temperature_unit: str | None
    pressure_value: float | None
    pressure_unit: str | None
    humidity_value: float | None
    humidity_unit: str | None

    model_config = {"from_attributes": True}


# ------------------------------------------------------------------ #
# Calibration points response                                         #
# ------------------------------------------------------------------ #

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
