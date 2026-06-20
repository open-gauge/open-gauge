import uuid
from datetime import datetime

from pydantic import BaseModel


class LocationCreate(BaseModel):
    organization_id: uuid.UUID
    parent_location_id: uuid.UUID | None = None
    name: str
    description: str | None = None
    location_type: str
    code: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class LocationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    location_type: str | None = None
    code: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    parent_location_id: uuid.UUID | None = None


class LocationResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    parent_location_id: uuid.UUID | None
    name: str
    description: str | None
    location_type: str
    code: str | None
    address: str | None
    latitude: float | None
    longitude: float | None
    is_active: bool
    archived_at: datetime | None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    asset_count: int = 0

    model_config = {"from_attributes": True}
