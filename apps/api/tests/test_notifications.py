"""
Tests for the in-app notification inbox: list/unread-count/mark-read/
mark-all-read, and per-user isolation (one user never sees another's
notifications). The notifications themselves are created as a side effect of
organization join-request events — see test_organizations.py.
"""
import uuid

from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.user import User, UserRole


def _viewer(db: Session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"viewer_{uuid.uuid4().hex[:8]}@opengauge.test",
        name="Viewer",
        hashed_password=hash_password("Testpass123!"),
        role=UserRole.viewer,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def _headers_for(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def _create_org(client: TestClient, headers: dict) -> dict:
    response = client.post("/api/v1/organizations", json={"name": f"Org {uuid.uuid4().hex[:8]}"}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _trigger_notification(client: TestClient, admin_headers: dict, org_id: str, db: Session) -> None:
    requester = _viewer(db)
    resp = client.post(f"/api/v1/organizations/{org_id}/join-requests", headers=_headers_for(requester))
    assert resp.status_code == 201, resp.text


class TestNotificationInbox:
    def test_unread_count_starts_at_zero(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/notifications/unread-count", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["count"] == 0

    def test_join_request_creates_unread_notification(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        org = _create_org(client, auth_headers)
        _trigger_notification(client, auth_headers, org["id"], db)

        count = client.get("/api/v1/notifications/unread-count", headers=auth_headers).json()["count"]
        assert count == 1

        notifications = client.get("/api/v1/notifications", headers=auth_headers).json()
        assert len(notifications) == 1
        assert notifications[0]["is_read"] is False
        assert notifications[0]["type"] == "organization.join_requested"

    def test_mark_read_clears_unread_count(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        _trigger_notification(client, auth_headers, org["id"], db)
        notification_id = client.get("/api/v1/notifications", headers=auth_headers).json()[0]["id"]

        resp = client.post(f"/api/v1/notifications/{notification_id}/read", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["is_read"] is True

        count = client.get("/api/v1/notifications/unread-count", headers=auth_headers).json()["count"]
        assert count == 0

    def test_mark_all_read(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        _trigger_notification(client, auth_headers, org["id"], db)
        _trigger_notification(client, auth_headers, org["id"], db)
        assert client.get("/api/v1/notifications/unread-count", headers=auth_headers).json()["count"] == 2

        resp = client.post("/api/v1/notifications/read-all", headers=auth_headers)
        assert resp.status_code == 204

        assert client.get("/api/v1/notifications/unread-count", headers=auth_headers).json()["count"] == 0

    def test_users_never_see_each_others_notifications(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        org = _create_org(client, auth_headers)
        _trigger_notification(client, auth_headers, org["id"], db)

        other = _viewer(db)
        other_notifications = client.get("/api/v1/notifications", headers=_headers_for(other)).json()
        assert other_notifications == []

    def test_mark_read_rejects_another_users_notification(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        org = _create_org(client, auth_headers)
        _trigger_notification(client, auth_headers, org["id"], db)
        notification_id = client.get("/api/v1/notifications", headers=auth_headers).json()[0]["id"]

        other = _viewer(db)
        resp = client.post(f"/api/v1/notifications/{notification_id}/read", headers=_headers_for(other))
        assert resp.status_code == 404

    def test_unauthenticated_is_rejected(self, client: TestClient) -> None:
        resp = client.get("/api/v1/notifications")
        assert resp.status_code == 403
