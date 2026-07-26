"""
Unit tests for the export/import bundling logic in database_admin_service.

pg_dump/pg_restore and MinIO are mocked out here (subprocess.run and the
storage module) so these run as pure logic tests around the zip bundle
format, independent of test_admin_database.py's real-database coverage of
the surrounding endpoints/permissions.
"""
import io
import json
import zipfile
from pathlib import Path

import pytest

from app.services import database_admin_service as db_admin_svc


class _FakeCompletedProcess:
    def __init__(self, returncode: int = 0, stderr: str = "") -> None:
        self.returncode = returncode
        self.stderr = stderr


def _fake_pg_dump_run(cmd, capture_output=True, text=True):  # type: ignore[no-untyped-def]
    assert cmd[0] == "pg_dump"
    out_path = Path(cmd[cmd.index("-f") + 1])
    out_path.write_bytes(b"FAKE-PG-DUMP-BYTES")
    return _FakeCompletedProcess()


def _fake_pg_restore_run_factory(captured: list):  # type: ignore[no-untyped-def]
    def _fake_pg_restore_run(cmd, capture_output=True, text=True):  # type: ignore[no-untyped-def]
        assert cmd[0] == "pg_restore"
        captured.append(Path(cmd[-1]).read_bytes())
        return _FakeCompletedProcess()

    return _fake_pg_restore_run


class TestExportDatabase:
    def test_bundles_pg_dump_with_every_media_object(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        monkeypatch.setattr(db_admin_svc.subprocess, "run", _fake_pg_dump_run)
        monkeypatch.setattr(
            db_admin_svc.storage,
            "download_all_objects",
            lambda: iter(
                [
                    ("certificates/abc.pdf", b"%PDF-fake", "application/pdf"),
                    ("templates/tmpl.tex", b"\\documentclass{article}", "text/x-tex"),
                ]
            ),
        )

        archive_bytes = db_admin_svc.export_database()

        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            names = archive.namelist()
            assert "database.dump" in names
            assert archive.read("database.dump") == b"FAKE-PG-DUMP-BYTES"
            assert archive.read("media/certificates/abc.pdf") == b"%PDF-fake"
            assert archive.read("media/templates/tmpl.tex") == b"\\documentclass{article}"

            manifest = json.loads(archive.read("manifest.json"))
            assert manifest == {
                "certificates/abc.pdf": "application/pdf",
                "templates/tmpl.tex": "text/x-tex",
            }

    def test_raises_database_admin_error_when_pg_dump_fails(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        def _failing_run(cmd, capture_output=True, text=True):  # type: ignore[no-untyped-def]
            return _FakeCompletedProcess(returncode=1, stderr="connection refused")

        monkeypatch.setattr(db_admin_svc.subprocess, "run", _failing_run)

        with pytest.raises(db_admin_svc.DatabaseAdminError, match="pg_dump failed"):
            db_admin_svc.export_database()


class TestImportDatabase:
    def test_zip_bundle_restores_dump_and_reuploads_media(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        captured_restore: list = []
        monkeypatch.setattr(
            db_admin_svc.subprocess, "run", _fake_pg_restore_run_factory(captured_restore)
        )

        deleted: list = []
        uploaded: list = []
        monkeypatch.setattr(db_admin_svc.storage, "delete_all_objects", lambda: deleted.append(True))
        monkeypatch.setattr(
            db_admin_svc.storage,
            "upload_file",
            lambda data, content_type, object_path: uploaded.append((object_path, content_type, data)),
        )

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("database.dump", b"FAKE-DUMP-TO-RESTORE")
            archive.writestr("media/certificates/abc.pdf", b"%PDF-fake")
            archive.writestr("manifest.json", json.dumps({"certificates/abc.pdf": "application/pdf"}))

        db_admin_svc.import_database(buffer.getvalue())

        assert captured_restore == [b"FAKE-DUMP-TO-RESTORE"]
        assert deleted == [True]
        assert uploaded == [("certificates/abc.pdf", "application/pdf", b"%PDF-fake")]

    def test_media_missing_from_manifest_falls_back_to_octet_stream(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        monkeypatch.setattr(db_admin_svc.subprocess, "run", _fake_pg_restore_run_factory([]))
        monkeypatch.setattr(db_admin_svc.storage, "delete_all_objects", lambda: None)
        uploaded: list = []
        monkeypatch.setattr(
            db_admin_svc.storage,
            "upload_file",
            lambda data, content_type, object_path: uploaded.append((object_path, content_type)),
        )

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("database.dump", b"FAKE-DUMP")
            archive.writestr("media/orphaned.bin", b"???")
            # No manifest.json entry at all.

        db_admin_svc.import_database(buffer.getvalue())

        assert uploaded == [("orphaned.bin", "application/octet-stream")]

    def test_bare_pg_dump_restores_database_only_and_leaves_media_untouched(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        captured_restore: list = []
        monkeypatch.setattr(
            db_admin_svc.subprocess, "run", _fake_pg_restore_run_factory(captured_restore)
        )
        monkeypatch.setattr(
            db_admin_svc.storage,
            "delete_all_objects",
            lambda: pytest.fail("must not touch storage for a legacy bare pg_dump import"),
        )
        monkeypatch.setattr(
            db_admin_svc.storage,
            "upload_file",
            lambda *a, **kw: pytest.fail("must not touch storage for a legacy bare pg_dump import"),
        )

        legacy_dump = b"PGDMP-fake-legacy-custom-format-dump-bytes"
        db_admin_svc.import_database(legacy_dump)

        assert captured_restore == [legacy_dump]

    def test_raises_database_admin_error_when_pg_restore_fails(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        def _failing_run(cmd, capture_output=True, text=True):  # type: ignore[no-untyped-def]
            return _FakeCompletedProcess(returncode=1, stderr="restore broke")

        monkeypatch.setattr(db_admin_svc.subprocess, "run", _failing_run)

        with pytest.raises(db_admin_svc.DatabaseAdminError, match="pg_restore failed"):
            db_admin_svc.import_database(b"PGDMP-fake-legacy-dump-bytes")
