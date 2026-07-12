import re

from pydantic import BaseModel, Field, field_validator

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _validate_email(v: str) -> str:
    if not _EMAIL_RE.match(v):
        raise ValueError("Invalid email address format")
    return v.lower()


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _validate_email(v)


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3)
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _validate_email(v)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterResponse(BaseModel):
    """access_token is set only when email verification isn't required (mail not
    configured) — in that case registration behaves like before: the user is
    logged in immediately. Otherwise the caller must verify their email first."""
    access_token: str | None = None
    token_type: str = "bearer"
    verification_required: bool
    message: str


class ResendVerificationRequest(BaseModel):
    email: str = Field(min_length=3)

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _validate_email(v)


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    is_active: bool

    model_config = {"from_attributes": True}
