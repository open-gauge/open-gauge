"""Integration tests for GET /api/v1/assets/{id}/health and
GET /api/v1/assets/{id}/health/curve-comparison.

Covers the empty-state truth table (0/1/2/3/5 calibrations), sensor_id
channel filtering, 404s, curve-comparison success/failure cases, and the
auth guard.
"""
import uuid

import pytest
from starlette.testclient import TestClient

from tests.conftest import make_asset_id


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

@pytest.fixture()
def asset(client: TestClient, auth_headers: dict) -> dict:
    payload = {
        "asset_id": make_asset_id(),
        "asset_type": "sensor",
        "name": "Health Test Sensor",
        "manufacturer": "Fluke",
        "model": "724",
        "sensor_channels": [
            {
                "channel_id": "CH1",
                "physical_quantity": "temperature",
                "unit": "degC",
                "measurement_min": 0.0,
                "measurement_max": 100.0,
                "accuracy_value": 1.0,
                "accuracy_type": "percent_of_full_scale",
            },
            {
                "channel_id": "CH2",
                "physical_quantity": "temperature",
                "unit": "degC",
                "measurement_min": 0.0,
                "measurement_max": 100.0,
            },
        ],
    }
    r = client.post("/api/v1/assets", json=payload, headers=auth_headers)
    assert r.status_code == 201, r.text
    return r.json()


def _sensor_id(asset_: dict, channel_id: str) -> str:
    for ch in asset_["sensor_channels"]:
        if ch["channel_id"] == channel_id:
            return ch["id"]
    raise AssertionError(f"channel {channel_id} not found")


def _create_calibration(
    client: TestClient,
    auth_headers: dict,
    asset_id: str,
    sensor_id: str,
    calibration_date: str,
    drift_offset: float,
) -> dict:
    """A calibration whose fitted line is y = x + drift_offset over [0, 100],
    so increasing drift_offset across calls simulates linear sensor drift."""
    payload = {
        "asset_id": asset_id,
        "calibration_date": calibration_date,
        "due_date": "2030-01-01",
        "performed_by_name": "Health Test Tech",
        "sensor_id": sensor_id,
        "poly_order": 1,
        "poly_coefficients": [1.0, drift_offset],
        "range_min": 0.0,
        "range_max": 100.0,
        "valid_range_min": 0.0,
        "valid_range_max": 100.0,
        "r_squared": 0.999,
        "rmse": 0.05,
        "max_error": 0.1,
        "expanded_uncertainty": 0.2,
        "hysteresis": 0.03,
        "non_linearity": 0.05,
        "repeatability": 0.01,
        "calibration_interval": 365,
    }
    r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Empty-state truth table
# ---------------------------------------------------------------------------

