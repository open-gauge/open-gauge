import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from ..models.calibration import CalibrationResult


class CalibrationCreate(BaseModel):
    asset_id: uuid.UUID
    calibration_date: date
    due_date: date
    performed_by_name: str = Field(min_length=1, max_length=255)
    performed_by_user_id: uuid.UUID | None = None
    external_lab_name: str | None = None
    external_lab_accreditation: str | None = None
    result: CalibrationResult
    temperature_c: float | None = None
    humidity_pct: float | None = None
    pressure_hpa: float | None = None
    notes: str | None = None


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

    model_config = {"from_attributes": True}
