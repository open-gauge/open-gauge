import io
import json
import subprocess
import tempfile
import uuid
import zipfile
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.user import User, UserRole
from . import storage


class DatabaseAdminError(Exception):
    pass


# Bundle layout produced by export_database() / consumed by import_database():
#   database.dump   - the pg_dump custom-format archive
#   manifest.json    - {"<object_name>": "<content_type>", ...} for every media/ entry
#   media/<object_name>  - one entry per MinIO object, path mirrors the object name
_DUMP_ENTRY = "database.dump"
_MANIFEST_ENTRY = "manifest.json"
_MEDIA_PREFIX = "media/"


def _pg_dump() -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".dump") as tmp:
        result = subprocess.run(
            ["pg_dump", settings.database_url, "-Fc", "-f", tmp.name],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise DatabaseAdminError(f"pg_dump failed: {result.stderr.strip()}")
        return Path(tmp.name).read_bytes()


def _pg_restore(dump_bytes: bytes) -> None:
    with tempfile.NamedTemporaryFile(suffix=".dump") as tmp:
        Path(tmp.name).write_bytes(dump_bytes)
        result = subprocess.run(
            [
                "pg_restore",
                "--clean",
                "--if-exists",
                "--no-owner",
                "--no-privileges",
                "-d", settings.database_url,
                tmp.name,
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise DatabaseAdminError(f"pg_restore failed: {result.stderr.strip()}")


def export_database() -> bytes:
    """Bundle a pg_dump of the whole database together with every MinIO
    object (certificates, datasheets, LaTeX templates, profile pictures, ...)
    into a single zip archive, restorable with import_database.

    Without the media files, restoring the dump alone onto a fresh instance
    would leave every certificate/datasheet/template reference pointing at
    an object that doesn't exist in that instance's MinIO."""
    dump_bytes = _pg_dump()
    manifest: dict[str, str] = {}

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(_DUMP_ENTRY, dump_bytes)
        for object_name, data, content_type in storage.download_all_objects():
            archive.writestr(_MEDIA_PREFIX + object_name, data)
            manifest[object_name] = content_type
        archive.writestr(_MANIFEST_ENTRY, json.dumps(manifest))
    return buffer.getvalue()


def import_database(dump_bytes: bytes) -> None:
    """Restore a backup produced by export_database, replacing all existing
    data, objects, and media files. Callers must close the SQLAlchemy session
    beforehand — pg_restore connects independently and --clean will drop and
    recreate objects out from under any open ORM session.

    Also accepts a bare pg_dump custom-format archive — the format
    export_database produced before it bundled media — for backward
    compatibility with backups taken before this existed; in that case only
    the database is restored and existing media is left untouched."""
    if not zipfile.is_zipfile(io.BytesIO(dump_bytes)):
        _pg_restore(dump_bytes)
        return

    with zipfile.ZipFile(io.BytesIO(dump_bytes)) as archive:
        _pg_restore(archive.read(_DUMP_ENTRY))

        try:
            manifest = json.loads(archive.read(_MANIFEST_ENTRY))
        except KeyError:
            manifest = {}

        storage.delete_all_objects()
        for name in archive.namelist():
            if not name.startswith(_MEDIA_PREFIX) or name == _MEDIA_PREFIX:
                continue
            object_name = name[len(_MEDIA_PREFIX):]
            content_type = manifest.get(object_name, "application/octet-stream")
            storage.upload_file(archive.read(name), content_type, object_name)


def reset_to_clean_state(db: Session, current_user_id: uuid.UUID) -> None:
    """Wipe every table's data and empty file storage, then restore only the
    superadmin accounts — bringing a demo/trial install back to the state a
    fresh deployment starts in. Superadmins keep their id (and therefore their
    current session token stays valid) and password.

    Also always preserves the calling user regardless of role, since this
    endpoint is gated on the "role==superadmin" check used elsewhere — without
    this, a caller who is superadmin only by virtue of being the current user
    (e.g. immediately after a role change) could trigger a clear that deletes
    their own account."""
    preserved = [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "hashed_password": u.hashed_password,
            "role": u.role,
            "is_active": u.is_active,
            "is_verified": u.is_verified,
            "created_at": u.created_at,
        }
        for u in db.query(User)
        .filter((User.role == UserRole.superadmin) | (User.id == current_user_id))
        .all()
    ]
    db.expunge_all()

    inspector = inspect(db.get_bind())
    tables = [t for t in inspector.get_table_names() if t != "alembic_version"]
    if tables:
        quoted = ", ".join(f'"{t}"' for t in tables)
        db.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))

    for row in preserved:
        db.add(User(**row))
    db.commit()

    storage.delete_all_objects()
