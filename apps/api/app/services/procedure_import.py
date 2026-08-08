"""Parse and apply procedure export ZIP bundles (see procedure_export.py for the format).

Each top-level folder in the zip that contains a procedure.yaml is imported as one
new procedure, independently of the others: a bad folder fails on its own without
aborting the rest of the batch (see import_procedures_zip).

Note: this module builds the row directly via `db.add()`/`db.flush()` rather than
going through the API's create endpoint, because that would call `db.commit()`
internally, which would end the per-folder SAVEPOINT used here to isolate one bad
procedure from the rest of the batch.
"""
import logging
import uuid
import zipfile
from io import BytesIO

import yaml
from pydantic import ValidationError
from sqlalchemy.orm import Session

from ..models.calibration_method import Procedure
from ..models.stored_file import StoredFile
from ..schemas.procedure_import import ImportedProcedureYaml, ProcedureImportPreview, ProcedureImportResult
from . import storage as storage_svc

logger = logging.getLogger(__name__)


class ProcedureImportError(Exception):
    """Raised for any per-procedure import failure; caught per-folder in
    import_procedures_zip so one bad procedure doesn't abort the rest of the batch."""


def _extract_procedure_folders(zf: zipfile.ZipFile) -> tuple[list[str], list[str]]:
    """Return (folders containing procedure.yaml, top-level folders that don't)."""
    top_level_dirs: set[str] = set()
    has_yaml: set[str] = set()
    for name in zf.namelist():
        if "/" not in name:
            continue
        top = name.split("/", 1)[0]
        top_level_dirs.add(top)
        if name == f"{top}/procedure.yaml":
            has_yaml.add(top)
    return sorted(has_yaml), sorted(top_level_dirs - has_yaml)


def _load_procedure_yaml(zf: zipfile.ZipFile, folder: str) -> ImportedProcedureYaml:
    try:
        raw = yaml.safe_load(zf.read(f"{folder}/procedure.yaml"))
    except yaml.YAMLError as e:
        raise ProcedureImportError(f"Could not parse procedure.yaml: {e}") from e
    if not isinstance(raw, dict):
        raise ProcedureImportError("procedure.yaml is empty or not a mapping")
    try:
        return ImportedProcedureYaml(**raw)
    except ValidationError as e:
        raise ProcedureImportError(f"procedure.yaml failed validation: {e}") from e


def _restore_media_file(
    db: Session,
    content: bytes,
    *,
    original_filename: str,
    content_type: str,
    entity_id: uuid.UUID,
    uploaded_by: uuid.UUID,
    step_index: int | None,
) -> None:
    """Upload one media file's bytes back into MinIO and record it as a StoredFile.

    Builds the row directly (db.add + db.flush) rather than calling
    stored_file_repo.create(), which commits internally — incompatible with
    the per-folder SAVEPOINT used by import_procedures_zip."""
    object_path = storage_svc.unique_object_name(f"procedures/{entity_id}/steps/{step_index}", original_filename)
    bucket, path, size = storage_svc.upload_file(content, content_type, object_path)
    record = StoredFile(
        original_filename=original_filename,
        storage_path=path,
        bucket=bucket,
        content_type=content_type,
        size_bytes=size,
        checksum_sha256=storage_svc.sha256_hex(content),
        entity_type="procedure",
        entity_id=entity_id,
        uploaded_by=uploaded_by,
        step_index=step_index,
    )
    db.add(record)
    db.flush()


