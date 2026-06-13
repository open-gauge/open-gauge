import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class LaboratoryCreate(BaseModel):
    site_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class LaboratoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None


class LaboratoryResponse(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    name: str
    description: str | None
    is_active: bool
    archived_at: datetime | None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
