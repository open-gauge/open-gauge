"""
Tests for the user profile picture endpoints and PUT /users/{id} (admin-only
account management: role, organization, team, is_active, is_verified).

Covers: upload (happy path + replace + reject non-image), delete, and the
enrichment of GET /users/me and GET /users/{id} with profile_picture_url.
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


class TestUserPicture:
    def test_upload_picture_sets_profile_picture_url(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        response = client.post(
            "/api/v1/users/me/picture",
            files={"file": ("photo.png", b"fake-image-bytes", "image/png")},
            headers=auth_headers,
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["profile_picture_id"] is not None
        assert body["profile_picture_url"]

    def test_uploading_new_picture_replaces_old_one(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        first = client.post(
            "/api/v1/users/me/picture",
            files={"file": ("first.png", b"first-bytes", "image/png")},
            headers=auth_headers,
        ).json()
        second = client.post(
            "/api/v1/users/me/picture",
            files={"file": ("second.png", b"second-bytes", "image/png")},
            headers=auth_headers,
        ).json()
        assert second["profile_picture_id"] != first["profile_picture_id"]

    def test_upload_rejects_non_image_content_type(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        response = client.post(
            "/api/v1/users/me/picture",
            files={"file": ("doc.pdf", b"%PDF-1.4", "application/pdf")},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_upload_unauthenticated_is_rejected(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/users/me/picture",
            files={"file": ("photo.png", b"fake-image-bytes", "image/png")},
        )
        assert response.status_code == 403

    def test_delete_picture_clears_it(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        client.post(
            "/api/v1/users/me/picture",
            files={"file": ("photo.png", b"fake-image-bytes", "image/png")},
            headers=auth_headers,
        )
        response = client.delete("/api/v1/users/me/picture", headers=auth_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["profile_picture_id"] is None
        assert body["profile_picture_url"] is None

    def test_delete_picture_when_none_set_is_a_noop(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        response = client.delete("/api/v1/users/me/picture", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["profile_picture_id"] is None

    def test_get_me_reflects_uploaded_picture(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        client.post(
            "/api/v1/users/me/picture",
            files={"file": ("photo.png", b"fake-image-bytes", "image/png")},
            headers=auth_headers,
        )
        response = client.get("/api/v1/users/me", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["profile_picture_url"]

    def test_get_user_by_id_reflects_uploaded_picture(
        self, client: TestClient, auth_headers: dict, test_user: User
    ) -> None:
        client.post(
            "/api/v1/users/me/picture",
            files={"file": ("photo.png", b"fake-image-bytes", "image/png")},
            headers=auth_headers,
        )
        response = client.get(f"/api/v1/users/{test_user.id}", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["profile_picture_url"]

    def test_get_user_by_id_nonexistent_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        response = client.get(f"/api/v1/users/{uuid.uuid4()}", headers=auth_headers)
        assert response.status_code == 404


class TestUpdateUser:
    """PUT /users/{id} is admin-only — role, organization, team, is_active, and
    is_verified are all privilege-bearing fields. There is no self-service
    bypass (that's what PATCH /users/me is for, with its own narrower schema)."""

    def test_admin_can_update_another_user(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        viewer = _viewer(db)
        resp = client.put(
            f"/api/v1/users/{viewer.id}", json={"role": "technician"}, headers=auth_headers
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["role"] == "technician"

    def test_non_admin_cannot_self_escalate_role(
        self, client: TestClient, db: Session
    ) -> None:
        viewer = _viewer(db)
        headers = _headers_for(viewer)
        resp = client.put(
            f"/api/v1/users/{viewer.id}", json={"role": "superadmin"}, headers=headers
        )
        assert resp.status_code == 403

    def test_non_admin_cannot_self_verify(
        self, client: TestClient, db: Session
    ) -> None:
        viewer = _viewer(db)
        viewer.is_verified = False
        db.flush()
        headers = _headers_for(viewer)
        resp = client.put(
            f"/api/v1/users/{viewer.id}", json={"is_verified": True}, headers=headers
        )
        assert resp.status_code == 403

    def test_non_admin_cannot_update_another_user(
        self, client: TestClient, db: Session, test_user: User
    ) -> None:
        viewer = _viewer(db)
        headers = _headers_for(viewer)
        resp = client.put(
            f"/api/v1/users/{test_user.id}", json={"role": "viewer"}, headers=headers
        )
        assert resp.status_code == 403

    def test_admin_can_activate_a_pending_user(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        viewer = _viewer(db)
        viewer.is_verified = False
        db.flush()
        resp = client.put(
            f"/api/v1/users/{viewer.id}", json={"is_verified": True}, headers=auth_headers
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["is_verified"] is True

    def test_nonexistent_user_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.put(
            f"/api/v1/users/{uuid.uuid4()}", json={"role": "viewer"}, headers=auth_headers
        )
        assert resp.status_code == 404

    def test_requires_authentication(self, client: TestClient, test_user: User) -> None:
        resp = client.put(f"/api/v1/users/{test_user.id}", json={"role": "viewer"})
        assert resp.status_code == 403  # HTTPBearer returns 403 when missing
