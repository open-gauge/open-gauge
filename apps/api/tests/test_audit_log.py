"""
Tests for audit-log behaviour.

Every asset.updated action must create an audit log entry with a non-null
before_state and after_state.  The Decimal serialization regression is
specifically exercised here (Numeric columns must not cause a 500 on commit).

Also covers the granular before/after diffing shared by organizations,
procedures, locations, and (newly) user admin edits — see
app/utils/audit_diff.py.
"""
import uuid

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.user import User, UserRole
from tests.conftest import make_asset_id


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


def _audit_logs_for(client: TestClient, headers: dict, entity_type: str, entity_id: str) -> list[dict]:
    r = client.get(
        "/api/v1/audit-logs",
        params={"entity_type": entity_type, "entity_id": entity_id},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def asset_with_numerics(client: TestClient, auth_headers: dict) -> dict:
    """Asset that has Numeric (Decimal) columns populated."""
    payload = {
        "asset_id": make_asset_id(),
        "asset_type": "sensor",
        "name": "Audit Log Sensor",
        "manufacturer": "Endress+Hauser",
        "model": "TMT162",
        "weight_kg": 1.25,
        "price_eur": 875.00,
        "operating_temperature_min": -20.0,
        "operating_temperature_max": 80.0,
        "operating_humidity_min": 10.0,
        "operating_humidity_max": 85.0,
    }
    r = client.post("/api/v1/assets", json=payload, headers=auth_headers)
    assert r.status_code == 201
    return r.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestAuditLogOnUpdate:
    def test_update_creates_audit_entry(
        self,
        client: TestClient,
        auth_headers: dict,
        asset_with_numerics: dict,
    ) -> None:
        asset_id = asset_with_numerics["id"]
        r = client.put(
            f"/api/v1/assets/{asset_id}",
            json={"name": "Renamed Asset"},
            headers=auth_headers,
        )
        assert r.status_code == 200

        logs_r = client.get(
            f"/api/v1/assets/{asset_id}/audit-logs", headers=auth_headers
        )
        assert logs_r.status_code == 200
        logs = logs_r.json()
        assert any(log["action"] == "asset.updated" for log in logs)

    def test_update_with_decimal_fields_does_not_500(
        self,
        client: TestClient,
        auth_headers: dict,
        asset_with_numerics: dict,
    ) -> None:
        """
        Regression: SQLAlchemy returns Decimal for Numeric columns.
        The _serialize helper in the PUT endpoint must convert them to float
        before storing the JSONB audit-log before_state / after_state.
        """
        asset_id = asset_with_numerics["id"]
        r = client.put(
            f"/api/v1/assets/{asset_id}",
            json={
                "weight_kg": 1.30,
                "price_eur": 900.00,
                "operating_temperature_min": -25.0,
                "operating_temperature_max": 85.0,
            },
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text

    def test_audit_entry_contains_before_and_after_state(
        self,
        client: TestClient,
        auth_headers: dict,
        asset_with_numerics: dict,
    ) -> None:
        asset_id = asset_with_numerics["id"]
        client.put(
            f"/api/v1/assets/{asset_id}",
            json={"name": "State Check Asset"},
            headers=auth_headers,
        )
        logs = client.get(
            f"/api/v1/assets/{asset_id}/audit-logs", headers=auth_headers
        ).json()

        update_logs = [l for l in logs if l["action"] == "asset.updated"]
        assert len(update_logs) >= 1
        entry = update_logs[0]
        assert entry["before_state"] is not None
        assert entry["after_state"] is not None
        # before_state must capture the original name, after_state the new one
        assert entry["before_state"].get("name") != entry["after_state"].get("name")

    def test_audit_entry_records_actor_email(
        self,
        client: TestClient,
        auth_headers: dict,
        asset_with_numerics: dict,
        test_user,
    ) -> None:
        asset_id = asset_with_numerics["id"]
        client.put(
            f"/api/v1/assets/{asset_id}",
            json={"name": "Actor Check"},
            headers=auth_headers,
        )
        logs = client.get(
            f"/api/v1/assets/{asset_id}/audit-logs", headers=auth_headers
        ).json()
        emails = [l["actor_email"] for l in logs if l["action"] == "asset.updated"]
        assert test_user.email in emails

    def test_audit_entry_includes_actor_name_role_and_picture(
        self,
        client: TestClient,
        auth_headers: dict,
        asset_with_numerics: dict,
        test_user,
    ) -> None:
        """Regression: the per-asset audit-log endpoint used to return raw,
        unenriched rows — actor_name/actor_role/actor_profile_picture_url were
        always null even though the top-level /audit-logs endpoint populated
        them via a live join against the current User row."""
        client.post(
            "/api/v1/users/me/picture",
            files={"file": ("photo.png", b"fake-image-bytes", "image/png")},
            headers=auth_headers,
        )
        asset_id = asset_with_numerics["id"]
        client.put(
            f"/api/v1/assets/{asset_id}",
            json={"name": "Actor Enrichment Check"},
            headers=auth_headers,
        )
        logs = client.get(
            f"/api/v1/assets/{asset_id}/audit-logs", headers=auth_headers
        ).json()
        entry = next(l for l in logs if l["action"] == "asset.updated")
        assert entry["actor_name"] == test_user.name
        assert entry["actor_role"] == test_user.role.value
        assert entry["actor_profile_picture_url"]

    def test_sensor_channel_added_is_logged_as_summary_row(
        self,
        client: TestClient,
        auth_headers: dict,
        asset_with_numerics: dict,
    ) -> None:
        asset_id = asset_with_numerics["id"]
        r = client.put(
            f"/api/v1/assets/{asset_id}",
            json={
                "sensor_channels": [
                    {"channel_id": "CH1", "physical_quantity": "humidity", "unit": "%RH"}
                ]
            },
            headers=auth_headers,
        )
        assert r.status_code == 200
        logs = client.get(
            f"/api/v1/assets/{asset_id}/audit-logs", headers=auth_headers
        ).json()
        update_logs = [l for l in logs if l["action"] == "asset.updated"]
        assert len(update_logs) >= 1
        # A brand-new channel gets one summary row, not a dump of every field
        after = update_logs[0]["after_state"]
        assert after.get("channel.CH1") == "added"
        before = update_logs[0]["before_state"]
        assert before.get("channel.CH1") is None

    def test_sensor_channel_field_change_is_logged_granularly(
        self,
        client: TestClient,
        auth_headers: dict,
        asset_with_numerics: dict,
    ) -> None:
        asset_id = asset_with_numerics["id"]
        client.put(
            f"/api/v1/assets/{asset_id}",
            json={
                "sensor_channels": [
                    {"channel_id": "CH1", "physical_quantity": "temperature", "unit": "degC"}
                ]
            },
            headers=auth_headers,
        )
        r = client.put(
            f"/api/v1/assets/{asset_id}",
            json={
                "sensor_channels": [
                    {"channel_id": "CH1", "physical_quantity": "pressure", "unit": "bar"}
                ]
            },
            headers=auth_headers,
        )
        assert r.status_code == 200
        logs = client.get(
            f"/api/v1/assets/{asset_id}/audit-logs", headers=auth_headers
        ).json()
        # created_at can tie within a single test transaction (Postgres now() is stable per
        # transaction), so find the entry by content rather than assuming list order.
        update_logs = [l for l in logs if l["action"] == "asset.updated"]
        entry = next(
            l for l in update_logs
            if l["after_state"].get("channel.CH1.physical_quantity") == "pressure"
        )
        assert entry["before_state"].get("channel.CH1.physical_quantity") == "temperature"
        assert entry["before_state"].get("channel.CH1.unit") == "degC"
        assert entry["after_state"].get("channel.CH1.unit") == "bar"

    def test_sensor_channel_removal_is_logged_as_summary_row(
        self,
        client: TestClient,
        auth_headers: dict,
        asset_with_numerics: dict,
    ) -> None:
        asset_id = asset_with_numerics["id"]
        client.put(
            f"/api/v1/assets/{asset_id}",
            json={
                "sensor_channels": [
                    {"channel_id": "CH1", "physical_quantity": "temperature", "unit": "degC"}
                ]
            },
            headers=auth_headers,
        )
        r = client.put(
            f"/api/v1/assets/{asset_id}",
            json={"sensor_channels": []},
            headers=auth_headers,
        )
        assert r.status_code == 200
        logs = client.get(
            f"/api/v1/assets/{asset_id}/audit-logs", headers=auth_headers
        ).json()
        update_logs = [l for l in logs if l["action"] == "asset.updated"]
        entry = next(l for l in update_logs if l["after_state"].get("channel.CH1") == "removed")
        assert entry["before_state"].get("channel.CH1") == "present"

    def test_putting_back_unchanged_values_produces_no_audit_entry(
        self,
        client: TestClient,
        auth_headers: dict,
        asset_with_numerics: dict,
    ) -> None:
        asset_id = asset_with_numerics["id"]
        before_logs = client.get(
            f"/api/v1/assets/{asset_id}/audit-logs", headers=auth_headers
        ).json()
        before_count = len([l for l in before_logs if l["action"] == "asset.updated"])

        r = client.put(
            f"/api/v1/assets/{asset_id}",
            json={"name": asset_with_numerics["name"]},
            headers=auth_headers,
        )
        assert r.status_code == 200

        after_logs = client.get(
            f"/api/v1/assets/{asset_id}/audit-logs", headers=auth_headers
        ).json()
        after_count = len([l for l in after_logs if l["action"] == "asset.updated"])
        assert after_count == before_count


class TestOrganizationUpdateAuditLog:
    def test_update_organization_records_real_before_after_values(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        org = client.post(
            "/api/v1/organizations",
            json={"name": f"Org {uuid.uuid4().hex[:8]}"},
            headers=auth_headers,
        ).json()
        r = client.put(
            f"/api/v1/organizations/{org['id']}",
            json={"name": "Renamed Org"},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        logs = _audit_logs_for(client, auth_headers, "organization", org["id"])
        entry = next(l for l in logs if l["action"] == "organization.updated")
        assert entry["before_state"]["name"] == org["name"]
        assert entry["after_state"]["name"] == "Renamed Org"


class TestProcedureUpdateAuditLog:
    def test_update_procedure_records_real_before_after_values(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        proc = client.post(
            "/api/v1/procedures",
            json={
                "proc_id": f"PROC-{uuid.uuid4().hex[:8]}",
                "physical_quantity": "temperature",
                "name": "Original Procedure",
            },
            headers=auth_headers,
        ).json()
        r = client.put(
            f"/api/v1/procedures/{proc['id']}",
            json={"name": "Updated Procedure"},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        logs = _audit_logs_for(client, auth_headers, "procedure", proc["id"])
        entry = next(l for l in logs if l["action"] == "procedure.updated")
        assert entry["before_state"]["name"] == "Original Procedure"
        assert entry["after_state"]["name"] == "Updated Procedure"


class TestLocationUpdateAuditLog:
    def test_update_location_records_real_before_after_values(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        org = client.post(
            "/api/v1/organizations",
            json={"name": f"Org {uuid.uuid4().hex[:8]}"},
            headers=auth_headers,
        ).json()
        loc = client.post(
            "/api/v1/locations",
            json={"organization_id": org["id"], "name": "Original Lab", "location_type": "lab"},
            headers=auth_headers,
        ).json()
        r = client.put(
            f"/api/v1/locations/{loc['id']}",
            json={"name": "Renamed Lab"},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        logs = _audit_logs_for(client, auth_headers, "location", loc["id"])
        entry = next(l for l in logs if l["action"] == "location.updated")
        assert entry["before_state"]["name"] == "Original Lab"
        assert entry["after_state"]["name"] == "Renamed Lab"


class TestUserAdminEditAuditLog:
    """PUT/DELETE /users/{id} (admin role/privilege edits) previously wrote no
    audit log entry at all."""

    def test_update_user_role_is_audited(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        viewer = _viewer(db)
        r = client.put(
            f"/api/v1/users/{viewer.id}", json={"role": "technician"}, headers=auth_headers
        )
        assert r.status_code == 200, r.text
        logs = _audit_logs_for(client, auth_headers, "user", str(viewer.id))
        entry = next(l for l in logs if l["action"] == "user.updated")
        assert entry["before_state"]["role"] == "viewer"
        assert entry["after_state"]["role"] == "technician"

    def test_deactivate_user_is_audited(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        viewer = _viewer(db)
        r = client.delete(f"/api/v1/users/{viewer.id}", headers=auth_headers)
        assert r.status_code == 204, r.text
        logs = _audit_logs_for(client, auth_headers, "user", str(viewer.id))
        entry = next(l for l in logs if l["action"] == "user.deactivated")
        assert entry["before_state"]["is_active"] is True
        assert entry["after_state"]["is_active"] is False
