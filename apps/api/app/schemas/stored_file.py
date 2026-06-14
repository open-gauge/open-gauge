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
    uploaded_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}
