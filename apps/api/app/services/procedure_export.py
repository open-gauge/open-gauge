"""Build ZIP export bundles for one or more procedures.

Read-only: no database writes happen here. Each procedure is serialized to a
human-readable YAML file (procedure.yaml) plus a media/ folder with the actual
bytes of its step attachments. Internal DB UUIDs are excluded from the YAML —
see the "procedures import/export" guide doc for the full schema.
"""
import io
import re
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any

import yaml
from sqlalchemy.orm import Session

from ..models.calibration_method import Procedure
from ..models.stored_file import StoredFile
from ..repositories import stored_file as file_repo
from . import storage as storage_svc

EXPORT_FORMAT_VERSION = 1

_CONTENT_TYPE_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}


def _ext_for_file(stored: StoredFile) -> str:
    ext = _CONTENT_TYPE_EXT.get(stored.content_type)
    if ext:
        return ext
    if "." in stored.original_filename:
        return "." + stored.original_filename.rsplit(".", 1)[-1]
    return ".bin"


def _clean(value: Any) -> Any:
    """Make a DB value YAML-safe: UUID -> str, recursively through dict/list."""
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean(v) for v in value]
    return value


def _procedure_files(db: Session, proc_pk: uuid.UUID) -> list[StoredFile]:
    """Step-attached files (via /procedures/{id}/files), in stable creation order."""
    return [f for f in file_repo.list_by_entity(db, proc_pk) if f.entity_type == "procedure"]


def _safe_folder_name(proc: Procedure) -> str:
    """Fall back to the DB primary key if proc_id is somehow unset — proc_id is
    required by ProcedureCreate, but the column itself is nullable for legacy rows."""
    name = proc.proc_id or str(proc.id)
    return re.sub(r"[^\w.\- ]", "_", name)


def build_procedure_yaml(db: Session, proc: Procedure) -> dict:
    """Assemble the full export dict for one procedure (not yet YAML-dumped)."""
    procedure_dict = {
        "proc_id": proc.proc_id,
        "physical_quantity": proc.physical_quantity,
        "name": proc.name,
        "description": proc.description,
        "version": proc.version,
        "difficulty": proc.difficulty,
        "standard_ref": proc.standard_ref,
        "author": proc.author,
        "duration_min": proc.duration_min,
        "tags": proc.tags,
        "equipment": proc.equipment,
        "materials": proc.materials,
        "environment": proc.environment,
        "safety_notes": proc.safety_notes,
        "steps": proc.steps,
        "acceptance_criteria": proc.acceptance_criteria,
        "is_active": proc.is_active,
        "created_at": proc.created_at,
        "updated_at": proc.updated_at,
    }

    files_meta = [
        {
            "original_filename": f.original_filename,
            "content_type": f.content_type,
            "step_index": f.step_index,
            "size_bytes": f.size_bytes,
            "checksum_sha256": f.checksum_sha256,
            "created_at": f.created_at,
            "media_path": None,  # filled in by _write_procedure_into_zip
        }
        for f in _procedure_files(db, proc.id)
    ]

    data = {
        "export_format_version": EXPORT_FORMAT_VERSION,
        "exported_at": datetime.now(timezone.utc),
        "procedure": procedure_dict,
        "files": files_meta,
    }
    return _clean(data)


def _write_procedure_into_zip(zf: zipfile.ZipFile, db: Session, proc: Procedure) -> None:
    """Write one procedure's procedure.yaml + media/ into an already-open zip file."""
    data = build_procedure_yaml(db, proc)
    folder = _safe_folder_name(proc)

    used_names: dict[str, set[str]] = {}
    for entry, stored in zip(data["files"], _procedure_files(db, proc.id)):
        content = storage_svc.download_file(stored.storage_path, stored.bucket)
        if content is None:
            continue
        step_key = str(stored.step_index) if stored.step_index is not None else "_"
        used = used_names.setdefault(step_key, set())
        name = stored.original_filename
        if name in used:
            stem, _, suffix = name.rpartition(".")
            n = 1
            while True:
                candidate = f"{stem} ({n}).{suffix}" if suffix else f"{name} ({n})"
                if candidate not in used:
                    name = candidate
                    break
                n += 1
        used.add(name)
        media_path = (
            f"media/steps/{stored.step_index}/{name}"
            if stored.step_index is not None
            else f"media/files/{name}"
        )
        zf.writestr(f"{folder}/{media_path}", content)
        entry["media_path"] = media_path

    yaml_bytes = yaml.safe_dump(data, sort_keys=False, allow_unicode=True).encode("utf-8")
    zf.writestr(f"{folder}/procedure.yaml", yaml_bytes)


def build_procedure_export_zip(db: Session, proc: Procedure) -> bytes:
    """Export a single procedure as a standalone zip: {proc_id}/procedure.yaml + media/."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        _write_procedure_into_zip(zf, db, proc)
    return buf.getvalue()


def build_bulk_export_zip(db: Session, procedures: list[Procedure]) -> bytes:
    """Export multiple procedures into one zip, one {proc_id}/ folder per procedure."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for proc in procedures:
            _write_procedure_into_zip(zf, db, proc)
    return buf.getvalue()
