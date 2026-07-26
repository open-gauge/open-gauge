"""
Tests for the Admin -> Database panel: /admin/database/reset.

/admin/database/export and /admin/database/import shell out to pg_dump /
pg_restore against the real DATABASE_URL — they commit directly to the
database outside the test's rolled-back transaction, so they are not covered
here (would leave real state behind / require a disposable database). Only
reset_to_clean_state runs entirely through the injected ORM session and is
safe to exercise: it's rolled back like every other test.

See test_database_admin_service.py for coverage of the export/import zip
bundling logic itself (pg_dump/pg_restore and MinIO mocked out there).
"""
import uuid

from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.asset import Asset, AssetType
from app.models.organization import Organization
from app.models.user import User, UserRole


def _superadmin_headers(db: Session) -> dict:
    user = User(
        id=uuid.uuid4(),
        email=f"superadmin_{uuid.uuid4().hex[:8]}@opengauge.test",
        name="Super Admin",
        hashed_password=hash_password("Testpass123!"),
        role=UserRole.superadmin,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user, {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


class TestDatabaseAccessControl:
    def test_admin_role_is_rejected_from_database_endpoints(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """auth_headers belongs to an `admin`-role user — the database
        endpoints require the stricter superadmin-only check."""
        resp = client.post("/api/v1/admin/database/reset", json={"confirm": "RESET"}, headers=auth_headers)
        assert resp.status_code == 403

    def test_export_requires_superadmin_role(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/admin/database/export", headers=auth_headers)
        assert resp.status_code == 403


class TestDatabaseReset:
    def test_reset_requires_exact_confirmation_string(self, client: TestClient, db: Session) -> None:
        _, headers = _superadmin_headers(db)
        resp = client.post("/api/v1/admin/database/reset", json={"confirm": "yes please"}, headers=headers)
        assert resp.status_code == 400

    def test_reset_wipes_data_but_keeps_superadmin_and_its_session(
        self, client: TestClient, db: Session
    ) -> None:
        superadmin, headers = _superadmin_headers(db)
        superadmin_id = superadmin.id

        # A non-superadmin user and some org/asset data that should be wiped.
        other_id = uuid.uuid4()
        other = User(
            id=other_id,
            email=f"regular_{uuid.uuid4().hex[:8]}@opengauge.test",
            name="Regular User",
            hashed_password=hash_password("Testpass123!"),
            role=UserRole.technician,
            is_active=True,
        )
        db.add(other)
        org = Organization(name="To Be Deleted", description="test org")
        db.add(org)
        db.flush()
        asset = Asset(
            asset_id="OG-91234",
            asset_type=AssetType.sensor,
            name="Doomed sensor",
            manufacturer="Acme",
            model="Test-1",
            created_by=superadmin_id,
        )
        db.add(asset)
        db.commit()

        resp = client.post("/api/v1/admin/database/reset", json={"confirm": "RESET"}, headers=headers)
        assert resp.status_code == 204, resp.text

        # Non-superadmin users and app data are gone.
        assert db.query(User).filter(User.id == other_id).first() is None
        assert db.query(Organization).count() == 0
        assert db.query(Asset).count() == 0

        # The superadmin who triggered the reset survives with the same id —
        # its already-issued session token must remain valid.
        kept = db.query(User).filter(User.id == superadmin_id).first()
        assert kept is not None
        assert kept.role == UserRole.superadmin
        assert kept.is_verified is True

        me = client.get("/api/v1/admin/stats", headers=headers)
        assert me.status_code == 200, me.text
