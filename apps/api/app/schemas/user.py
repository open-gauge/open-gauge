import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from ..models.user import UserRole

# Mirrors apps/web/src/i18n/locales.ts's LOCALE_CODES — the UI only ever sends one of
# these, but validate server-side too so a bad value can't get persisted directly via the API.
SUPPORTED_LANGUAGES = ("en", "es", "fr", "de")


class UserCreate(BaseModel):
    email: str = Field(min_length=3)
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.viewer


class UserUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    role: UserRole | None = None
    is_active: bool | None = None
    is_verified: bool | None = None


class UserSelfUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    email: str | None = Field(None, min_length=3, max_length=255)
    language: str | None = Field(None, min_length=2, max_length=10)

    @field_validator("language")
    @classmethod
    def validate_language(cls, value: str | None) -> str | None:
        if value is not None and value not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported language: {value}")
        return value


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    role: UserRole
    is_active: bool
    is_verified: bool
    profile_picture_id: uuid.UUID | None = None
    profile_picture_url: str | None = None
    language: str
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
