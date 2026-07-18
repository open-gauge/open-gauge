import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from ..models.user import UserRole


class UserCreate(BaseModel):
    email: str = Field(min_length=3)
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.viewer
    organization_id: uuid.UUID | None = None


class UserUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    role: UserRole | None = None
    organization_id: uuid.UUID | None = None
    is_active: bool | None = None
    is_verified: bool | None = None


class UserSelfUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    email: str | None = Field(None, min_length=3, max_length=255)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class TeamSummary(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    role: UserRole
    teams: list[TeamSummary] = []
    organization_id: uuid.UUID | None
    is_active: bool
    is_superuser: bool
    is_verified: bool
    profile_picture_id: uuid.UUID | None = None
    profile_picture_url: str | None = None
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
