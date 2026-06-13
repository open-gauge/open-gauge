import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class CertificateCreate(BaseModel):
    asset_id: uuid.UUID
    calibration_id: uuid.UUID | None = None
    certificate_number: str = Field(min_length=1, max_length=255)
    issued_by: str = Field(min_length=1, max_length=255)
    accreditation_body: str | None = None
    accreditation_number: str | None = None
    issued_at: date
    valid_until: date | None = None


class CertificateResponse(BaseModel):
    id: uuid.UUID
    asset_id: uuid.UUID
    calibration_id: uuid.UUID | None
    certificate_number: str
    issued_by: str
    accreditation_body: str | None
    accreditation_number: str | None
    issued_at: date
    valid_until: date | None
    file_id: uuid.UUID | None
    is_active: bool
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}
