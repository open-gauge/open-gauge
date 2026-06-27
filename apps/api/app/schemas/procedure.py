import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ProcedureStep(BaseModel):
    title: str
    description: str | None = None
    duration_min: float | None = None


class ProcedureEquipmentItem(BaseModel):
    name: str
    model: str | None = None


class ProcedureMaterialItem(BaseModel):
    name: str
    quantity: str | None = None


class ProcedureEnvironmentItem(BaseModel):
    parameter: str
    value: str


class ProcedureAcceptanceCriterion(BaseModel):
    label: str
    limit: str


class ProcedureCreate(BaseModel):
    proc_id: str = Field(min_length=1, max_length=20)
    physical_quantity: str
    name: str
    description: str | None = None
    version: str = "1.0"
    difficulty: str | None = None
    standard_ref: str | None = None
    author: str | None = None
    duration_min: int | None = None
    tags: list[str] | None = None
    equipment: list[ProcedureEquipmentItem] | None = None
    materials: list[ProcedureMaterialItem] | None = None
    environment: list[ProcedureEnvironmentItem] | None = None
    safety_notes: list[str] | None = None
    steps: list[ProcedureStep] | None = None
    acceptance_criteria: list[ProcedureAcceptanceCriterion] | None = None


class ProcedureUpdate(BaseModel):
    proc_id: str | None = Field(None, min_length=1, max_length=20)
    name: str | None = None
    description: str | None = None
    version: str | None = None
    difficulty: str | None = None
    standard_ref: str | None = None
    author: str | None = None
    duration_min: int | None = None
    tags: list[str] | None = None
    equipment: list[ProcedureEquipmentItem] | None = None
    materials: list[ProcedureMaterialItem] | None = None
    environment: list[ProcedureEnvironmentItem] | None = None
    safety_notes: list[str] | None = None
    steps: list[ProcedureStep] | None = None
    acceptance_criteria: list[ProcedureAcceptanceCriterion] | None = None


class ProcedureResponse(BaseModel):
    id: uuid.UUID
    proc_id: str | None
    physical_quantity: str
    name: str
    description: str | None
    version: str
    difficulty: str | None
    standard_ref: str | None
    author: str | None
    duration_min: int | None
    tags: list[str] | None
    equipment: list[ProcedureEquipmentItem] | None
    materials: list[ProcedureMaterialItem] | None
    environment: list[ProcedureEnvironmentItem] | None
    safety_notes: list[str] | None
    steps: list[ProcedureStep] | None
    acceptance_criteria: list[ProcedureAcceptanceCriterion] | None
    is_active: bool
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
