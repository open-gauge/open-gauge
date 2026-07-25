from pydantic import BaseModel


class NotificationPreferenceItem(BaseModel):
    category: str
    email_enabled: bool
    in_app_enabled: bool

    model_config = {"from_attributes": True}


class NotificationPreferencesUpdate(BaseModel):
    preferences: list[NotificationPreferenceItem]
