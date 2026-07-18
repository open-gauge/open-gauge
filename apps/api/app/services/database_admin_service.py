import subprocess
import tempfile
import uuid
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.user import User, UserRole
from . import storage


class DatabaseAdminError(Exception):
    pass


def export_database() -> bytes:
    """Dump the whole database as a pg_dump custom-format archive (restorable
    with import_database / pg_restore)."""
    with tempfile.NamedTemporaryFile(suffix=".dump") as tmp:
        result = subprocess.run(
            ["pg_dump", settings.database_url, "-Fc", "-f", tmp.name],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise DatabaseAdminError(f"pg_dump failed: {result.stderr.strip()}")
        return Path(tmp.name).read_bytes()


def import_database(dump_bytes: bytes) -> None:
    """Restore a pg_dump custom-format archive, replacing all existing data
    and objects in the database. Callers must close the SQLAlchemy session
    beforehand — pg_restore connects independently and --clean will drop and
    recreate objects out from under any open ORM session."""
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


def reset_to_clean_state(db: Session, current_user_id: uuid.UUID) -> None:
    """Wipe every table's data and empty file storage, then restore only the
    superadmin accounts — bringing a demo/trial install back to the state a
    fresh deployment starts in. Superadmins keep their id (and therefore their
    current session token stays valid) and password.

    Also always preserves the calling user regardless of role/flag, since this
    endpoint is gated on the same "superuser or role==superadmin" check used
    elsewhere — without this, a role==superadmin user lacking is_superuser
    could trigger a clear that deletes their own account."""
    preserved = [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "hashed_password": u.hashed_password,
            "role": u.role,
            "is_active": u.is_active,
            "is_superuser": u.is_superuser,
            "is_verified": u.is_verified,
            "created_at": u.created_at,
        }
        for u in db.query(User)
        .filter(
            User.is_superuser.is_(True)
            | (User.role == UserRole.superadmin)
            | (User.id == current_user_id)
        )
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
