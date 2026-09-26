import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

TemplateType = Literal["certificate", "procedure"]
TemplateStatus = Literal["draft", "published", "archived"]

_REQUIRED_DOCUMENT_KEYS = ("settings", "header", "footer", "blocks")


def _validate_document_shape(value: dict[str, Any]) -> dict[str, Any]:
    """
    The document tree's per-block-type shape is enforced by the frontend's
    TypeScript union (the frontend is the only writer today) — the backend
    only guards the envelope so a malformed payload fails fast with a clear
    error instead of being persisted and breaking the editor/PDF renderer
    later. See apps/web/src/types/template.ts for the authoritative shape.
    """
    for key in _REQUIRED_DOCUMENT_KEYS:
        if key not in value:
            raise ValueError(f"document.{key} is required")
    if not isinstance(value["blocks"], list):
        raise ValueError("document.blocks must be a list")
    for block in value["blocks"]:
        if not isinstance(block, dict) or "id" not in block or "type" not in block:
            raise ValueError("each block requires an id and a type")
    return value


class DocumentTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    type: TemplateType


class DocumentTemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    document: dict[str, Any] | None = None

    @field_validator("document")
    @classmethod
    def _check_document(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        return v if v is None else _validate_document_shape(v)


class DocumentTemplateDuplicateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)


class DocumentTemplateResponse(BaseModel):
    id: uuid.UUID
    template_group_id: uuid.UUID
    name: str
    description: str | None
    type: str
    status: str
    version: int
    document: dict[str, Any]
    is_active: bool
    is_default: bool
    is_builtin: bool
    is_enabled: bool
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None

    model_config = {"from_attributes": True}


class DocumentTemplateListItem(BaseModel):
    id: uuid.UUID
    template_group_id: uuid.UUID
    name: str
    description: str | None
    type: str
    status: str
    version: int
    is_default: bool
    is_builtin: bool
    is_enabled: bool
    updated_at: datetime
    created_by: uuid.UUID

    model_config = {"from_attributes": True}


class SetEnabledRequest(BaseModel):
    enabled: bool