class TestEmptyStates:
    def test_zero_calibrations(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        r = client.get(f"/api/v1/assets/{asset['id']}/health", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["calibration_count"] == 0
        assert body["overview"] is None
        assert body["prediction"]["available"] is False

    def test_one_calibration(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        sensor_id = _sensor_id(asset, "CH1")
        _create_calibration(client, auth_headers, asset["id"], sensor_id, "2024-01-01", 0.0)
        r = client.get(f"/api/v1/assets/{asset['id']}/health?sensor_id={sensor_id}", headers=auth_headers)
        body = r.json()
        assert body["calibration_count"] == 1
        assert body["overview"] is None
        assert body["prediction"]["available"] is False

    def test_two_calibrations_show_drift_but_no_prediction(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        sensor_id = _sensor_id(asset, "CH1")
        _create_calibration(client, auth_headers, asset["id"], sensor_id, "2022-01-01", 0.0)
        _create_calibration(client, auth_headers, asset["id"], sensor_id, "2023-01-01", 1.0)
        r = client.get(f"/api/v1/assets/{asset['id']}/health?sensor_id={sensor_id}", headers=auth_headers)
        body = r.json()
        assert body["calibration_count"] == 2
        assert body["overview"] is not None
        assert body["drift_evolution"] is not None
        assert body["stability"] is not None
        assert body["detailed_metrics"] is not None
        assert body["radar"] is not None
        assert body["prediction"]["available"] is False

    def test_three_calibrations_enable_prediction_without_reliable_confidence(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        sensor_id = _sensor_id(asset, "CH1")
        for i, d in enumerate(["2021-01-01", "2022-01-01", "2023-01-01"]):
            _create_calibration(client, auth_headers, asset["id"], sensor_id, d, float(i))
        r = client.get(f"/api/v1/assets/{asset['id']}/health?sensor_id={sensor_id}", headers=auth_headers)
        body = r.json()
        assert body["calibration_count"] == 3
        assert body["prediction"]["available"] is True
        assert body["prediction"]["confidence_reliable"] is False

    def test_five_calibrations_enable_reliable_confidence(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        sensor_id = _sensor_id(asset, "CH1")
        dates = ["2019-01-01", "2020-01-01", "2021-01-01", "2022-01-01", "2023-01-01"]
        for i, d in enumerate(dates):
            _create_calibration(client, auth_headers, asset["id"], sensor_id, d, float(i))
        r = client.get(f"/api/v1/assets/{asset['id']}/health?sensor_id={sensor_id}", headers=auth_headers)
        body = r.json()
        assert body["calibration_count"] == 5
        assert body["prediction"]["available"] is True
        assert body["prediction"]["confidence_reliable"] is True


class TestProfileAggregateScore:
    """GET /assets/{id}/profile exposes calibration_health_score — the
    worst-channel aggregate of the per-channel Health Score, used by the
    asset page's top-of-page stat card instead of the static admin field."""

    def test_none_when_no_channel_has_two_calibrations(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        r = client.get(f"/api/v1/assets/{asset['id']}/profile", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["calibration_health_score"] is None

    def test_reflects_worst_channel_once_available(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        ch1 = _sensor_id(asset, "CH1")
        ch2 = _sensor_id(asset, "CH2")
        # CH1: stable (no drift) -> high score. CH2: large drift -> low score.
        _create_calibration(client, auth_headers, asset["id"], ch1, "2022-01-01", 0.0)
        _create_calibration(client, auth_headers, asset["id"], ch1, "2023-01-01", 0.0)
        _create_calibration(client, auth_headers, asset["id"], ch2, "2022-01-01", 0.0)
        _create_calibration(client, auth_headers, asset["id"], ch2, "2023-01-01", 50.0)

        profile = client.get(f"/api/v1/assets/{asset['id']}/profile", headers=auth_headers).json()
        ch1_score = client.get(f"/api/v1/assets/{asset['id']}/health?sensor_id={ch1}", headers=auth_headers).json()["overview"]["health_score"]
        ch2_score = client.get(f"/api/v1/assets/{asset['id']}/health?sensor_id={ch2}", headers=auth_headers).json()["overview"]["health_score"]

        assert ch2_score < ch1_score
        assert profile["calibration_health_score"] == pytest.approx(ch2_score)


class TestChannelFiltering:
    def test_sensor_id_filters_to_that_channel(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        ch1 = _sensor_id(asset, "CH1")
        ch2 = _sensor_id(asset, "CH2")
        _create_calibration(client, auth_headers, asset["id"], ch1, "2022-01-01", 0.0)
        _create_calibration(client, auth_headers, asset["id"], ch1, "2023-01-01", 1.0)
        _create_calibration(client, auth_headers, asset["id"], ch2, "2023-01-01", 1.0)

        r1 = client.get(f"/api/v1/assets/{asset['id']}/health?sensor_id={ch1}", headers=auth_headers)
        r2 = client.get(f"/api/v1/assets/{asset['id']}/health?sensor_id={ch2}", headers=auth_headers)
        assert r1.json()["calibration_count"] == 2
        assert r2.json()["calibration_count"] == 1


class TestNotFoundAndAuth:
    def test_nonexistent_asset_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get(f"/api/v1/assets/{uuid.uuid4()}/health", headers=auth_headers)
        assert r.status_code == 404

    def test_requires_authentication(self, client: TestClient, asset: dict) -> None:
        # FastAPI's HTTPBearer dependency returns 403 for a missing header
        # (401 is reserved for a present-but-invalid token) — same convention
        # already used by the other protected endpoints in this codebase.
        r = client.get(f"/api/v1/assets/{asset['id']}/health")
        assert r.status_code == 403


class TestCurveComparison:
    def test_returns_evaluated_curves(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        sensor_id = _sensor_id(asset, "CH1")
        c1 = _create_calibration(client, auth_headers, asset["id"], sensor_id, "2022-01-01", 0.0)
        c2 = _create_calibration(client, auth_headers, asset["id"], sensor_id, "2023-01-01", 1.0)

        r = client.get(
            f"/api/v1/assets/{asset['id']}/health/curve-comparison"
            f"?reference_calibration_id={c1['id']}&current_calibration_id={c2['id']}",
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["x"]) == 200
        assert len(body["y_reference"]) == 200
        assert body["summary"]["offset"] == pytest.approx(1.0, abs=1e-6)

    def test_unknown_calibration_id_returns_404(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        sensor_id = _sensor_id(asset, "CH1")
        c1 = _create_calibration(client, auth_headers, asset["id"], sensor_id, "2022-01-01", 0.0)
        r = client.get(
            f"/api/v1/assets/{asset['id']}/health/curve-comparison"
            f"?reference_calibration_id={c1['id']}&current_calibration_id={uuid.uuid4()}",
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_non_overlapping_ranges_return_422(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        sensor_id = _sensor_id(asset, "CH1")
        r1 = client.post(
            "/api/v1/calibrations",
            json={
                "asset_id": asset["id"], "calibration_date": "2022-01-01", "due_date": "2030-01-01",
                "performed_by_name": "Tech", "sensor_id": sensor_id,
                "poly_order": 1, "poly_coefficients": [1.0, 0.0],
                "valid_range_min": 0.0, "valid_range_max": 10.0,
            },
            headers=auth_headers,
        )
        r2 = client.post(
            "/api/v1/calibrations",
            json={
                "asset_id": asset["id"], "calibration_date": "2023-01-01", "due_date": "2030-01-01",
                "performed_by_name": "Tech", "sensor_id": sensor_id,
                "poly_order": 1, "poly_coefficients": [1.0, 0.0],
                "valid_range_min": 20.0, "valid_range_max": 30.0,
            },
            headers=auth_headers,
        )
        assert r1.status_code == 201 and r2.status_code == 201

        r = client.get(
            f"/api/v1/assets/{asset['id']}/health/curve-comparison"
            f"?reference_calibration_id={r1.json()['id']}&current_calibration_id={r2.json()['id']}",
            headers=auth_headers,
        )
        assert r.status_code == 422
