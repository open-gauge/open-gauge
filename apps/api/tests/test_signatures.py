"""
Tests for user signature capture and cryptographic signing/verification.

Covers: upload (upload + drawn sources), viewer rejection, non-transparent-image
rejection, replace-keeps-keypair, public key retrieval, and independent
verification of both the image hash and the Ed25519 signature (including
tamper detection for each).
"""
import io
import uuid

from PIL import Image
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.user import User, UserRole
from app.models.user_signature import UserSignature
from app.models.user_signing_key import UserSigningKey


def _rgba_png_bytes() -> bytes:
    img = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _opaque_png_bytes() -> bytes:
    img = Image.new("RGB", (10, 10), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


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


def _upload(client: TestClient, headers: dict, data: bytes = None, source: str = "upload") -> dict:
    data = data if data is not None else _rgba_png_bytes()
    response = client.post(
        "/api/v1/users/me/signature",
        files={"file": ("signature.png", data, "image/png")},
        data={"source": source},
        headers=headers,
    )
    return response


class TestUploadSignature:
    def test_upload_happy_path(self, client: TestClient, auth_headers: dict, db: Session, test_user: User) -> None:
        response = _upload(client, auth_headers)
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["version"] == 1
        assert body["source"] == "upload"
        assert body["is_active"] is True
        assert body["image_url"]
        assert body["fingerprint_sha256"]

        assert db.query(UserSignature).filter(UserSignature.user_id == test_user.id).count() == 1
        assert db.query(UserSigningKey).filter(UserSigningKey.user_id == test_user.id).count() == 1

    def test_upload_drawn_happy_path(self, client: TestClient, auth_headers: dict) -> None:
        response = _upload(client, auth_headers, source="drawn")
        assert response.status_code == 201, response.text
        assert response.json()["source"] == "drawn"

    def test_rejects_invalid_source(self, client: TestClient, auth_headers: dict) -> None:
        response = _upload(client, auth_headers, source="bogus")
        assert response.status_code == 400

    def test_rejects_non_transparent_image(self, client: TestClient, auth_headers: dict) -> None:
        response = _upload(client, auth_headers, data=_opaque_png_bytes())
        assert response.status_code == 400

    def test_rejects_non_image_content_type(self, client: TestClient, auth_headers: dict) -> None:
        response = client.post(
            "/api/v1/users/me/signature",
            files={"file": ("doc.pdf", b"%PDF-1.4", "application/pdf")},
            data={"source": "upload"},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_rejects_viewer_role(self, client: TestClient, db: Session) -> None:
        viewer = _viewer(db)
        response = _upload(client, _headers_for(viewer))
        assert response.status_code == 403

    def test_rejects_unauthenticated(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/users/me/signature",
            files={"file": ("signature.png", _rgba_png_bytes(), "image/png")},
            data={"source": "upload"},
        )
        assert response.status_code == 403

    def test_reupload_replaces_active_but_reuses_keypair(
        self, client: TestClient, auth_headers: dict, db: Session, test_user: User
    ) -> None:
        first = _upload(client, auth_headers).json()
        second = _upload(client, auth_headers).json()

        assert second["version"] == first["version"] + 1
        assert second["fingerprint_sha256"] == first["fingerprint_sha256"]
        assert db.query(UserSigningKey).filter(UserSigningKey.user_id == test_user.id).count() == 1

        rows = db.query(UserSignature).filter(UserSignature.user_id == test_user.id).all()
        assert len(rows) == 2
        active_rows = [r for r in rows if r.is_active]
        assert len(active_rows) == 1
        assert str(active_rows[0].id) == second["id"]


class TestPublicKeyAndVerify:
    def test_public_key_endpoint_returns_parseable_pem(
        self, client: TestClient, auth_headers: dict, test_user: User
    ) -> None:
        _upload(client, auth_headers)
        response = client.get(f"/api/v1/users/{test_user.id}/signature/public-key", headers=auth_headers)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["algorithm"] == "Ed25519"
        assert "BEGIN PUBLIC KEY" in body["public_key_pem"]

    def test_public_key_404_when_no_signature_ever_uploaded(
        self, client: TestClient, auth_headers: dict, test_user: User
    ) -> None:
        response = client.get(f"/api/v1/users/{test_user.id}/signature/public-key", headers=auth_headers)
        assert response.status_code == 404

    def test_verify_returns_true_for_fresh_signature(
        self, client: TestClient, auth_headers: dict, test_user: User
    ) -> None:
        _upload(client, auth_headers)
        response = client.get(f"/api/v1/users/{test_user.id}/signature/verify", headers=auth_headers)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["verified"] is True
        assert body["image_hash_match"] is True
        assert body["signature_valid"] is True

    def test_verify_detects_tampered_image_bytes(
        self, client: TestClient, auth_headers: dict, test_user: User, monkeypatch
    ) -> None:
        _upload(client, auth_headers)
        monkeypatch.setattr(
            "app.api.v1.signatures.storage_svc.download_file",
            lambda *a, **kw: b"tampered-bytes",
        )
        response = client.get(f"/api/v1/users/{test_user.id}/signature/verify", headers=auth_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["image_hash_match"] is False
        assert body["verified"] is False

    def test_verify_detects_tampered_signature_bytes(
        self, client: TestClient, auth_headers: dict, db: Session, test_user: User
    ) -> None:
        _upload(client, auth_headers)
        sig = db.query(UserSignature).filter(UserSignature.user_id == test_user.id, UserSignature.is_active.is_(True)).one()
        sig.signature_bytes = b"\x00" * 64
        db.commit()

        response = client.get(f"/api/v1/users/{test_user.id}/signature/verify", headers=auth_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["signature_valid"] is False
        assert body["verified"] is False


class TestDeleteSignature:
    def test_delete_revokes_active_signature(
        self, client: TestClient, auth_headers: dict, test_user: User
    ) -> None:
        _upload(client, auth_headers)
        response = client.delete("/api/v1/users/me/signature", headers=auth_headers)
        assert response.status_code == 204

        me = client.get("/api/v1/users/me/signature", headers=auth_headers)
        assert me.status_code == 200
        assert me.json() is None

    def test_delete_when_none_set_is_a_noop(self, client: TestClient, auth_headers: dict) -> None:
        response = client.delete("/api/v1/users/me/signature", headers=auth_headers)
        assert response.status_code == 204

    def test_delete_preserves_history_still_independently_verifiable(
        self, client: TestClient, auth_headers: dict, test_user: User
    ) -> None:
        uploaded = _upload(client, auth_headers).json()
        client.delete("/api/v1/users/me/signature", headers=auth_headers)

        response = client.get(
            f"/api/v1/users/{test_user.id}/signature/verify",
            params={"signature_id": uploaded["id"]},
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["verified"] is True

    def test_delete_rejects_viewer_role(self, client: TestClient, db: Session) -> None:
        viewer = _viewer(db)
        response = client.delete("/api/v1/users/me/signature", headers=_headers_for(viewer))
        assert response.status_code == 403
