"""
Tests for organization CRUD and the logo upload/delete endpoints.

Covers: admin-only mutation gating, logo upload (happy path + replace + reject
non-image), logo delete (happy path + no-op when unset), and that logo_url is
populated on list/get/create/update responses.
"""
import uuid

from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.user import User, UserRole


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


def _create_org(client: TestClient, auth_headers: dict, name: str | None = None) -> dict:
    response = client.post(
        "/api/v1/organizations",
        json={"name": name or f"Org {uuid.uuid4().hex[:8]}"},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


class TestOrganizationCrud:
    def test_create_organization(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        assert org["logo_file_id"] is None
        assert org["logo_url"] is None

    def test_non_admin_cannot_create(self, client: TestClient, db: Session) -> None:
        viewer = _viewer(db)
        response = client.post(
            "/api/v1/organizations", json={"name": "Nope"}, headers=_headers_for(viewer)
        )
        assert response.status_code == 403


class TestOrganizationLogo:
    def test_upload_logo_happy_path(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        response = client.post(
            f"/api/v1/organizations/{org['id']}/logo",
            files={"file": ("logo.png", b"fake-logo-bytes", "image/png")},
            headers=auth_headers,
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["logo_file_id"] is not None
        assert body["logo_url"]

    def test_uploading_new_logo_replaces_old_one(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        first = client.post(
            f"/api/v1/organizations/{org['id']}/logo",
            files={"file": ("first.png", b"first-bytes", "image/png")},
            headers=auth_headers,
        ).json()
        second = client.post(
            f"/api/v1/organizations/{org['id']}/logo",
            files={"file": ("second.png", b"second-bytes", "image/png")},
            headers=auth_headers,
        ).json()
        assert second["logo_file_id"] != first["logo_file_id"]

    def test_upload_rejects_non_image_content_type(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        response = client.post(
            f"/api/v1/organizations/{org['id']}/logo",
            files={"file": ("doc.pdf", b"%PDF-1.4", "application/pdf")},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_upload_rejects_non_admin(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        viewer = _viewer(db)
        response = client.post(
            f"/api/v1/organizations/{org['id']}/logo",
            files={"file": ("logo.png", b"fake-logo-bytes", "image/png")},
            headers=_headers_for(viewer),
        )
        assert response.status_code == 403

    def test_upload_nonexistent_org_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        response = client.post(
            f"/api/v1/organizations/{uuid.uuid4()}/logo",
            files={"file": ("logo.png", b"fake-logo-bytes", "image/png")},
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_delete_logo_clears_it(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        client.post(
            f"/api/v1/organizations/{org['id']}/logo",
            files={"file": ("logo.png", b"fake-logo-bytes", "image/png")},
            headers=auth_headers,
        )
        response = client.delete(f"/api/v1/organizations/{org['id']}/logo", headers=auth_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["logo_file_id"] is None
        assert body["logo_url"] is None

    def test_delete_logo_when_none_set_is_a_noop(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        response = client.delete(f"/api/v1/organizations/{org['id']}/logo", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["logo_file_id"] is None

    def test_delete_rejects_non_admin(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        viewer = _viewer(db)
        response = client.delete(f"/api/v1/organizations/{org['id']}/logo", headers=_headers_for(viewer))
        assert response.status_code == 403

    def test_get_organization_reflects_uploaded_logo(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        client.post(
            f"/api/v1/organizations/{org['id']}/logo",
            files={"file": ("logo.png", b"fake-logo-bytes", "image/png")},
            headers=auth_headers,
        )
        response = client.get(f"/api/v1/organizations/{org['id']}", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["logo_url"]

    def test_list_organizations_reflects_uploaded_logo(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        client.post(
            f"/api/v1/organizations/{org['id']}/logo",
            files={"file": ("logo.png", b"fake-logo-bytes", "image/png")},
            headers=auth_headers,
        )
        response = client.get("/api/v1/organizations", headers=auth_headers)
        assert response.status_code == 200
        found = next(o for o in response.json() if o["id"] == org["id"])
        assert found["logo_url"]