def import_procedure_from_folder(
    db: Session,
    zf: zipfile.ZipFile,
    folder: str,
    created_by: uuid.UUID,
) -> Procedure:
    imported = _load_procedure_yaml(zf, folder)
    p = imported.procedure

    if db.query(Procedure).filter(Procedure.proc_id == p.proc_id).first():
        raise ProcedureImportError(f"Procedure ID '{p.proc_id}' already exists")

    new_proc = Procedure(
        proc_id=p.proc_id,
        physical_quantity=p.physical_quantity,
        name=p.name,
        description=p.description,
        version=p.version,
        difficulty=p.difficulty,
        standard_ref=p.standard_ref,
        author=p.author,
        duration_min=p.duration_min,
        tags=p.tags,
        equipment=[i.model_dump() for i in p.equipment] if p.equipment else None,
        materials=[i.model_dump() for i in p.materials] if p.materials else None,
        environment=[i.model_dump() for i in p.environment] if p.environment else None,
        safety_notes=p.safety_notes,
        steps=[i.model_dump() for i in p.steps] if p.steps else None,
        acceptance_criteria=[i.model_dump() for i in p.acceptance_criteria] if p.acceptance_criteria else None,
        is_active=p.is_active,
        created_by=created_by,
    )
    db.add(new_proc)
    db.flush()

    for f in imported.files:
        if not f.media_path:
            continue
        zip_path = f"{folder}/{f.media_path}"
        try:
            content = zf.read(zip_path)
        except KeyError:
            continue
        _restore_media_file(
            db, content,
            original_filename=f.original_filename,
            content_type=f.content_type,
            entity_id=new_proc.id,
            uploaded_by=created_by,
            step_index=f.step_index,
        )

    db.flush()
    return new_proc


def import_procedures_zip(
    db: Session,
    zip_bytes: bytes,
    created_by: uuid.UUID,
) -> list[ProcedureImportResult]:
    """Import every procedure folder found in a zip. Returns one result per folder;
    a failure in one folder never prevents the others from being imported."""
    try:
        zf = zipfile.ZipFile(BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        return [ProcedureImportResult(source_folder="", status="error", error_message="Not a valid zip file")]

    folders, missing = _extract_procedure_folders(zf)
    if not folders and not missing:
        return [ProcedureImportResult(
            source_folder="", status="error",
            error_message="No procedure.yaml found in any top-level folder of this zip",
        )]

    results: list[ProcedureImportResult] = []
    for name in sorted(set(folders) | set(missing)):
        if name in missing:
            results.append(ProcedureImportResult(
                source_folder=name, status="error",
                error_message="No procedure.yaml found in this folder",
            ))
            continue
        try:
            with db.begin_nested():
                proc = import_procedure_from_folder(db, zf, name, created_by)
            results.append(ProcedureImportResult(
                source_folder=name, status="created",
                proc_id=proc.proc_id, new_proc_pk=proc.id,
            ))
        except ProcedureImportError as e:
            results.append(ProcedureImportResult(source_folder=name, status="error", error_message=str(e)))
        except Exception:
            logger.exception("Unexpected error importing procedure folder %s", name)
            results.append(ProcedureImportResult(
                source_folder=name, status="error",
                error_message="Import failed: internal error",
            ))

    return results


def preview_procedure_zip(zip_bytes: bytes) -> ProcedureImportPreview:
    """Validate a zip meant for the single-procedure "Import from file" flow
    without creating anything: it must contain exactly one top-level folder,
    and that folder's procedure.yaml must parse and validate cleanly."""
    try:
        zf = zipfile.ZipFile(BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        return ProcedureImportPreview(valid=False, error_message="Not a valid zip file")

    folders, missing = _extract_procedure_folders(zf)
    total = len(folders) + len(missing)
    if total != 1:
        return ProcedureImportPreview(
            valid=False,
            error_message=f"Expected exactly one procedure folder, found {total}",
        )
    if missing:
        return ProcedureImportPreview(valid=False, error_message="No procedure.yaml found in this folder")

    try:
        imported = _load_procedure_yaml(zf, folders[0])
    except ProcedureImportError as e:
        return ProcedureImportPreview(valid=False, error_message=str(e))

    return ProcedureImportPreview(
        valid=True,
        proc_id=imported.procedure.proc_id,
        name=imported.procedure.name,
        physical_quantity=imported.procedure.physical_quantity,
        version=imported.procedure.version,
        step_count=len(imported.procedure.steps or []),
        file_count=len(imported.files),
    )
