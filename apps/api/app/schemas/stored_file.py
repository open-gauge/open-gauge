import uuid
from datetime import datetime

from pydantic import BaseModel


class StoredFileResponse(BaseModel):
    id: uuid.UUID
    original_filename: str
    content_type: str
    size_bytes: int
    entity_type: str
    entity_id: uuid.UUID | None
    step_index: int | None = None
    uploaded_by: uuid.UUID
    created_at: datetime
    url: str | None = None

    model_config = {"from_attributes": True}
