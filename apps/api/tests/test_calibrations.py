"""
Tests for calibration records.

Covers: create calibration, list calibrations for asset, calibration date
ordering (most recent first), analyze endpoint (ephemeral), atomic create
with embedded polynomial/regression fields + points, GET /{id}/points,
authentication guards, version auto-increment.
"""
import uuid

import pytest
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
        "notes": "Annual calibration",
    }
    r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Calibration CRUD
# ---------------------------------------------------------------------------

class TestCreateCalibration:
    def test_create_calibration(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        payload = {
            "asset_id": asset["id"],
            "calibration_date": "2024-06-01",
            "due_date": "2025-06-01",
            "performed_by_name": "Technician B",
        }
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201
        body = r.json()
        assert body["asset_id"] == asset["id"]
        assert body["performed_by_name"] == "Technician B"
        assert body["calibration_type"] == "external"

    def test_create_calibration_with_notes(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        payload = {
            "asset_id": asset["id"],
            "calibration_date": "2024-07-01",
            "due_date": "2025-07-01",
            "performed_by_name": "Technician C",
            "notes": "Out of tolerance",
        }
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201
        assert r.json()["notes"] == "Out of tolerance"

    def test_calibration_for_nonexistent_asset_fails(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        payload = {
            "asset_id": str(uuid.uuid4()),
            "calibration_date": "2024-01-01",
            "due_date": "2025-01-01",
            "performed_by_name": "Ghost",
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
# POST /calibrations/analyze  (ephemeral — nothing stored)
# ---------------------------------------------------------------------------

_ANALYZE_PAYLOAD = {
    "points": [
        {"reference": 0.0,  "measured": 0.02},
        {"reference": 25.0, "measured": 25.13},
        {"reference": 50.0, "measured": 50.08},
        {"reference": 75.0, "measured": 75.11},
        {"reference": 100.0,"measured": 100.05},
    ],
    "reference_unit": "°C",
    "measured_unit": "°C",
    "poly_degree": None,
    "distribution_type": "normal",
    "confidence_level": 95.0,
    "coverage_factor": 2.0,
    "channel_accuracy_value": 0.5,
    "channel_accuracy_type": "absolute",
}


class TestAnalyzeEndpoint:
    def test_returns_200_with_valid_data(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post("/api/v1/calibrations/analyze", json=_ANALYZE_PAYLOAD, headers=auth_headers)
        assert r.status_code == 200

    def test_response_contains_required_fields(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post("/api/v1/calibrations/analyze", json=_ANALYZE_PAYLOAD, headers=auth_headers)
        body = r.json()
        for field in ("poly_degree", "coefficients", "r_squared", "rmse", "max_error",
                      "expanded_uncertainty", "passed", "points"):
            assert field in body, f"Missing field: {field}"

    def test_points_array_length_matches_input(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post("/api/v1/calibrations/analyze", json=_ANALYZE_PAYLOAD, headers=auth_headers)
        assert len(r.json()["points"]) == len(_ANALYZE_PAYLOAD["points"])

    def test_r_squared_is_between_0_and_1(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post("/api/v1/calibrations/analyze", json=_ANALYZE_PAYLOAD, headers=auth_headers)
        assert 0.0 <= r.json()["r_squared"] <= 1.0

    def test_passed_field_is_bool(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post("/api/v1/calibrations/analyze", json=_ANALYZE_PAYLOAD, headers=auth_headers)
        assert isinstance(r.json()["passed"], bool)

    def test_explicit_degree_respected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        payload = {**_ANALYZE_PAYLOAD, "poly_degree": 2}
        r = client.post("/api/v1/calibrations/analyze", json=payload, headers=auth_headers)
        assert r.json()["poly_degree"] == 2

    def test_fails_with_single_point(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        payload = {**_ANALYZE_PAYLOAD, "points": [{"reference": 0.0, "measured": 0.0}]}
        r = client.post("/api/v1/calibrations/analyze", json=payload, headers=auth_headers)
        assert r.status_code == 422

    def test_requires_authentication(self, client: TestClient) -> None:
        r = client.post("/api/v1/calibrations/analyze", json=_ANALYZE_PAYLOAD)
        assert r.status_code == 403  # HTTPBearer returns 403 when missing

    def test_analyze_does_not_persist_anything(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        # Call analyze, then verify no new calibration was created
        r_before = client.get(f"/api/v1/assets/{asset['id']}/calibrations", headers=auth_headers)
        count_before = len(r_before.json())
        client.post("/api/v1/calibrations/analyze", json=_ANALYZE_PAYLOAD, headers=auth_headers)
        r_after = client.get(f"/api/v1/assets/{asset['id']}/calibrations", headers=auth_headers)
        assert len(r_after.json()) == count_before


# ---------------------------------------------------------------------------
# POST /calibrations — atomic create with embedded polynomial fit + points
# ---------------------------------------------------------------------------

def _atomic_payload(asset_id: str, sensor_id: str | None = None) -> dict:
    return {
        "asset_id": asset_id,
        "calibration_date": "2025-01-15",
        "due_date": "2026-01-15",
        "performed_by_name": "Lab Auto",
        "calibration_type": "external",
        "external_lab_name": "ACME Calibration",
        "external_lab_certificate_number": "CERT-2025-001",
        "calibration_interval": 12,
        "calibration_version": 1,
        **({"sensor_id": sensor_id} if sensor_id else {}),
        "temperature": 23.0,
        "humidity": 48.0,
        "pressure": 101325.0,
        "poly_order": 1,
        "poly_coefficients": [1.0015, 0.023],
        "range_min": 0.0,
        "range_max": 100.0,
        "r_squared": 0.99998,
        "rmse": 0.012,
        "max_error": 0.025,
        "expanded_uncertainty": 0.05,
        "points": [
            {
                "point_index": 0,
                "reference_value": 0.0,
                "measured_value": 0.02,
                "calculated_value": 0.02,
                "residual_abs": -0.01,
                "residual_pct": -0.04,
                "reference_unit": "°C",
                "measured_unit": "°C",
            },
            {
                "point_index": 1,
                "reference_value": 50.0,
                "measured_value": 50.04,
                "calculated_value": 50.03,
                "residual_abs": -0.01,
                "residual_pct": -0.02,
                "reference_unit": "°C",
                "measured_unit": "°C",
            },
        ],
    }


class TestAtomicCalibrationCreate:
    def test_creates_calibration_with_regression_fields_and_points(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        r = client.post(
            "/api/v1/calibrations",
            json=_atomic_payload(asset["id"]),
            headers=auth_headers,
        )
        assert r.status_code == 201
        body = r.json()
        assert body["asset_id"] == asset["id"]
        assert body["external_lab_certificate_number"] == "CERT-2025-001"
        assert body["calibration_type"] == "external"

    def test_environmental_values_stored(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        r = client.post(
            "/api/v1/calibrations",
            json=_atomic_payload(asset["id"]),
            headers=auth_headers,
        )
        body = r.json()
        assert abs(body["temperature"] - 23.0) < 0.01
        assert abs(body["pressure"] - 101325.0) < 1.0
        assert abs(body["humidity"] - 48.0) < 0.01

    def test_polynomial_and_regression_fields_retrievable(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        cal = client.post(
            "/api/v1/calibrations",
            json=_atomic_payload(asset["id"]),
            headers=auth_headers,
        ).json()
        assert cal["poly_order"] == 1
        assert cal["poly_coefficients"] == [1.0015, 0.023]
        assert abs(cal["r_squared"] - 0.99998) < 1e-4

    def test_points_created_and_retrievable(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        cal = client.post(
            "/api/v1/calibrations",
            json=_atomic_payload(asset["id"]),
            headers=auth_headers,
        ).json()
        r = client.get(f"/api/v1/calibrations/{cal['id']}/points", headers=auth_headers)
        assert r.status_code == 200
        pts = r.json()
        assert len(pts) == 2
        assert pts[0]["point_index"] == 0
        assert pts[1]["point_index"] == 1

    def test_points_ordered_by_index(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        cal = client.post(
            "/api/v1/calibrations",
            json=_atomic_payload(asset["id"]),
            headers=auth_headers,
        ).json()
        pts = client.get(f"/api/v1/calibrations/{cal['id']}/points", headers=auth_headers).json()
        indices = [p["point_index"] for p in pts]
        assert indices == sorted(indices)

    def test_create_without_regression_fields_succeeds(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        payload = {
            "asset_id": asset["id"],
            "calibration_date": "2025-02-01",
            "due_date": "2026-02-01",
            "performed_by_name": "Minimal Lab",
            "calibration_type": "external",
            "calibration_version": 1,
        }
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201

    def test_version_auto_increments_for_same_asset(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        # calibration_version=1 provided for first; the second call should increment
        payload1 = _atomic_payload(asset["id"])
        payload2 = _atomic_payload(asset["id"])
        cal1 = client.post("/api/v1/calibrations", json=payload1, headers=auth_headers).json()
        cal2 = client.post("/api/v1/calibrations", json=payload2, headers=auth_headers).json()
        assert cal2["calibration_version"] > cal1["calibration_version"]

    def test_nonexistent_asset_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        payload = _atomic_payload(str(uuid.uuid4()))
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 404

    def test_requires_authentication(self, client: TestClient, asset: dict) -> None:
        r = client.post("/api/v1/calibrations", json=_atomic_payload(asset["id"]))
        assert r.status_code == 403  # HTTPBearer returns 403 when missing


# ---------------------------------------------------------------------------
# GET /calibrations/{id}/points
# ---------------------------------------------------------------------------

class TestGetCalibrationPoints:
    def test_returns_points_for_valid_calibration(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        cal = client.post(
            "/api/v1/calibrations",
            json=_atomic_payload(asset["id"]),
            headers=auth_headers,
        ).json()
        r = client.get(f"/api/v1/calibrations/{cal['id']}/points", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_returns_empty_list_when_no_points(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        # The base `calibration` fixture creates a record with no points
        r = client.get(f"/api/v1/calibrations/{calibration['id']}/points", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_point_fields_present(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        cal = client.post(
            "/api/v1/calibrations",
            json=_atomic_payload(asset["id"]),
            headers=auth_headers,
        ).json()
        pts = client.get(f"/api/v1/calibrations/{cal['id']}/points", headers=auth_headers).json()
        pt = pts[0]
        for field in ("id", "calibration_id", "point_index", "reference_value",
                      "measured_value", "reference_unit", "measured_unit", "created_at"):
            assert field in pt, f"Missing field: {field}"

    def test_returns_404_for_unknown_calibration(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"/api/v1/calibrations/{uuid.uuid4()}/points",
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_requires_authentication(
        self, client: TestClient, calibration: dict
    ) -> None:
        r = client.get(f"/api/v1/calibrations/{calibration['id']}/points")
        assert r.status_code == 403  # HTTPBearer returns 403 when missing
