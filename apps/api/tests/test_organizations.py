"""
Tests for organization CRUD, membership, visibility, and the logo upload/
delete endpoints.

Covers: self-service creation (creator becomes admin), org-admin-only
mutation gating (not global-role gating — only Super Admin overrides),
private-organization redaction, member role changes / removal with
last-admin guards, and logo upload (happy path + replace + reject non-image).
"""
import uuid

from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.user import User, UserRole


def _make_user(db: Session, role: UserRole = UserRole.viewer) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"user_{uuid.uuid4().hex[:8]}@opengauge.test",
        name="Test User",
        hashed_password=hash_password("Testpass123!"),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def _viewer(db: Session) -> User:
    return _make_user(db, UserRole.viewer)


def _headers_for(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def _create_org(client: TestClient, headers: dict, name: str | None = None, **extra) -> dict:
    response = client.post(
        "/api/v1/organizations",
        json={"name": name or f"Org {uuid.uuid4().hex[:8]}", **extra},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


class TestOrganizationCrud:
    def test_create_organization(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        assert org["logo_file_id"] is None
        assert org["logo_url"] is None
        assert org["is_member"] is True
        assert org["my_role"] == "admin"
        assert org["can_manage"] is True

    def test_any_authenticated_user_can_create_including_viewer(self, client: TestClient, db: Session) -> None:
        """Org creation is self-service, independent of the global RBAC role —
        even a Viewer can create one and becomes its admin."""
        viewer = _viewer(db)
        org = _create_org(client, _headers_for(viewer), "Viewer's Org")
        assert org["my_role"] == "admin"
        assert org["can_manage"] is True

    def test_unauthenticated_cannot_create(self, client: TestClient) -> None:
        response = client.post("/api/v1/organizations", json={"name": "Nope"})
        assert response.status_code == 403

    def test_non_admin_member_cannot_update(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        outsider = _viewer(db)
        response = client.put(
            f"/api/v1/organizations/{org['id']}", json={"name": "Hijacked"}, headers=_headers_for(outsider)
        )
        assert response.status_code == 403

    def test_superadmin_can_manage_any_organization(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        """Only Super Admin overrides into an organization it isn't a member of —
        not the global `admin` role."""
        org = _create_org(client, auth_headers)
        superadmin = _make_user(db, UserRole.superadmin)
        response = client.put(
            f"/api/v1/organizations/{org['id']}", json={"description": "updated by superadmin"},
            headers=_headers_for(superadmin),
        )
        assert response.status_code == 200, response.text
        assert response.json()["description"] == "updated by superadmin"

    def test_global_admin_role_has_no_special_access(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        """auth_headers belongs to a global `admin`-role user, but that user isn't
        a member of this second org — the global admin role alone grants nothing here."""
        other_admin_creator = _make_user(db, UserRole.viewer)
        org = _create_org(client, _headers_for(other_admin_creator))
        response = client.put(
            f"/api/v1/organizations/{org['id']}", json={"name": "Hijacked"}, headers=auth_headers
        )
        assert response.status_code == 403


class TestOrganizationVisibility:
    def test_private_org_redacted_for_non_member(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers, private=True, description="secret stuff", email="secret@org.test")
        outsider = _viewer(db)
        response = client.get(f"/api/v1/organizations/{org['id']}", headers=_headers_for(outsider))
        assert response.status_code == 200
        body = response.json()
        assert body["name"] == org["name"]
        assert body["private"] is True
        assert body["description"] is None
        assert body["email"] is None
        assert body["is_member"] is False
        assert body["asset_count"] is None

    def test_private_org_listed_name_only(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers, private=True)
        outsider = _viewer(db)
        response = client.get("/api/v1/organizations", headers=_headers_for(outsider))
        assert response.status_code == 200
        found = next(o for o in response.json() if o["id"] == org["id"])
        assert found["name"] == org["name"]
        assert found["private"] is True

    def test_public_org_visible_to_non_member(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers, description="open info")
        outsider = _viewer(db)
        response = client.get(f"/api/v1/organizations/{org['id']}", headers=_headers_for(outsider))
        assert response.status_code == 200
        assert response.json()["description"] == "open info"

    def test_member_roster_is_never_public(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        """Even a non-private org's member list is members-only."""
        org = _create_org(client, auth_headers)
        outsider = _viewer(db)
        response = client.get(f"/api/v1/organizations/{org['id']}/members", headers=_headers_for(outsider))
        assert response.status_code == 403


class TestOrganizationMembership:
    def test_mine_filter_scopes_to_own_memberships(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        mine = _create_org(client, auth_headers, "Mine")
        other_creator = _viewer(db)
        _create_org(client, _headers_for(other_creator), "Not mine")
        response = client.get("/api/v1/organizations?mine=true", headers=auth_headers)
        assert response.status_code == 200
        ids = [o["id"] for o in response.json()]
        assert mine["id"] in ids
        assert all(o["name"] != "Not mine" for o in response.json())

    def test_admin_can_change_member_role(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        creator_id = org_creator_id(client, auth_headers)
        member = _viewer(db)
        client.post(f"/api/v1/organizations/{org['id']}/join-requests", headers=_headers_for(member))
        pending = client.get(f"/api/v1/organizations/{org['id']}/join-requests", headers=auth_headers).json()
        request_id = pending[0]["id"]
        client.post(f"/api/v1/organizations/{org['id']}/join-requests/{request_id}/approve", headers=auth_headers)

        response = client.put(
            f"/api/v1/organizations/{org['id']}/members/{member.id}", json={"role": "admin"}, headers=auth_headers
        )
        assert response.status_code == 200, response.text
        assert response.json()["role"] == "admin"
        _ = creator_id

    def test_last_admin_cannot_be_demoted(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        creator_id = org_creator_id(client, auth_headers)
        response = client.put(
            f"/api/v1/organizations/{org['id']}/members/{creator_id}", json={"role": "member"}, headers=auth_headers
        )
        assert response.status_code == 400

    def test_last_admin_cannot_remove_self(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        creator_id = org_creator_id(client, auth_headers)
        response = client.delete(f"/api/v1/organizations/{org['id']}/members/{creator_id}", headers=auth_headers)
        assert response.status_code == 400

    def test_last_admin_cannot_leave(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        response = client.post(f"/api/v1/organizations/{org['id']}/leave", headers=auth_headers)
        assert response.status_code == 400

    def test_member_can_leave(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        member = _viewer(db)
        client.post(f"/api/v1/organizations/{org['id']}/join-requests", headers=_headers_for(member))
        pending = client.get(f"/api/v1/organizations/{org['id']}/join-requests", headers=auth_headers).json()
        client.post(f"/api/v1/organizations/{org['id']}/join-requests/{pending[0]['id']}/approve", headers=auth_headers)

        response = client.post(f"/api/v1/organizations/{org['id']}/leave", headers=_headers_for(member))
        assert response.status_code == 204

        members = client.get(f"/api/v1/organizations/{org['id']}/members", headers=auth_headers).json()
        assert not any(m["user_id"] == str(member.id) for m in members)


class TestOrganizationJoinRequests:
    def test_request_then_approve_makes_requester_a_member(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        org = _create_org(client, auth_headers)
        requester = _viewer(db)

        resp = client.post(f"/api/v1/organizations/{org['id']}/join-requests", headers=_headers_for(requester))
        assert resp.status_code == 201, resp.text
        assert resp.json()["status"] == "pending"

        pending = client.get(f"/api/v1/organizations/{org['id']}/join-requests", headers=auth_headers).json()
        assert len(pending) == 1
        request_id = pending[0]["id"]

        approve = client.post(
            f"/api/v1/organizations/{org['id']}/join-requests/{request_id}/approve", headers=auth_headers
        )
        assert approve.status_code == 204

        member_view = client.get(f"/api/v1/organizations/{org['id']}", headers=_headers_for(requester)).json()
        assert member_view["is_member"] is True
        assert member_view["my_role"] == "member"

    def test_reject_does_not_create_membership(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        requester = _viewer(db)
        client.post(f"/api/v1/organizations/{org['id']}/join-requests", headers=_headers_for(requester))
        pending = client.get(f"/api/v1/organizations/{org['id']}/join-requests", headers=auth_headers).json()

        reject = client.post(
            f"/api/v1/organizations/{org['id']}/join-requests/{pending[0]['id']}/reject", headers=auth_headers
        )
        assert reject.status_code == 204

        member_view = client.get(f"/api/v1/organizations/{org['id']}", headers=_headers_for(requester)).json()
        assert member_view["is_member"] is False

    def test_duplicate_pending_request_is_rejected(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        requester = _viewer(db)
        first = client.post(f"/api/v1/organizations/{org['id']}/join-requests", headers=_headers_for(requester))
        assert first.status_code == 201
        second = client.post(f"/api/v1/organizations/{org['id']}/join-requests", headers=_headers_for(requester))
        assert second.status_code == 400

    def test_existing_member_cannot_request_to_join(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        response = client.post(f"/api/v1/organizations/{org['id']}/join-requests", headers=auth_headers)
        assert response.status_code == 400

    def test_non_admin_cannot_list_or_decide_requests(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        requester = _viewer(db)
        client.post(f"/api/v1/organizations/{org['id']}/join-requests", headers=_headers_for(requester))

        outsider = _viewer(db)
        list_resp = client.get(f"/api/v1/organizations/{org['id']}/join-requests", headers=_headers_for(outsider))
        assert list_resp.status_code == 403

    def test_join_request_notifies_org_admin(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        """The in-app notification is the guaranteed channel, independent of SMTP config."""
        org = _create_org(client, auth_headers)
        creator_id = org_creator_id(client, auth_headers)
        requester = _viewer(db)
        client.post(f"/api/v1/organizations/{org['id']}/join-requests", headers=_headers_for(requester))

        notifications = client.get("/api/v1/notifications", headers=auth_headers).json()
        notification = next(n for n in notifications if n["type"] == "organization.join_requested")
        # Deep-links to edit mode so the admin lands on the new "Pending" row directly.
        assert notification["link"] == f"/organizations/{org['id']}?edit=1"
        _ = creator_id


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

    def test_upload_rejects_non_member(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        outsider = _viewer(db)
        response = client.post(
            f"/api/v1/organizations/{org['id']}/logo",
            files={"file": ("logo.png", b"fake-logo-bytes", "image/png")},
            headers=_headers_for(outsider),
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

    def test_delete_rejects_non_member(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        outsider = _viewer(db)
        response = client.delete(f"/api/v1/organizations/{org['id']}/logo", headers=_headers_for(outsider))
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


class TestOrganizationDeactivationVisibility:
    def test_deactivated_org_is_404_for_non_superadmin(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        delete = client.delete(f"/api/v1/organizations/{org['id']}", headers=auth_headers)
        assert delete.status_code == 204
        response = client.get(f"/api/v1/organizations/{org['id']}", headers=auth_headers)
        assert response.status_code == 404

    def test_deactivated_org_still_reachable_by_superadmin(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        org = _create_org(client, auth_headers)
        client.delete(f"/api/v1/organizations/{org['id']}", headers=auth_headers)
        superadmin = _make_user(db, UserRole.superadmin)
        response = client.get(f"/api/v1/organizations/{org['id']}", headers=_headers_for(superadmin))
        assert response.status_code == 200
        assert response.json()["is_active"] is False

    def test_deactivated_org_excluded_from_list_for_non_superadmin(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        org = _create_org(client, auth_headers)
        client.delete(f"/api/v1/organizations/{org['id']}", headers=auth_headers)
        response = client.get("/api/v1/organizations", headers=auth_headers)
        assert all(o["id"] != org["id"] for o in response.json())

    def test_deactivated_org_included_in_list_for_superadmin(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        org = _create_org(client, auth_headers)
        client.delete(f"/api/v1/organizations/{org['id']}", headers=auth_headers)
        superadmin = _make_user(db, UserRole.superadmin)
        response = client.get("/api/v1/organizations", headers=_headers_for(superadmin))
        assert any(o["id"] == org["id"] for o in response.json())


class TestEligibleMembersAndAddMembers:
    def test_eligible_members_excludes_active_members(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        org = _create_org(client, auth_headers)
        creator_id = org_creator_id(client, auth_headers)
        candidate = _viewer(db)
        response = client.get(f"/api/v1/organizations/{org['id']}/eligible-members", headers=auth_headers)
        assert response.status_code == 200
        ids = [u["id"] for u in response.json()]
        assert str(candidate.id) in ids
        assert creator_id not in ids

    def test_eligible_members_is_org_admin_gated(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        outsider = _viewer(db)
        response = client.get(f"/api/v1/organizations/{org['id']}/eligible-members", headers=_headers_for(outsider))
        assert response.status_code == 403

    def test_add_members_creates_memberships(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        candidate = _viewer(db)
        response = client.post(
            f"/api/v1/organizations/{org['id']}/members",
            json={"user_ids": [str(candidate.id)]},
            headers=auth_headers,
        )
        assert response.status_code == 201, response.text
        assert any(m["user_id"] == str(candidate.id) and m["role"] == "member" for m in response.json())

        members = client.get(f"/api/v1/organizations/{org['id']}/members", headers=auth_headers).json()
        assert any(m["user_id"] == str(candidate.id) for m in members)

    def test_add_members_is_org_admin_gated(self, client: TestClient, auth_headers: dict, db: Session) -> None:
        org = _create_org(client, auth_headers)
        outsider = _viewer(db)
        candidate = _viewer(db)
        response = client.post(
            f"/api/v1/organizations/{org['id']}/members",
            json={"user_ids": [str(candidate.id)]},
            headers=_headers_for(outsider),
        )
        assert response.status_code == 403

    def test_add_members_skips_unknown_ids(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        response = client.post(
            f"/api/v1/organizations/{org['id']}/members",
            json={"user_ids": [str(uuid.uuid4())]},
            headers=auth_headers,
        )
        assert response.status_code == 201
        assert response.json() == client.get(f"/api/v1/organizations/{org['id']}/members", headers=auth_headers).json()


class TestViewerRelativeFields:
    def test_is_last_admin_true_for_sole_admin(self, client: TestClient, auth_headers: dict) -> None:
        org = _create_org(client, auth_headers)
        response = client.get(f"/api/v1/organizations/{org['id']}", headers=auth_headers)
        assert response.json()["is_last_admin"] is True

    def test_is_last_admin_false_once_second_admin_exists(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        org = _create_org(client, auth_headers)
        creator_id = org_creator_id(client, auth_headers)
        member = _viewer(db)
        client.post(f"/api/v1/organizations/{org['id']}/members", json={"user_ids": [str(member.id)]}, headers=auth_headers)
        client.put(f"/api/v1/organizations/{org['id']}/members/{member.id}", json={"role": "admin"}, headers=auth_headers)
        response = client.get(f"/api/v1/organizations/{org['id']}", headers=auth_headers)
        assert response.json()["is_last_admin"] is False
        _ = creator_id

    def test_has_pending_join_request_reflects_own_request(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        org = _create_org(client, auth_headers)
        requester = _viewer(db)
        before = client.get(f"/api/v1/organizations/{org['id']}", headers=_headers_for(requester)).json()
        assert before["has_pending_join_request"] is False
        client.post(f"/api/v1/organizations/{org['id']}/join-requests", headers=_headers_for(requester))
        after = client.get(f"/api/v1/organizations/{org['id']}", headers=_headers_for(requester)).json()
        assert after["has_pending_join_request"] is True

    def test_list_item_carries_viewer_relative_fields(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        org = _create_org(client, auth_headers)
        requester = _viewer(db)
        client.post(f"/api/v1/organizations/{org['id']}/join-requests", headers=_headers_for(requester))

        as_requester = client.get("/api/v1/organizations", headers=_headers_for(requester)).json()
        found = next(o for o in as_requester if o["id"] == org["id"])
        assert found["is_member"] is False
        assert found["has_pending_join_request"] is True
        assert found["member_count"] is None

        as_creator = client.get("/api/v1/organizations", headers=auth_headers).json()
        found_creator = next(o for o in as_creator if o["id"] == org["id"])
        assert found_creator["is_member"] is True
        assert found_creator["my_role"] == "admin"
        assert found_creator["is_last_admin"] is True
        assert found_creator["member_count"] == 1


def org_creator_id(client: TestClient, creator_headers: dict) -> str:
    """Helper: the calling user's own id, via /users/me."""
    return client.get("/api/v1/users/me", headers=creator_headers).json()["id"]
