"""
Tests for procedure import (POST /procedures/import, POST /procedures/import/validate).

Covers: round-trip export->import, proc_id collision handling, malformed zips,
step attachment restoration, the preview/validate endpoint, and admin-only auth guards.
"""
import io
import uuid
import zipfile

import pytest
import yaml
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.user import User, UserRole


def _user(db: Session, role: UserRole) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"{role.value}_{uuid.uuid4().hex[:8]}@opengauge.test",
        name=f"Test {role.value.title()}",
        hashed_password=hash_password("Testpass123!"),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def _headers_for(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


@pytest.fixture()
def exported_zip(client: TestClient, auth_headers: dict) -> tuple[bytes, dict]:
    """A real export bundle produced via the API, for round-trip import tests."""
    payload = {
        "proc_id": f"PROC-IMP-{uuid.uuid4().hex[:6]}",
        "physical_quantity": "temperature",
        "name": "Import Test Procedure",
        "description": "A procedure used for import tests",
        "steps": [{"title": "Step one", "description": "Do it", "duration_min": 5}],
        "safety_notes": ["Wear gloves"],
    }
    proc = client.post("/api/v1/procedures", json=payload, headers=auth_headers).json()
    client.post(
        f"/api/v1/procedures/{proc['id']}/files?step_index=0",
        files={"file": ("step0.png", b"fake-image-bytes", "image/png")},
        headers=auth_headers,
    )
    r = client.get(f"/api/v1/procedures/{proc['id']}/export", headers=auth_headers)
    assert r.status_code == 200
    return r.content, proc


def _empty_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("readme.txt", "no procedure here")
    return buf.getvalue()


def _with_new_proc_id(zip_bytes: bytes, folder: str, new_proc_id: str) -> bytes:
    """Rewrite procedure.yaml's proc_id in place (media paths stay under the same
    folder) — simulates importing an export onto an instance where the original
    proc_id isn't already taken, without needing a real second instance."""
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        entries = {name: zf.read(name) for name in zf.namelist()}
    data = yaml.safe_load(entries[f"{folder}/procedure.yaml"])
    data["procedure"]["proc_id"] = new_proc_id
    entries[f"{folder}/procedure.yaml"] = yaml.safe_dump(data, sort_keys=False, allow_unicode=True).encode("utf-8")

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in entries.items():
            zf.writestr(name, content)
    return out.getvalue()


class TestValidateImportZip:
    def test_valid_zip_returns_preview(
        self, client: TestClient, auth_headers: dict, exported_zip: tuple[bytes, dict]
    ) -> None:
        zip_bytes, proc = exported_zip
        r = client.post(
            "/api/v1/procedures/import/validate",
            files={"file": ("export.zip", zip_bytes, "application/zip")},
            headers=auth_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["valid"] is True
        assert body["proc_id"] == proc["proc_id"]
        assert body["name"] == "Import Test Procedure"
        assert body["step_count"] == 1
        assert body["file_count"] == 1

    def test_not_a_zip_returns_invalid(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/procedures/import/validate",
            files={"file": ("bad.zip", b"not a zip", "application/zip")},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["valid"] is False

    def test_zip_without_procedure_yaml_returns_invalid(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/procedures/import/validate",
            files={"file": ("empty.zip", _empty_zip(), "application/zip")},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["valid"] is False

    def test_validate_rejected_for_technician(
        self, client: TestClient, db: Session, exported_zip: tuple[bytes, dict]
    ) -> None:
        zip_bytes, _ = exported_zip
        technician = _user(db, UserRole.technician)
        r = client.post(
            "/api/v1/procedures/import/validate",
            files={"file": ("export.zip", zip_bytes, "application/zip")},
            headers=_headers_for(technician),
        )
        assert r.status_code == 403

    def test_validate_unauthenticated_is_rejected(
        self, client: TestClient, exported_zip: tuple[bytes, dict]
    ) -> None:
        zip_bytes, _ = exported_zip
        r = client.post(
            "/api/v1/procedures/import/validate",
            files={"file": ("export.zip", zip_bytes, "application/zip")},
        )
        assert r.status_code == 403


class TestImportProcedures:
    def test_round_trip_import_recreates_procedure(
        self, client: TestClient, auth_headers: dict, exported_zip: tuple[bytes, dict]
    ) -> None:
        zip_bytes, original = exported_zip
        # proc_id is a hard unique constraint (kept even for soft-deleted rows), so a
        # true cross-instance import — the feature's actual use case — targets a
        # proc_id that doesn't already exist on this instance.
        new_proc_id = f"PROC-RESTORED-{uuid.uuid4().hex[:6]}"
        rewritten = _with_new_proc_id(zip_bytes, original["proc_id"], new_proc_id)

        r = client.post(
            "/api/v1/procedures/import",
            files={"file": ("export.zip", rewritten, "application/zip")},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["results"]) == 1
        result = body["results"][0]
        assert result["status"] == "created"
        assert result["proc_id"] == new_proc_id

        restored = client.get(f"/api/v1/procedures/{result['new_proc_pk']}", headers=auth_headers).json()
        assert restored["name"] == "Import Test Procedure"
        assert restored["steps"][0]["title"] == "Step one"
        assert restored["safety_notes"] == ["Wear gloves"]

        files = client.get(f"/api/v1/procedures/{result['new_proc_pk']}/files", headers=auth_headers).json()
        assert len(files) == 1
        assert files[0]["step_index"] == 0

    def test_import_proc_id_collision_reports_error(
        self, client: TestClient, auth_headers: dict, exported_zip: tuple[bytes, dict]
    ) -> None:
        zip_bytes, original = exported_zip
        # original still exists with the same proc_id -> collision
        r = client.post(
            "/api/v1/procedures/import",
            files={"file": ("export.zip", zip_bytes, "application/zip")},
            headers=auth_headers,
        )
        assert r.status_code == 200
        result = r.json()["results"][0]
        assert result["status"] == "error"
        assert "already exists" in result["error_message"]

    def test_import_not_a_zip_reports_error(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/procedures/import",
            files={"file": ("bad.zip", b"not a zip", "application/zip")},
            headers=auth_headers,
        )
        assert r.status_code == 200
        result = r.json()["results"][0]
        assert result["status"] == "error"

    def test_import_unauthenticated_is_rejected(
        self, client: TestClient, exported_zip: tuple[bytes, dict]
    ) -> None:
        zip_bytes, _ = exported_zip
        r = client.post(
            "/api/v1/procedures/import",
            files={"file": ("export.zip", zip_bytes, "application/zip")},
        )
        assert r.status_code == 403

    def test_import_rejected_for_viewer(
        self, client: TestClient, db: Session, exported_zip: tuple[bytes, dict]
    ) -> None:
        zip_bytes, _ = exported_zip
        viewer = _user(db, UserRole.viewer)
        r = client.post(
            "/api/v1/procedures/import",
            files={"file": ("export.zip", zip_bytes, "application/zip")},
            headers=_headers_for(viewer),
        )
        assert r.status_code == 403

    def test_import_rejected_for_technician(
        self, client: TestClient, db: Session, exported_zip: tuple[bytes, dict]
    ) -> None:
        zip_bytes, _ = exported_zip
        technician = _user(db, UserRole.technician)
        r = client.post(
            "/api/v1/procedures/import",
            files={"file": ("export.zip", zip_bytes, "application/zip")},
            headers=_headers_for(technician),
        )
        assert r.status_code == 403

    def test_import_allowed_for_superadmin(
        self, client: TestClient, db: Session, exported_zip: tuple[bytes, dict]
    ) -> None:
        zip_bytes, original = exported_zip
        new_proc_id = f"PROC-SA-{uuid.uuid4().hex[:6]}"
        rewritten = _with_new_proc_id(zip_bytes, original["proc_id"], new_proc_id)
        superadmin = _user(db, UserRole.superadmin)
        r = client.post(
            "/api/v1/procedures/import",
            files={"file": ("export.zip", rewritten, "application/zip")},
            headers=_headers_for(superadmin),
        )
        assert r.status_code == 200
        assert r.json()["results"][0]["status"] == "created"
