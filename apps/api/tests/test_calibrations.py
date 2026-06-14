"""
Tests for calibration records and coefficients.

Covers: create calibration, list calibrations for asset, list coefficients,
calibration date ordering (most recent first).
"""
import uuid

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from tests.conftest import make_asset_id


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def asset(client: TestClient, auth_headers: dict) -> dict:
    payload = {
        "asset_id": make_asset_id(),
        "asset_type": "sensor",
        "name": "Cal Test Sensor",
        "manufacturer": "Fluke",
        "model": "724",
        "sensor_channels": [
            {"channel_id": "CH1", "physical_quantity": "temperature", "unit": "°C"}
        ],
    }
    r = client.post("/api/v1/assets", json=payload, headers=auth_headers)
    assert r.status_code == 201
    return r.json()


@pytest.fixture()
def calibration(client: TestClient, auth_headers: dict, asset: dict) -> dict:
    payload = {
        "asset_id": asset["id"],
        "calibration_date": "2024-03-15",
        "due_date": "2025-03-15",
        "performed_by_name": "Lab Tech A",
        "result": "pass",
        "notes": "Annual calibration",
    }
    r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Calibration CRUD
# ---------------------------------------------------------------------------

class TestCreateCalibration:
    def test_create_pass_calibration(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        payload = {
            "asset_id": asset["id"],
            "calibration_date": "2024-06-01",
            "due_date": "2025-06-01",
            "performed_by_name": "Technician B",
            "result": "pass",
        }
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201
        body = r.json()
        assert body["result"] == "pass"
        assert body["asset_id"] == asset["id"]

    def test_create_fail_calibration(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        payload = {
            "asset_id": asset["id"],
            "calibration_date": "2024-07-01",
            "due_date": "2025-07-01",
            "performed_by_name": "Technician C",
            "result": "fail",
            "notes": "Out of tolerance",
        }
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201
        assert r.json()["result"] == "fail"

    def test_calibration_for_nonexistent_asset_fails(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        payload = {
            "asset_id": str(uuid.uuid4()),
            "calibration_date": "2024-01-01",
            "due_date": "2025-01-01",
            "performed_by_name": "Ghost",
            "result": "pass",
        }
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 404


class TestListCalibrations:
    def test_list_calibrations_for_asset(
        self,
        client: TestClient,
        auth_headers: dict,
        asset: dict,
        calibration: dict,
    ) -> None:
        r = client.get(
            f"/api/v1/assets/{asset['id']}/calibrations",
            headers=auth_headers,
        )
        assert r.status_code == 200
        cals = r.json()
        assert any(c["id"] == calibration["id"] for c in cals)

    def test_calibrations_ordered_most_recent_first(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        for date_str in ("2023-01-01", "2024-01-01", "2022-01-01"):
            client.post(
                "/api/v1/calibrations",
                json={
                    "asset_id": asset["id"],
                    "calibration_date": date_str,
                    "due_date": "2025-01-01",
                    "performed_by_name": "Auto",
                    "result": "pass",
                },
                headers=auth_headers,
            )
        r = client.get(
            f"/api/v1/assets/{asset['id']}/calibrations", headers=auth_headers
        )
        cals = r.json()
        dates = [c["calibration_date"] for c in cals]
        assert dates == sorted(dates, reverse=True)


# ---------------------------------------------------------------------------
# Coefficients
# ---------------------------------------------------------------------------

class TestCalibrationCoefficients:
    def test_create_linear_coefficient(
        self,
        client: TestClient,
        auth_headers: dict,
        calibration: dict,
    ) -> None:
        payload = {
            "calibration_id": calibration["id"],
            "coefficient_type": "linear",
            "channel": "CH1",
            "gain": 1.0023,
            "offset_value": -0.15,
            "unit_input": "mV",
            "unit_output": "°C",
        }
        r = client.post(
            f"/api/v1/calibrations/{calibration['id']}/coefficients",
            json=payload,
            headers=auth_headers,
        )
        assert r.status_code == 201
        body = r.json()
        assert abs(body["gain"] - 1.0023) < 1e-6
        assert abs(body["offset_value"] - (-0.15)) < 1e-6

    def test_list_coefficients_for_calibration(
        self,
        client: TestClient,
        auth_headers: dict,
        calibration: dict,
    ) -> None:
        # Create two coefficients
        for channel in ("CH1", "CH2"):
            client.post(
                f"/api/v1/calibrations/{calibration['id']}/coefficients",
                json={
                    "calibration_id": calibration["id"],
                    "coefficient_type": "linear",
                    "channel": channel,
                    "gain": 1.0,
                    "offset_value": 0.0,
                },
                headers=auth_headers,
            )
        r = client.get(
            f"/api/v1/calibrations/{calibration['id']}/coefficients",
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert len(r.json()) >= 2

    def test_coefficients_for_nonexistent_calibration(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"/api/v1/calibrations/{uuid.uuid4()}/coefficients",
            headers=auth_headers,
        )
        assert r.status_code == 404
