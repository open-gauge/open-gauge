from datetime import datetime

from pydantic import BaseModel, Field


class EmailSettingsResponse(BaseModel):
    smtp_host: str | None
    smtp_port: int
    smtp_username: str | None
    has_smtp_password: bool
    smtp_use_tls: bool
    from_email: str | None
    from_name: str
    enabled: bool
    calibration_reminder_days: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class EmailSettingsUpdate(BaseModel):
    smtp_host: str | None = None
    smtp_port: int | None = Field(None, ge=1, le=65535)
    smtp_username: str | None = None
    # Omit to leave the stored password unchanged; pass "" to clear it.
    smtp_password: str | None = None
    smtp_use_tls: bool | None = None
    from_email: str | None = None
    from_name: str | None = Field(None, min_length=1, max_length=255)
    enabled: bool | None = None
    calibration_reminder_days: int | None = Field(None, ge=1, le=90)


class TestEmailRequest(BaseModel):
    to_email: str = Field(min_length=3)
