"""
Regression tests for Viewer read-only enforcement on the locations endpoints.

There is no broader locations CRUD test suite yet — these are scoped to the
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
def created_org(client: TestClient, auth_headers: dict) -> dict:
    response = client.post("/api/v1/organizations", json={"name": f"Org {uuid.uuid4().hex[:8]}"}, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture()
def created_location(client: TestClient, auth_headers: dict, created_org: dict) -> dict:
    payload = {
        "organization_id": created_org["id"],
        "name": "Test Lab",
        "location_type": "lab",
    }
    response = client.post("/api/v1/locations", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


class TestViewerReadOnly:
    def test_viewer_cannot_create(self, client: TestClient, db: Session, created_org: dict) -> None:
        viewer = _viewer(db)
        response = client.post(
            "/api/v1/locations",
            json={"organization_id": created_org["id"], "name": "Nope", "location_type": "lab"},
            headers=_headers_for(viewer),
        )
        assert response.status_code == 403

    def test_viewer_cannot_update(self, client: TestClient, db: Session, created_location: dict) -> None:
        viewer = _viewer(db)
        response = client.put(
            f"/api/v1/locations/{created_location['id']}", json={"name": "Hijacked"}, headers=_headers_for(viewer)
        )
        assert response.status_code == 403

    def test_viewer_cannot_delete(self, client: TestClient, db: Session, created_location: dict) -> None:
        viewer = _viewer(db)
        response = client.delete(f"/api/v1/locations/{created_location['id']}", headers=_headers_for(viewer))
        assert response.status_code == 403

    def test_viewer_can_still_read(self, client: TestClient, db: Session, created_location: dict) -> None:
        viewer = _viewer(db)
        response = client.get(f"/api/v1/locations/{created_location['id']}", headers=_headers_for(viewer))
        assert response.status_code == 200
