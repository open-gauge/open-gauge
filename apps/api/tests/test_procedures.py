"""
Regression tests for Viewer read-only enforcement on the procedures endpoints.

There is no broader procedures CRUD test suite yet — these are scoped to the
new permission restriction, not a full feature test pass.
"""
import uuid

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.user import User, UserRole


def _viewer(db: Session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"viewer_{uuid.uuid4().hex[:8]}@opengauge.test",
        name="Test Viewer",
        hashed_password=hash_password("Testpass123!"),
        role=UserRole.viewer,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def _headers_for(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


@pytest.fixture()
def created_procedure(client: TestClient, auth_headers: dict) -> dict:
    payload = {
        "proc_id": f"PROC-{uuid.uuid4().hex[:8]}",
        "physical_quantity": "temperature",
        "name": "Test Procedure",
    }
    response = client.post("/api/v1/procedures", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


class TestViewerReadOnly:
    def test_viewer_cannot_create(self, client: TestClient, db: Session) -> None:
        viewer = _viewer(db)
        response = client.post(
            "/api/v1/procedures",
            json={"proc_id": f"PROC-{uuid.uuid4().hex[:8]}", "physical_quantity": "temperature", "name": "Nope"},
            headers=_headers_for(viewer),
        )
        assert response.status_code == 403

    def test_viewer_cannot_update(self, client: TestClient, db: Session, created_procedure: dict) -> None:
        viewer = _viewer(db)
        response = client.put(
            f"/api/v1/procedures/{created_procedure['id']}", json={"name": "Hijacked"}, headers=_headers_for(viewer)
        )
        assert response.status_code == 403

    def test_viewer_cannot_delete(self, client: TestClient, db: Session, created_procedure: dict) -> None:
        viewer = _viewer(db)
        response = client.delete(f"/api/v1/procedures/{created_procedure['id']}", headers=_headers_for(viewer))
        assert response.status_code == 403

    def test_viewer_can_still_read(self, client: TestClient, db: Session, created_procedure: dict) -> None:
        viewer = _viewer(db)
        response = client.get(f"/api/v1/procedures/{created_procedure['id']}", headers=_headers_for(viewer))
        assert response.status_code == 200
