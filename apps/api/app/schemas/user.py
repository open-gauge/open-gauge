import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from ..models.user import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.viewer
    organization_id: uuid.UUID | None = None
    team: str | None = None


class UserUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    role: UserRole | None = None
    organization_id: uuid.UUID | None = None
    team: str | None = None
    is_active: bool | None = None


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    role: UserRole
    team: str | None
    organization_id: uuid.UUID | None
    is_active: bool
    is_superuser: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
