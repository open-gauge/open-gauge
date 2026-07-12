"""
Tests for certificate template upload/list/update/delete and preview.

Covers: dry-run compile validation on upload (happy path + rejects a broken
template), admin/superadmin gating (org-scoped templates need admin, global
templates need superadmin), is_default toggling within a scope, soft delete,
and the preview endpoints returning real PDF bytes.
"""
import uuid
from pathlib import Path

from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.organization import Organization
from app.models.user import User, UserRole

_BUILTIN_TEMPLATE = (
    Path(__file__).resolve().parent.parent / "app" / "templates" / "certificates" / "default.tex.jinja"
).read_text(encoding="utf-8")

_BROKEN_TEMPLATE = r"\documentclass{article}\begin{document}\undefinedcommand{oops}\end{document}"


def _org(db: Session) -> Organization:
    org = Organization(id=uuid.uuid4(), name=f"Org {uuid.uuid4().hex[:8]}")
    db.add(org)
    db.flush()
    return org


def _superadmin(db: Session) -> User:
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
    return user


def _viewer(db: Session) -> User:
    viewer = User(
        id=uuid.uuid4(),
        email=f"viewer_{uuid.uuid4().hex[:8]}@opengauge.test",
        name="Viewer",
        hashed_password=hash_password("Testpass123!"),
        role=UserRole.viewer,
        is_active=True,
    )
    db.add(viewer)
    db.flush()
    return viewer


def _headers_for(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def _upload(client: TestClient, headers: dict, *, org_id: str | None = None, is_default: bool = False, source: str = _BUILTIN_TEMPLATE, name: str = "Test Template"):
    data = {"name": name, "is_default": str(is_default).lower()}
    if org_id is not None:
        data["organization_id"] = org_id
    return client.post(
        "/api/v1/certificate-templates",
        files={"file": ("template.tex", source.encode("utf-8"), "text/x-tex")},
        data=data,
        headers=headers,
    )


class TestUploadTemplate:
    def test_org_scoped_upload_happy_path(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _org(db)
        response = _upload(client, auth_headers, org_id=str(org.id))
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["organization_id"] == str(org.id)
        assert body["is_active"] is True

    def test_rejects_broken_template_with_compile_error(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _org(db)
        response = _upload(client, auth_headers, org_id=str(org.id), source=_BROKEN_TEMPLATE)
        assert response.status_code == 400
        assert "compile" in response.json()["detail"].lower()

    def test_org_scoped_upload_rejects_non_admin(self, client: TestClient, db: Session) -> None:
        org = _org(db)
        viewer = _viewer(db)
        response = _upload(client, _headers_for(viewer), org_id=str(org.id))
        assert response.status_code == 403

    def test_global_upload_requires_superadmin_not_just_admin(self, client: TestClient, auth_headers: dict) -> None:
        # auth_headers is an "admin" role user (see conftest.test_user) — admin
        # alone must not be enough to set a template with global blast radius.
        response = _upload(client, auth_headers, org_id=None)
        assert response.status_code == 403

    def test_global_upload_succeeds_for_superadmin(self, client: TestClient, db: Session) -> None:
        superadmin = _superadmin(db)
        response = _upload(client, _headers_for(superadmin), org_id=None)
        assert response.status_code == 201, response.text
        assert response.json()["organization_id"] is None

    def test_second_default_unsets_first_within_same_scope(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _org(db)
        first = _upload(client, auth_headers, org_id=str(org.id), is_default=True, name="First").json()
        second = _upload(client, auth_headers, org_id=str(org.id), is_default=True, name="Second").json()

        listed = client.get(f"/api/v1/certificate-templates?organization_id={org.id}", headers=auth_headers).json()
        first_row = next(t for t in listed if t["id"] == first["id"])
        second_row = next(t for t in listed if t["id"] == second["id"])
        assert first_row["is_default"] is False
        assert second_row["is_default"] is True


class TestListUpdateDeleteTemplate:
    def test_update_metadata(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _org(db)
        created = _upload(client, auth_headers, org_id=str(org.id)).json()
        response = client.put(
            f"/api/v1/certificate-templates/{created['id']}",
            json={"name": "Renamed"},
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["name"] == "Renamed"

    def test_delete_soft_deletes_and_clears_default(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _org(db)
        created = _upload(client, auth_headers, org_id=str(org.id), is_default=True).json()

        response = client.delete(f"/api/v1/certificate-templates/{created['id']}", headers=auth_headers)
        assert response.status_code == 204

        listed = client.get(f"/api/v1/certificate-templates?organization_id={org.id}", headers=auth_headers).json()
        assert all(t["id"] != created["id"] for t in listed)

    def test_update_nonexistent_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        response = client.put(
            f"/api/v1/certificate-templates/{uuid.uuid4()}", json={"name": "x"}, headers=auth_headers
        )
        assert response.status_code == 404

    def test_delete_rejects_non_admin(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _org(db)
        created = _upload(client, auth_headers, org_id=str(org.id)).json()
        viewer = _viewer(db)
        response = client.delete(f"/api/v1/certificate-templates/{created['id']}", headers=_headers_for(viewer))
        assert response.status_code == 403


class TestPreview:
    def test_preview_returns_pdf_bytes(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _org(db)
        created = _upload(client, auth_headers, org_id=str(org.id)).json()
        response = client.post(f"/api/v1/certificate-templates/{created['id']}/preview", headers=auth_headers)
        assert response.status_code == 200, response.text
        assert response.headers["content-type"] == "application/pdf"
        assert response.content.startswith(b"%PDF-")

    def test_preview_builtin_returns_pdf_bytes(self, client: TestClient, auth_headers: dict) -> None:
        response = client.post("/api/v1/certificate-templates/preview-builtin", headers=auth_headers)
        assert response.status_code == 200, response.text
        assert response.content.startswith(b"%PDF-")

    def test_preview_nonexistent_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        response = client.post(f"/api/v1/certificate-templates/{uuid.uuid4()}/preview", headers=auth_headers)
        assert response.status_code == 404
