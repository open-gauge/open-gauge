import uuid
from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Response shape — shared by single-procedure ("Import from file") and bulk import
# ---------------------------------------------------------------------------

class ProcedureImportResult(BaseModel):
    source_folder: str
    status: Literal["created", "error"]
    proc_id: str | None = None
    new_proc_pk: uuid.UUID | None = None
    error_message: str | None = None


class ProcedureImportResponse(BaseModel):
    results: list[ProcedureImportResult]


# ---------------------------------------------------------------------------
# Pre-import validation preview — lets the "Import from file" UI show the
# procedure's identity before actually creating anything.
# ---------------------------------------------------------------------------

class ProcedureImportPreview(BaseModel):
    valid: bool
    error_message: str | None = None
    proc_id: str | None = None
    name: str | None = None
    physical_quantity: str | None = None
    version: str | None = None
    step_count: int = 0
    file_count: int = 0


# ---------------------------------------------------------------------------
# Validation schemas for the parsed procedure.yaml — defensive parsing of an
# untrusted uploaded file before any database row is created.
# ---------------------------------------------------------------------------

class ImportedProcedureStep(BaseModel):
    title: str
    description: str | None = None
    duration_min: float | None = None


class ImportedProcedureEquipmentItem(BaseModel):
    name: str
    model: str | None = None


class ImportedProcedureMaterialItem(BaseModel):
    name: str
    quantity: str | None = None


class ImportedProcedureEnvironmentItem(BaseModel):
    parameter: str
    value: str


class ImportedProcedureAcceptanceCriterion(BaseModel):
    label: str
    limit: str


class ImportedProcedureFile(BaseModel):
    original_filename: str
    content_type: str
    step_index: int | None = None
    media_path: str | None = None


class ImportedProcedure(BaseModel):
    proc_id: str = Field(min_length=1, max_length=20)
    physical_quantity: str
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    version: str = "1.0"
    difficulty: str | None = None
    standard_ref: str | None = None
    author: str | None = None
    duration_min: int | None = None
    tags: list[str] | None = None
    equipment: list[ImportedProcedureEquipmentItem] | None = None
    materials: list[ImportedProcedureMaterialItem] | None = None
    environment: list[ImportedProcedureEnvironmentItem] | None = None
    safety_notes: list[str] | None = None
    steps: list[ImportedProcedureStep] | None = None
    acceptance_criteria: list[ImportedProcedureAcceptanceCriterion] | None = None
    is_active: bool = True


class ImportedProcedureYaml(BaseModel):
    export_format_version: int = 1
    procedure: ImportedProcedure
    files: list[ImportedProcedureFile] = []
