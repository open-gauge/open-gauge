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

    model_config = {"from_attributes": True}
