"""
Tests for team CRUD (admin-only) and self-service team membership
(join/leave). Regression coverage for the switch from an implicit
"every org member is in every team" model to explicit opt-in membership
via the team_members join table.
"""
import uuid

from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.organization import Organization
from app.models.team import Team
from app.models.user import User, UserRole


def _org(db: Session) -> Organization:
    org = Organization(id=uuid.uuid4(), name=f"Org {uuid.uuid4().hex[:6]}")
    db.add(org)
    db.flush()
    return org


def _user(db: Session, org: Organization, role: UserRole = UserRole.technician) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"user_{uuid.uuid4().hex[:8]}@opengauge.test",
        name="Test User",
        hashed_password=hash_password("Testpass123!"),
        role=role,
        organization_id=org.id,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def _team(db: Session, org: Organization, creator: User, name: str = "Cal Lab") -> Team:
    team = Team(id=uuid.uuid4(), organization_id=org.id, name=name, created_by=creator.id)
    db.add(team)
    db.flush()
    return team


def _headers(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


class TestTeamMembershipIsOptIn:
    def test_new_org_member_is_not_a_team_member_by_default(
        self, client: TestClient, db: Session
    ) -> None:
        org = _org(db)
        admin = _user(db, org, role=UserRole.admin)
        team = _team(db, org, admin)
        member = _user(db, org)

        resp = client.get("/api/v1/teams", headers=_headers(member))
        assert resp.status_code == 200, resp.text
        row = next(t for t in resp.json() if t["id"] == str(team.id))
        assert row["is_member"] is False

    def test_join_then_list_shows_membership(self, client: TestClient, db: Session) -> None:
        org = _org(db)
        admin = _user(db, org, role=UserRole.admin)
        team = _team(db, org, admin)
        member = _user(db, org)

        join = client.post(f"/api/v1/teams/{team.id}/join", headers=_headers(member))
        assert join.status_code == 200, join.text
        assert join.json()["is_member"] is True

        listing = client.get("/api/v1/teams", headers=_headers(member))
        row = next(t for t in listing.json() if t["id"] == str(team.id))
        assert row["is_member"] is True

    def test_leave_removes_membership(self, client: TestClient, db: Session) -> None:
        org = _org(db)
        admin = _user(db, org, role=UserRole.admin)
        team = _team(db, org, admin)
        member = _user(db, org)
        client.post(f"/api/v1/teams/{team.id}/join", headers=_headers(member))

        leave = client.delete(f"/api/v1/teams/{team.id}/leave", headers=_headers(member))
        assert leave.status_code == 200, leave.text
        assert leave.json()["is_member"] is False

        listing = client.get("/api/v1/teams", headers=_headers(member))
        row = next(t for t in listing.json() if t["id"] == str(team.id))
        assert row["is_member"] is False

    def test_join_is_idempotent(self, client: TestClient, db: Session) -> None:
        org = _org(db)
        admin = _user(db, org, role=UserRole.admin)
        team = _team(db, org, admin)
        member = _user(db, org)

        first = client.post(f"/api/v1/teams/{team.id}/join", headers=_headers(member))
        second = client.post(f"/api/v1/teams/{team.id}/join", headers=_headers(member))
        assert first.status_code == 200
        assert second.status_code == 200

    def test_cannot_join_a_team_in_another_organization(
        self, client: TestClient, db: Session
    ) -> None:
        org_a = _org(db)
        org_b = _org(db)
        admin_a = _user(db, org_a, role=UserRole.admin)
        team_a = _team(db, org_a, admin_a)
        outsider = _user(db, org_b)

        resp = client.post(f"/api/v1/teams/{team_a.id}/join", headers=_headers(outsider))
        assert resp.status_code == 404

    def test_get_user_profile_reflects_joined_teams(
        self, client: TestClient, db: Session
    ) -> None:
        org = _org(db)
        admin = _user(db, org, role=UserRole.admin)
        team = _team(db, org, admin)
        member = _user(db, org)
        client.post(f"/api/v1/teams/{team.id}/join", headers=_headers(member))

        resp = client.get(f"/api/v1/users/{member.id}", headers=_headers(member))
        assert resp.status_code == 200, resp.text
        team_ids = [t["id"] for t in resp.json()["teams"]]
        assert str(team.id) in team_ids


class TestTeamCrudIsAdminOnly:
    def test_non_admin_cannot_create_team(self, client: TestClient, db: Session) -> None:
        org = _org(db)
        member = _user(db, org)
        resp = client.post(
            "/api/v1/teams", json={"name": "Rogue Team"}, headers=_headers(member)
        )
        assert resp.status_code == 403

    def test_non_admin_cannot_delete_team(self, client: TestClient, db: Session) -> None:
        org = _org(db)
        admin = _user(db, org, role=UserRole.admin)
        team = _team(db, org, admin)
        member = _user(db, org)

        resp = client.delete(f"/api/v1/teams/{team.id}", headers=_headers(member))
        assert resp.status_code == 403

    def test_admin_can_create_and_delete_team(self, client: TestClient, db: Session) -> None:
        org = _org(db)
        admin = _user(db, org, role=UserRole.admin)

        create = client.post(
            "/api/v1/teams",
            json={"name": "New Team", "organization_id": str(org.id)},
            headers=_headers(admin),
        )
        assert create.status_code == 201, create.text
        team_id = create.json()["id"]

        delete = client.delete(f"/api/v1/teams/{team_id}", headers=_headers(admin))
        assert delete.status_code == 204
