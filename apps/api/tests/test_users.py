"""
Tests for the user profile picture endpoints.

Covers: upload (happy path + replace + reject non-image), delete, and the
enrichment of GET /users/me and GET /users/{id} with profile_picture_url.
"""
import uuid

from starlette.testclient import TestClient

from app.models.user import User


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
