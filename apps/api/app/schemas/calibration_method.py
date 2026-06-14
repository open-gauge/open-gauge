import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class CalibrationMethodCreate(BaseModel):
    physical_quantity: str
    name: str
    description: str | None = None
    required_equipment: str | None = None
    steps: list[dict[str, Any]] | None = None


class CalibrationMethodResponse(CalibrationMethodCreate):
    id: uuid.UUID
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
