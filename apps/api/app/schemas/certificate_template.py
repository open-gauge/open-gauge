import uuid
from datetime import datetime

from pydantic import BaseModel


class CertificateTemplateResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID | None
    name: str
    description: str | None
    is_default: bool
    is_active: bool
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CertificateTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_default: bool | None = None
    is_active: bool | None = None
