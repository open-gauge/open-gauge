"""
Tests for procedure export (GET /procedures/{id}/export, POST /procedures/export/bulk).

Covers: zip structure, YAML content (no internal UUIDs leak in), step attachment
bundling, admin-only auth guards, and bulk export of multiple procedures.
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
def populated_procedure(client: TestClient, auth_headers: dict) -> dict:
    """A procedure with steps and one step-attached file."""
    payload = {
        "proc_id": f"PROC-EXP-{uuid.uuid4().hex[:6]}",
        "physical_quantity": "temperature",
        "name": "Export Test Procedure",
        "description": "A procedure used for export tests",
        "steps": [
            {"title": "Step one", "description": "Do the first thing", "duration_min": 5},
            {"title": "Step two", "description": None, "duration_min": None},
        ],
        "equipment": [{"name": "Thermometer", "model": "T-100"}],
        "safety_notes": ["Wear gloves"],
    }
    proc = client.post("/api/v1/procedures", json=payload, headers=auth_headers).json()

    r = client.post(
        f"/api/v1/procedures/{proc['id']}/files?step_index=0",
        files={"file": ("step0.png", b"fake-image-bytes", "image/png")},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    return proc


def _read_yaml(zip_bytes: bytes, folder: str) -> dict:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        return yaml.safe_load(zf.read(f"{folder}/procedure.yaml"))


class TestExportProcedure:
    def test_export_returns_zip(
        self, client: TestClient, auth_headers: dict, populated_procedure: dict
    ) -> None:
        r = client.get(f"/api/v1/procedures/{populated_procedure['id']}/export", headers=auth_headers)
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/zip"
        proc_id = populated_procedure["proc_id"]
        with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
            names = zf.namelist()
        assert f"{proc_id}/procedure.yaml" in names
        assert any(n.startswith(f"{proc_id}/media/steps/0/") for n in names)

    def test_yaml_excludes_raw_uuids(
        self, client: TestClient, auth_headers: dict, populated_procedure: dict
    ) -> None:
        r = client.get(f"/api/v1/procedures/{populated_procedure['id']}/export", headers=auth_headers)
        data = _read_yaml(r.content, populated_procedure["proc_id"])

        proc_block = data["procedure"]
        for excluded in ("id", "created_by"):
            assert excluded not in proc_block

        assert proc_block["proc_id"] == populated_procedure["proc_id"]
        assert proc_block["name"] == "Export Test Procedure"
        assert proc_block["steps"][0]["title"] == "Step one"
        assert data["files"][0]["step_index"] == 0
        assert data["files"][0]["media_path"] is not None

    def test_export_nonexistent_procedure_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(f"/api/v1/procedures/{uuid.uuid4()}/export", headers=auth_headers)
        assert r.status_code == 404

    def test_export_unauthenticated_is_rejected(
        self, client: TestClient, populated_procedure: dict
    ) -> None:
        r = client.get(f"/api/v1/procedures/{populated_procedure['id']}/export")
        assert r.status_code == 403

    def test_export_rejected_for_technician(
        self, client: TestClient, db: Session, populated_procedure: dict
    ) -> None:
        technician = _user(db, UserRole.technician)
        r = client.get(
            f"/api/v1/procedures/{populated_procedure['id']}/export",
            headers=_headers_for(technician),
        )
        assert r.status_code == 403

    def test_export_rejected_for_viewer(
        self, client: TestClient, db: Session, populated_procedure: dict
    ) -> None:
        viewer = _user(db, UserRole.viewer)
        r = client.get(
            f"/api/v1/procedures/{populated_procedure['id']}/export",
            headers=_headers_for(viewer),
        )
        assert r.status_code == 403

    def test_export_allowed_for_superadmin(
        self, client: TestClient, db: Session, populated_procedure: dict
    ) -> None:
        superadmin = _user(db, UserRole.superadmin)
        r = client.get(
            f"/api/v1/procedures/{populated_procedure['id']}/export",
            headers=_headers_for(superadmin),
        )
        assert r.status_code == 200

    def test_export_procedure_without_steps(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        payload = {
            "proc_id": f"PROC-BARE-{uuid.uuid4().hex[:6]}",
            "physical_quantity": "pressure",
            "name": "Bare Procedure",
        }
        proc = client.post("/api/v1/procedures", json=payload, headers=auth_headers).json()
        r = client.get(f"/api/v1/procedures/{proc['id']}/export", headers=auth_headers)
        assert r.status_code == 200
        data = _read_yaml(r.content, proc["proc_id"])
        assert data["procedure"]["steps"] is None
        assert data["files"] == []


class TestBulkExportProcedures:
    def test_bulk_export_contains_one_folder_per_procedure(
        self, client: TestClient, auth_headers: dict, populated_procedure: dict
    ) -> None:
        other_payload = {
            "proc_id": f"PROC-EXP2-{uuid.uuid4().hex[:6]}",
            "physical_quantity": "humidity",
            "name": "Second Export Procedure",
        }
        other = client.post("/api/v1/procedures", json=other_payload, headers=auth_headers).json()

        r = client.post(
            "/api/v1/procedures/export/bulk",
            json={"proc_ids": [populated_procedure["id"], other["id"]]},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
            names = zf.namelist()
        assert f"{populated_procedure['proc_id']}/procedure.yaml" in names
        assert f"{other['proc_id']}/procedure.yaml" in names

    def test_bulk_export_no_matching_procedures_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/procedures/export/bulk",
            json={"proc_ids": [str(uuid.uuid4())]},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_bulk_export_unauthenticated_is_rejected(
        self, client: TestClient, populated_procedure: dict
    ) -> None:
        r = client.post(
            "/api/v1/procedures/export/bulk",
            json={"proc_ids": [populated_procedure["id"]]},
        )
        assert r.status_code == 403

    def test_bulk_export_rejected_for_technician(
        self, client: TestClient, db: Session, populated_procedure: dict
    ) -> None:
        technician = _user(db, UserRole.technician)
        r = client.post(
            "/api/v1/procedures/export/bulk",
            json={"proc_ids": [populated_procedure["id"]]},
            headers=_headers_for(technician),
        )
        assert r.status_code == 403
