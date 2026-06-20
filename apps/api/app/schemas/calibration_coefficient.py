import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from ..models.calibration_coefficient import CoefficientType


class CalibrationCoefficientCreate(BaseModel):
    calibration_id: uuid.UUID
    channel: str | None = None
    coefficient_type: CoefficientType
    offset_value: float | None = None
    gain: float | None = None
    poly_degree: int | None = None
    poly_coefficients: list[float] | None = None
    unit_input: str | None = None
    unit_output: str | None = None
    range_min: float | None = None
    range_max: float | None = None
    uncertainty: float | None = None
    uncertainty_coverage_factor: float | None = None
    notes: str | None = None
    # Statistics
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


class CalibrationCoefficientResponse(BaseModel):
    id: uuid.UUID
    calibration_id: uuid.UUID
    channel: str | None
    coefficient_type: CoefficientType
    offset_value: float | None
    gain: float | None
    poly_degree: int | None
    poly_coefficients: Any | None
    unit_input: str | None
    unit_output: str | None
    range_min: float | None
    range_max: float | None
    uncertainty: float | None
    uncertainty_coverage_factor: float | None
    notes: str | None
    created_at: datetime
    # Statistics
    r_squared: float | None
    rmse: float | None
    standard_error: float | None
    max_error: float | None
    full_scale_error_pct: float | None
    non_linearity_pct: float | None
    repeatability: float | None
    hysteresis: float | None
    distribution_type: str | None
    confidence_level: float | None
    combined_uncertainty: float | None
    expanded_uncertainty: float | None
    valid_range_min: float | None
    valid_range_max: float | None

    model_config = {"from_attributes": True}
