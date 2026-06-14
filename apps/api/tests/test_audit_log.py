"""
Tests for audit-log behaviour.

Every asset.updated action must create an audit log entry with a non-null
before_state and after_state.  The Decimal serialization regression is
specifically exercised here (Numeric columns must not cause a 500 on commit).
"""
import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from tests.conftest import make_asset_id


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

    def test_sensor_channel_update_is_logged(
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
        # after_state records how many channels were written
        after = update_logs[0]["after_state"]
        assert "sensor_channels_count" in after
        assert after["sensor_channels_count"] == 1
