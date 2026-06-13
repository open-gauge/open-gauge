import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None
    actor_email: str
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    entity_asset_id: str | None
    before_state: Any | None
    after_state: Any | None
    ip_address: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
