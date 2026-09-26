"""
Tests for the unified template default/builtin/enabled management introduced for
Admin -> Templates -> Calibration reports / Procedures:

- The one "Open Gauge (default)" builtin row per kind is lazily created (no migration seed),
  listed first, and becomes the default the moment nothing else is.
- Marking a template default is exclusive within its kind, and for calibration reports spans
  both the legacy .tex CertificateTemplate table and WYSIWYG DocumentTemplate (type=certificate)
  rows — at most one default across both.
- A disabled template drops out of every download picker/resolution path, but stays visible/
  editable in the admin list.
- The builtin row can never be edited or deleted, and can't be disabled while it's the default.
"""
import uuid

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.user import User, UserRole


def _superadmin_headers(db: Session) -> dict:
    user = User(
        id=uuid.uuid4(),
        email=f"super_{uuid.uuid4().hex[:8]}@opengauge.test",
        name="Super Admin",
        hashed_password=hash_password("Testpass123!"),
        role=UserRole.superadmin,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def _create_published_document_template(client: TestClient, auth_headers: dict, *, type_: str, name: str) -> dict:
    created = client.post("/api/v1/document-templates", json={"name": name, "type": type_}, headers=auth_headers).json()
    published = client.post(f"/api/v1/document-templates/{created['id']}/publish", headers=auth_headers)
    assert published.status_code == 200, published.text
    return published.json()


@pytest.fixture()
def procedure(client: TestClient, auth_headers: dict) -> dict:
    payload = {"proc_id": f"PROC-{uuid.uuid4().hex[:8]}", "physical_quantity": "temperature", "name": "Test Procedure"}
    r = client.post("/api/v1/procedures", json=payload, headers=auth_headers)
    assert r.status_code == 201, r.text
    return r.json()


class TestBuiltinLazyCreation:
    def test_builtin_procedure_template_appears_on_list_and_is_default(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/document-templates?type=procedure&status=published", headers=auth_headers)
        assert r.status_code == 200, r.text
        rows = r.json()
        builtins = [t for t in rows if t["is_builtin"]]
        assert len(builtins) == 1
        assert builtins[0]["is_default"] is True
        assert builtins[0]["is_enabled"] is True

    def test_builtin_certificate_template_appears_on_list_and_is_default(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/certificate-templates", headers=auth_headers)
        assert r.status_code == 200, r.text
        rows = r.json()
        builtins = [t for t in rows if t["is_builtin"]]
        assert len(builtins) == 1
        assert builtins[0]["is_default"] is True

    def test_listing_twice_does_not_create_a_second_builtin(self, client: TestClient, auth_headers: dict) -> None:
        client.get("/api/v1/document-templates?type=procedure&status=published", headers=auth_headers)
        r = client.get("/api/v1/document-templates?type=procedure&status=published", headers=auth_headers)
        builtins = [t for t in r.json() if t["is_builtin"]]
        assert len(builtins) == 1


class TestBuiltinProtections:
    def test_cannot_edit_builtin_procedure_template(self, client: TestClient, auth_headers: dict) -> None:
        client.get("/api/v1/document-templates?type=procedure&status=published", headers=auth_headers)
        builtin = next(t for t in client.get("/api/v1/document-templates?type=procedure", headers=auth_headers).json() if t["is_builtin"])
        r = client.post(f"/api/v1/document-templates/{builtin['id']}/new-version", headers=auth_headers)
        assert r.status_code == 400

    def test_cannot_delete_builtin_procedure_template(self, client: TestClient, auth_headers: dict) -> None:
        client.get("/api/v1/document-templates?type=procedure&status=published", headers=auth_headers)
        builtin = next(t for t in client.get("/api/v1/document-templates?type=procedure", headers=auth_headers).json() if t["is_builtin"])
        r = client.post(f"/api/v1/document-templates/{builtin['id']}/archive", headers=auth_headers)
        assert r.status_code == 400

    def test_cannot_disable_builtin_while_it_is_the_only_default(self, client: TestClient, auth_headers: dict) -> None:
        client.get("/api/v1/document-templates?type=procedure&status=published", headers=auth_headers)
        builtin = next(t for t in client.get("/api/v1/document-templates?type=procedure", headers=auth_headers).json() if t["is_builtin"])
        r = client.post(f"/api/v1/document-templates/{builtin['id']}/set-enabled", json={"enabled": False}, headers=auth_headers)
        assert r.status_code == 400

    def test_can_disable_builtin_once_another_template_is_default(self, client: TestClient, auth_headers: dict) -> None:
        client.get("/api/v1/document-templates?type=procedure&status=published", headers=auth_headers)
        builtin = next(t for t in client.get("/api/v1/document-templates?type=procedure", headers=auth_headers).json() if t["is_builtin"])
        other = _create_published_document_template(client, auth_headers, type_="procedure", name="Custom Procedure")
        set_default = client.post(f"/api/v1/document-templates/{other['id']}/set-default", headers=auth_headers)
        assert set_default.status_code == 200, set_default.text

        r = client.post(f"/api/v1/document-templates/{builtin['id']}/set-enabled", json={"enabled": False}, headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.json()["is_enabled"] is False

    def test_disabling_current_default_falls_back_to_builtin(self, client: TestClient, auth_headers: dict) -> None:
        client.get("/api/v1/document-templates?type=procedure&status=published", headers=auth_headers)
        builtin = next(t for t in client.get("/api/v1/document-templates?type=procedure", headers=auth_headers).json() if t["is_builtin"])
        other = _create_published_document_template(client, auth_headers, type_="procedure", name="Temp Default")
        client.post(f"/api/v1/document-templates/{other['id']}/set-default", headers=auth_headers)

        r = client.post(f"/api/v1/document-templates/{other['id']}/set-enabled", json={"enabled": False}, headers=auth_headers)
        assert r.status_code == 200, r.text

        refreshed_builtin = client.get(f"/api/v1/document-templates/{builtin['id']}", headers=auth_headers).json()
        assert refreshed_builtin["is_default"] is True


class TestDownloadUsesDefault:
    def test_procedure_download_with_no_config_uses_builtin(self, client: TestClient, auth_headers: dict, procedure: dict) -> None:
        r = client.get(f"/api/v1/procedures/{procedure['id']}/download", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.content.startswith(b"%PDF-")

    def test_procedure_download_rejects_disabled_template(self, client: TestClient, auth_headers: dict, procedure: dict) -> None:
        other = _create_published_document_template(client, auth_headers, type_="procedure", name="Disabled Procedure Template")
        client.post(f"/api/v1/document-templates/{other['id']}/set-enabled", json={"enabled": False}, headers=auth_headers)
        r = client.get(
            f"/api/v1/procedures/{procedure['id']}/download",
            params={"document_template_id": other["id"]},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_procedure_download_uses_new_default_once_marked(self, client: TestClient, auth_headers: dict, procedure: dict) -> None:
        other = _create_published_document_template(client, auth_headers, type_="procedure", name="New Default Procedure")
        client.post(f"/api/v1/document-templates/{other['id']}/set-default", headers=auth_headers)
        r = client.get(f"/api/v1/procedures/{procedure['id']}/download", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.content.startswith(b"%PDF-")


class TestCrossTableDefaultForReports:
    def test_marking_document_certificate_template_default_clears_certificate_template_default(
        self, client: TestClient, db: Session, auth_headers: dict
    ) -> None:
        headers = _superadmin_headers(db)
        # Ensure the builtin .tex row exists and is currently the default.
        client.get("/api/v1/certificate-templates", headers=headers)
        builtin = next(t for t in client.get("/api/v1/certificate-templates", headers=headers).json() if t["is_builtin"])
        assert builtin["is_default"] is True

        doc_cert = _create_published_document_template(client, auth_headers, type_="certificate", name="Editor Certificate")
        r = client.post(f"/api/v1/document-templates/{doc_cert['id']}/set-default", headers=auth_headers)
        assert r.status_code == 200, r.text

        refreshed_builtin = client.get(f"/api/v1/certificate-templates", headers=headers).json()
        builtin_row = next(t for t in refreshed_builtin if t["id"] == builtin["id"])
        assert builtin_row["is_default"] is False

    def test_marking_certificate_template_default_clears_document_certificate_default(
        self, client: TestClient, db: Session, auth_headers: dict
    ) -> None:
        headers = _superadmin_headers(db)
        doc_cert = _create_published_document_template(client, auth_headers, type_="certificate", name="Editor Certificate 2")
        client.post(f"/api/v1/document-templates/{doc_cert['id']}/set-default", headers=auth_headers)

        source = (
            __import__("pathlib").Path(__file__).resolve().parent.parent / "app" / "templates" / "certificates" / "default.tex.jinja"
        ).read_text(encoding="utf-8")
        uploaded = client.post(
            "/api/v1/certificate-templates",
            files={"file": ("template.tex", source.encode("utf-8"), "text/x-tex")},
            data={"name": "New Cert Default", "is_default": "true"},
            headers=headers,
        )
        assert uploaded.status_code == 201, uploaded.text

        refreshed_doc = client.get(f"/api/v1/document-templates/{doc_cert['id']}", headers=auth_headers).json()
        assert refreshed_doc["is_default"] is False


class TestVersioningCarriesDefaultForward:
    def test_publishing_new_version_of_default_template_keeps_it_default(self, client: TestClient, auth_headers: dict) -> None:
        template = _create_published_document_template(client, auth_headers, type_="procedure", name="Versioned Default")
        client.post(f"/api/v1/document-templates/{template['id']}/set-default", headers=auth_headers)

        branched = client.post(f"/api/v1/document-templates/{template['id']}/new-version", headers=auth_headers).json()
        published_v2 = client.post(f"/api/v1/document-templates/{branched['id']}/publish", headers=auth_headers).json()

        assert published_v2["is_default"] is True
        assert published_v2["version"] == 2

        # The list now shows only the new version as the default for this group.
        rows = client.get("/api/v1/document-templates?type=procedure&status=published", headers=auth_headers).json()
        matches = [t for t in rows if t["template_group_id"] == template["template_group_id"]]
        assert len(matches) == 1
        assert matches[0]["version"] == 2
        assert matches[0]["is_default"] is True
