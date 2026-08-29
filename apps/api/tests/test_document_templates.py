"""
Tests for the Document Templates API: create/list/get, draft-only editing,
publish/immutability, new-version branching, duplication, and archiving.
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


def _create(client: TestClient, headers: dict, *, name: str = "Test Certificate", type: str = "certificate"):
    return client.post("/api/v1/document-templates", json={"name": name, "type": type}, headers=headers)


class TestCreateAndList:
    def test_create_happy_path(self, client: TestClient, auth_headers: dict):
        response = _create(client, auth_headers)
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["status"] == "draft"
        assert body["version"] == 1
        assert body["type"] == "certificate"
        assert body["document"]["blocks"] == []

    def test_create_rejects_viewer(self, client: TestClient, db: Session):
        viewer = _viewer(db)
        response = _create(client, _headers_for(viewer))
        assert response.status_code == 403

    def test_create_rejects_invalid_type(self, client: TestClient, auth_headers: dict):
        response = client.post(
            "/api/v1/document-templates", json={"name": "Bad", "type": "invoice"}, headers=auth_headers
        )
        assert response.status_code == 422

    def test_list_returns_only_latest_version_per_group(self, client: TestClient, auth_headers: dict):
        created = _create(client, auth_headers, name="Versioned Template").json()
        client.post(f"/api/v1/document-templates/{created['id']}/publish", headers=auth_headers)
        branched = client.post(
            f"/api/v1/document-templates/{created['id']}/new-version", headers=auth_headers
        ).json()
        assert branched["version"] == 2

        listing = client.get("/api/v1/document-templates", headers=auth_headers).json()
        group_ids = [item["id"] for item in listing if item["template_group_id"] == created["template_group_id"]]
        assert group_ids == [branched["id"]]

    def test_list_filters_by_type_and_status(self, client: TestClient, auth_headers: dict):
        cert = _create(client, auth_headers, name="Filter Cert", type="certificate").json()
        _create(client, auth_headers, name="Filter Proc", type="procedure")

        certs = client.get("/api/v1/document-templates", params={"type": "certificate"}, headers=auth_headers).json()
        assert all(item["type"] == "certificate" for item in certs)
        assert any(item["id"] == cert["id"] for item in certs)

        drafts = client.get("/api/v1/document-templates", params={"status": "draft"}, headers=auth_headers).json()
        assert all(item["status"] == "draft" for item in drafts)


class TestGet:
    def test_get_returns_404_for_missing(self, client: TestClient, auth_headers: dict):
        response = client.get(f"/api/v1/document-templates/{uuid.uuid4()}", headers=auth_headers)
        assert response.status_code == 404


class TestUpdate:
    def test_update_draft_happy_path_and_audit_diff(self, client: TestClient, auth_headers: dict, db: Session):
        created = _create(client, auth_headers).json()
        response = client.put(
            f"/api/v1/document-templates/{created['id']}",
            json={"description": "Updated description"},
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["description"] == "Updated description"

        from app.models.audit_log import AuditLog

        log = (
            db.query(AuditLog)
            .filter(AuditLog.entity_id == uuid.UUID(created["id"]), AuditLog.action == "document_template.updated")
            .first()
        )
        assert log is not None
        assert log.before_state == {"description": None}
        assert log.after_state == {"description": "Updated description"}

    def test_update_rejects_malformed_document(self, client: TestClient, auth_headers: dict):
        created = _create(client, auth_headers).json()
        response = client.put(
            f"/api/v1/document-templates/{created['id']}",
            json={"document": {"settings": {}}},
            headers=auth_headers,
        )
        assert response.status_code == 422

    def test_update_published_template_is_rejected(self, client: TestClient, auth_headers: dict):
        created = _create(client, auth_headers).json()
        client.post(f"/api/v1/document-templates/{created['id']}/publish", headers=auth_headers)
        response = client.put(
            f"/api/v1/document-templates/{created['id']}",
            json={"description": "should not apply"},
            headers=auth_headers,
        )
        assert response.status_code == 409


class TestPublish:
    def test_publish_happy_path(self, client: TestClient, auth_headers: dict):
        created = _create(client, auth_headers).json()
        response = client.post(f"/api/v1/document-templates/{created['id']}/publish", headers=auth_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "published"
        assert body["published_at"] is not None

    def test_publish_non_draft_is_rejected(self, client: TestClient, auth_headers: dict):
        created = _create(client, auth_headers).json()
        client.post(f"/api/v1/document-templates/{created['id']}/publish", headers=auth_headers)
        response = client.post(f"/api/v1/document-templates/{created['id']}/publish", headers=auth_headers)
        assert response.status_code == 400


class TestNewVersion:
    def test_branch_creates_draft_from_published(self, client: TestClient, auth_headers: dict):
        created = _create(client, auth_headers).json()
        client.post(f"/api/v1/document-templates/{created['id']}/publish", headers=auth_headers)
        branched = client.post(f"/api/v1/document-templates/{created['id']}/new-version", headers=auth_headers)
        assert branched.status_code == 200
        body = branched.json()
        assert body["status"] == "draft"
        assert body["version"] == 2
        assert body["template_group_id"] == created["template_group_id"]

    def test_branch_is_idempotent_when_draft_already_exists(self, client: TestClient, auth_headers: dict):
        created = _create(client, auth_headers).json()
        client.post(f"/api/v1/document-templates/{created['id']}/publish", headers=auth_headers)
        first = client.post(f"/api/v1/document-templates/{created['id']}/new-version", headers=auth_headers).json()
        second = client.post(f"/api/v1/document-templates/{created['id']}/new-version", headers=auth_headers).json()
        assert first["id"] == second["id"]


class TestDuplicate:
    def test_duplicate_creates_independent_template(self, client: TestClient, auth_headers: dict):
        created = _create(client, auth_headers, name="Original").json()
        response = client.post(
            f"/api/v1/document-templates/{created['id']}/duplicate", json={}, headers=auth_headers
        )
        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Original (copy)"
        assert body["template_group_id"] != created["template_group_id"]
        assert body["status"] == "draft"
        assert body["version"] == 1


class TestArchive:
    def test_archive_hides_from_default_list(self, client: TestClient, auth_headers: dict):
        created = _create(client, auth_headers, name="To Archive").json()
        response = client.post(f"/api/v1/document-templates/{created['id']}/archive", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["status"] == "archived"

        listing = client.get("/api/v1/document-templates", headers=auth_headers).json()
        assert all(item["id"] != created["id"] for item in listing)

        with_archived = client.get(
            "/api/v1/document-templates", params={"include_archived": True}, headers=auth_headers
        ).json()
        assert any(item["id"] == created["id"] for item in with_archived)

    def test_archive_twice_is_rejected(self, client: TestClient, auth_headers: dict):
        created = _create(client, auth_headers).json()
        client.post(f"/api/v1/document-templates/{created['id']}/archive", headers=auth_headers)
        response = client.post(f"/api/v1/document-templates/{created['id']}/archive", headers=auth_headers)
        assert response.status_code == 400
