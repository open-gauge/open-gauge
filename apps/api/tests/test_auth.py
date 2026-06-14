"""
Tests for the authentication flow.

Covers: login success, wrong password, unknown email, protected endpoint
access with a valid token, and rejection with a missing/invalid token.
"""
import uuid

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.user import User, UserRole


# ---------------------------------------------------------------------------
# Login endpoint
# ---------------------------------------------------------------------------

class TestLogin:
    def test_valid_credentials_return_token(
        self, client: TestClient, test_user: User, db: Session
    ) -> None:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": test_user.email, "password": "Testpass123!"},
        )
        assert response.status_code == 200
        body = response.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"

    def test_wrong_password_is_rejected(
        self, client: TestClient, test_user: User
    ) -> None:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": test_user.email, "password": "wrongpassword"},
        )
        assert response.status_code == 401

    def test_unknown_email_is_rejected(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "nobody@mar.test", "password": "password"},
        )
        assert response.status_code == 401

    def test_inactive_user_is_rejected(
        self, client: TestClient, db: Session
    ) -> None:
        inactive = User(
            id=uuid.uuid4(),
            email=f"inactive_{uuid.uuid4().hex[:6]}@mar.test",
            name="Inactive",
            hashed_password=hash_password("Testpass123!"),
            role=UserRole.viewer,
            is_active=False,
        )
        db.add(inactive)
        db.flush()

        response = client.post(
            "/api/v1/auth/login",
            json={"email": inactive.email, "password": "Testpass123!"},
        )
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Protected endpoint access
# ---------------------------------------------------------------------------

class TestTokenAccess:
    def test_valid_token_grants_access(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        response = client.get("/api/v1/users/me", headers=auth_headers)
        assert response.status_code == 200

    def test_missing_token_is_rejected(self, client: TestClient) -> None:
        response = client.get("/api/v1/users/me")
        assert response.status_code == 403  # HTTPBearer returns 403 when missing

    def test_malformed_token_is_rejected(self, client: TestClient) -> None:
        response = client.get(
            "/api/v1/users/me",
            headers={"Authorization": "Bearer notavalidjwt"},
        )
        assert response.status_code == 401

    def test_token_with_unknown_user_is_rejected(
        self, client: TestClient
    ) -> None:
        ghost_token = create_access_token({"sub": str(uuid.uuid4())})
        response = client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {ghost_token}"},
        )
        assert response.status_code == 401
