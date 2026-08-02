"""
Tests for calibration records.

Covers: create calibration, list calibrations for asset, calibration date
ordering (most recent first), analyze endpoint (ephemeral), atomic create
with embedded polynomial/regression fields + points, GET /{id}/points,
authentication guards, version auto-increment/renumbering, the void/restore
soft-delete flow, the approve/reject approval workflow (checker assignment,
checker-or-admin authorization, status transitions, notifications), and
GET /assets/{id}/calibration-users.
"""
import uuid

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.user import User, UserRole
from tests.conftest import make_asset_id


def _viewer_headers(db: Session) -> dict:
    viewer = User(
        id=uuid.uuid4(),
        email=f"viewer_{uuid.uuid4().hex[:8]}@opengauge.test",
        name="Viewer",
        hashed_password=hash_password("Testpass123!"),
        role=UserRole.viewer,
        is_active=True,
    )
    db.add(viewer)
    db.flush()
    return {"Authorization": f"Bearer {create_access_token({'sub': str(viewer.id)})}"}


def _make_user(db: Session, role: UserRole = UserRole.technician, name: str = "Test User") -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"user_{uuid.uuid4().hex[:8]}@opengauge.test",
        name=name,
        hashed_password=hash_password("Testpass123!"),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def _headers_for(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


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
        assert body["calibration_type"] == "external_accredited_lab"

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
        "calibration_type": "external_accredited_lab",
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


def _atomic_payload_with_frequency_response(asset_id: str) -> dict:
    payload = _atomic_payload(asset_id)
    payload.update({
        "has_frequency_response": True,
        "frequency_response_frequency_unit": "Hz",
        "frequency_response_amplitude_type": "dB",
        "frequency_response_amplitude_unit": None,
        "frequency_response_phase_unit": "°",
        "frequency_response_points": [
            {"sweep_index": 0, "frequency_value": 10.0, "amplitude_value": 0.0, "phase_value": -2.0},
            {"sweep_index": 1, "frequency_value": 100.0, "amplitude_value": -1.0, "phase_value": -15.0},
            {"sweep_index": 2, "frequency_value": 1000.0, "amplitude_value": -3.0, "phase_value": -45.0},
        ],
    })
    return payload


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
        assert body["calibration_type"] == "external_accredited_lab"

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
            "calibration_type": "external_accredited_lab",
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

    def test_creates_calibration_with_frequency_response_points(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        r = client.post(
            "/api/v1/calibrations",
            json=_atomic_payload_with_frequency_response(asset["id"]),
            headers=auth_headers,
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["has_frequency_response"] is True
        assert body["frequency_response_frequency_unit"] == "Hz"
        assert body["frequency_response_amplitude_type"] == "dB"
        assert body["frequency_response_amplitude_unit"] is None
        assert body["frequency_response_phase_unit"] == "°"

    def test_frequency_response_defaults_false_when_omitted(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        r = client.post(
            "/api/v1/calibrations",
            json=_atomic_payload(asset["id"]),
            headers=auth_headers,
        )
        body = r.json()
        assert body["has_frequency_response"] is False
        assert body["frequency_response_frequency_unit"] is None
        assert body["frequency_response_amplitude_type"] is None
        assert body["frequency_response_amplitude_unit"] is None
        assert body["frequency_response_phase_unit"] is None

    def test_frequency_response_points_nullable_amplitude_or_phase(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        payload = _atomic_payload_with_frequency_response(asset["id"])
        payload["frequency_response_points"] = [
            {"sweep_index": 0, "frequency_value": 10.0, "amplitude_value": 0.0},
            {"sweep_index": 1, "frequency_value": 100.0, "amplitude_value": -1.0},
        ]
        cal = client.post("/api/v1/calibrations", json=payload, headers=auth_headers).json()
        pts = client.get(f"/api/v1/calibrations/{cal['id']}/frequency-points", headers=auth_headers).json()
        assert len(pts) == 2
        assert all(p["phase_value"] is None for p in pts)
        assert all(p["amplitude_value"] is not None for p in pts)


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


# ---------------------------------------------------------------------------
# GET /calibrations/{id}/frequency-points
# ---------------------------------------------------------------------------

class TestGetCalibrationFrequencyPoints:
    def test_returns_points_for_valid_calibration(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        cal = client.post(
            "/api/v1/calibrations",
            json=_atomic_payload_with_frequency_response(asset["id"]),
            headers=auth_headers,
        ).json()
        r = client.get(f"/api/v1/calibrations/{cal['id']}/frequency-points", headers=auth_headers)
        assert r.status_code == 200
        pts = r.json()
        assert len(pts) == 3
        assert pts[0]["frequency_value"] == 10.0
        assert pts[0]["amplitude_value"] == 0.0
        assert pts[0]["phase_value"] == -2.0

    def test_returns_empty_list_when_no_frequency_response(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        r = client.get(f"/api/v1/calibrations/{calibration['id']}/frequency-points", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_points_ordered_by_sweep_index(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        cal = client.post(
            "/api/v1/calibrations",
            json=_atomic_payload_with_frequency_response(asset["id"]),
            headers=auth_headers,
        ).json()
        pts = client.get(f"/api/v1/calibrations/{cal['id']}/frequency-points", headers=auth_headers).json()
        indices = [p["sweep_index"] for p in pts]
        assert indices == sorted(indices)

    def test_returns_404_for_unknown_calibration(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"/api/v1/calibrations/{uuid.uuid4()}/frequency-points",
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_requires_authentication(
        self, client: TestClient, calibration: dict
    ) -> None:
        r = client.get(f"/api/v1/calibrations/{calibration['id']}/frequency-points")
        assert r.status_code == 403  # HTTPBearer returns 403 when missing


# ---------------------------------------------------------------------------
# calibration_version renumbering (chronological, not insertion order)
# ---------------------------------------------------------------------------

class TestVersionNumbering:
    """calibration_version is an always-increasing, unique insertion-order
    counter per (asset[, sensor]) — never renumbered, never tied to
    calibration_date (backfilling an older date must not shift anything)."""

    def test_versions_increase_in_creation_order_starting_from_one(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        first = client.post(
            "/api/v1/calibrations",
            json={
                "asset_id": asset["id"],
                "calibration_date": "2024-06-01",
                "due_date": "2025-06-01",
                "performed_by_name": "Tech",
            },
            headers=auth_headers,
        ).json()
        assert first["calibration_version"] == 1

        second = client.post(
            "/api/v1/calibrations",
            json={
                "asset_id": asset["id"],
                "calibration_date": "2025-06-01",
                "due_date": "2026-06-01",
                "performed_by_name": "Tech",
            },
            headers=auth_headers,
        ).json()
        assert second["calibration_version"] == 2

    def test_backfilling_an_earlier_date_does_not_renumber_existing_records(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        first = client.post(
            "/api/v1/calibrations",
            json={
                "asset_id": asset["id"],
                "calibration_date": "2024-06-01",
                "due_date": "2025-06-01",
                "performed_by_name": "Tech",
            },
            headers=auth_headers,
        ).json()
        assert first["calibration_version"] == 1

        # Backfill an earlier calibration_date after the fact — this must land
        # as the *next* version number (3rd overall counting the fixture's own
        # calibration), not renumber anything, and must not collide with v1.
        backfilled = client.post(
            "/api/v1/calibrations",
            json={
                "asset_id": asset["id"],
                "calibration_date": "2023-01-01",
                "due_date": "2024-01-01",
                "performed_by_name": "Tech",
            },
            headers=auth_headers,
        ).json()
        assert backfilled["calibration_version"] == 2

        # The earlier record's version must be unchanged.
        refetched_first = client.get(
            f"/api/v1/calibrations/{first['id']}", headers=auth_headers
        ).json()
        assert refetched_first["calibration_version"] == 1

    def test_versions_are_scoped_per_asset(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        other_payload = {
            "asset_id": make_asset_id(),
            "asset_type": "sensor",
            "name": "Other Asset",
            "manufacturer": "Fluke",
            "model": "724",
        }
        other_asset = client.post("/api/v1/assets", json=other_payload, headers=auth_headers).json()

        client.post(
            "/api/v1/calibrations",
            json={
                "asset_id": asset["id"],
                "calibration_date": "2025-01-01",
                "due_date": "2026-01-01",
                "performed_by_name": "Tech",
            },
            headers=auth_headers,
        )
        # A separate asset's numbering starts fresh at 1, independent of the first asset.
        first_on_other_asset = client.post(
            "/api/v1/calibrations",
            json={
                "asset_id": other_asset["id"],
                "calibration_date": "2020-01-01",
                "due_date": "2021-01-01",
                "performed_by_name": "Tech",
            },
            headers=auth_headers,
        ).json()
        assert first_on_other_asset["calibration_version"] == 1

    def test_voided_versions_are_never_reused(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        first = client.post(
            "/api/v1/calibrations",
            json={
                "asset_id": asset["id"],
                "calibration_date": "2024-06-01",
                "due_date": "2025-06-01",
                "performed_by_name": "Tech",
            },
            headers=auth_headers,
        ).json()
        assert first["calibration_version"] == 1

        client.delete(f"/api/v1/calibrations/{first['id']}", headers=auth_headers)

        second = client.post(
            "/api/v1/calibrations",
            json={
                "asset_id": asset["id"],
                "calibration_date": "2025-06-01",
                "due_date": "2026-06-01",
                "performed_by_name": "Tech",
            },
            headers=auth_headers,
        ).json()
        assert second["calibration_version"] == 2


# ---------------------------------------------------------------------------
# DELETE /calibrations/{id} — soft void (not a hard delete)
# ---------------------------------------------------------------------------

class TestVoidCalibration:
    def test_void_hides_calibration_from_default_list(
        self, client: TestClient, auth_headers: dict, asset: dict, calibration: dict
    ) -> None:
        r = client.delete(f"/api/v1/calibrations/{calibration['id']}", headers=auth_headers)
        assert r.status_code == 204

        listed = client.get(
            f"/api/v1/assets/{asset['id']}/calibrations", headers=auth_headers
        ).json()
        assert all(c["id"] != calibration["id"] for c in listed)

    def test_voided_calibration_still_visible_with_include_voided(
        self, client: TestClient, auth_headers: dict, asset: dict, calibration: dict
    ) -> None:
        client.delete(f"/api/v1/calibrations/{calibration['id']}", headers=auth_headers)
        listed = client.get(
            f"/api/v1/assets/{asset['id']}/calibrations?include_voided=true",
            headers=auth_headers,
        ).json()
        voided = next(c for c in listed if c["id"] == calibration["id"])
        assert voided["is_active"] is False
        assert voided["voided_at"] is not None
        assert voided["voided_by"] is not None

    def test_void_reason_is_recorded(
        self, client: TestClient, auth_headers: dict, asset: dict, calibration: dict
    ) -> None:
        r = client.delete(
            f"/api/v1/calibrations/{calibration['id']}",
            params={"reason": "entered against the wrong sensor"},
            headers=auth_headers,
        )
        assert r.status_code == 204
        listed = client.get(
            f"/api/v1/assets/{asset['id']}/calibrations?include_voided=true",
            headers=auth_headers,
        ).json()
        voided = next(c for c in listed if c["id"] == calibration["id"])
        assert voided["void_reason"] == "entered against the wrong sensor"

    def test_record_and_certificate_are_preserved_not_deleted(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        client.delete(f"/api/v1/calibrations/{calibration['id']}", headers=auth_headers)
        # The row itself must still exist and be fetchable by id — this is a
        # soft void, not a hard delete.
        r = client.get(f"/api/v1/calibrations/{calibration['id']}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["is_active"] is False

    def test_voiding_twice_is_rejected(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        client.delete(f"/api/v1/calibrations/{calibration['id']}", headers=auth_headers)
        r = client.delete(f"/api/v1/calibrations/{calibration['id']}", headers=auth_headers)
        assert r.status_code == 400

    def test_unknown_calibration_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.delete(f"/api/v1/calibrations/{uuid.uuid4()}", headers=auth_headers)
        assert r.status_code == 404

    def test_non_admin_is_forbidden(
        self, client: TestClient, db: Session, calibration: dict
    ) -> None:
        headers = _viewer_headers(db)
        r = client.delete(f"/api/v1/calibrations/{calibration['id']}", headers=headers)
        assert r.status_code == 403

    def test_requires_authentication(
        self, client: TestClient, calibration: dict
    ) -> None:
        r = client.delete(f"/api/v1/calibrations/{calibration['id']}")
        assert r.status_code == 403  # HTTPBearer returns 403 when missing


# ---------------------------------------------------------------------------
# POST /calibrations/{id}/restore
# ---------------------------------------------------------------------------

class TestRestoreCalibration:
    def test_restore_reinstates_a_voided_calibration(
        self, client: TestClient, auth_headers: dict, asset: dict, calibration: dict
    ) -> None:
        client.delete(f"/api/v1/calibrations/{calibration['id']}", headers=auth_headers)

        r = client.post(f"/api/v1/calibrations/{calibration['id']}/restore", headers=auth_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["is_active"] is True
        assert body["voided_at"] is None
        assert body["void_reason"] is None

        listed = client.get(
            f"/api/v1/assets/{asset['id']}/calibrations", headers=auth_headers
        ).json()
        assert any(c["id"] == calibration["id"] for c in listed)

    def test_restoring_an_active_calibration_is_rejected(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        r = client.post(f"/api/v1/calibrations/{calibration['id']}/restore", headers=auth_headers)
        assert r.status_code == 400

    def test_unknown_calibration_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(f"/api/v1/calibrations/{uuid.uuid4()}/restore", headers=auth_headers)
        assert r.status_code == 404

    def test_non_admin_is_forbidden(
        self, client: TestClient, auth_headers: dict, db: Session, calibration: dict
    ) -> None:
        client.delete(f"/api/v1/calibrations/{calibration['id']}", headers=auth_headers)
        headers = _viewer_headers(db)
        r = client.post(f"/api/v1/calibrations/{calibration['id']}/restore", headers=headers)
        assert r.status_code == 403

    def test_requires_authentication(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        client.delete(f"/api/v1/calibrations/{calibration['id']}", headers=auth_headers)
        r = client.post(f"/api/v1/calibrations/{calibration['id']}/restore")
        assert r.status_code == 403  # HTTPBearer returns 403 when missing


# ---------------------------------------------------------------------------
# GET /calibrations/{id}/certificate-templates and /certificate/download
# ---------------------------------------------------------------------------

def _superadmin_headers(db: Session) -> dict:
    user = User(
        id=uuid.uuid4(),
        email=f"super_{uuid.uuid4().hex[:8]}@opengauge.test",
        name="Super Admin",
        hashed_password=hash_password("Testpass123!"),
        role=UserRole.superadmin,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def _upload_global_template(client: TestClient, db: Session, *, name: str = "Global Test Template") -> dict:
    from pathlib import Path

    source = (
        Path(__file__).resolve().parent.parent / "app" / "templates" / "certificates" / "default.tex.jinja"
    ).read_text(encoding="utf-8")
    headers = _superadmin_headers(db)
    r = client.post(
        "/api/v1/certificate-templates",
        files={"file": ("template.tex", source.encode("utf-8"), "text/x-tex")},
        data={"name": name, "is_default": "false"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


class TestCertificateTemplatesForCalibration:
    def test_lists_global_templates(
        self, client: TestClient, auth_headers: dict, db: Session, calibration: dict
    ) -> None:
        template = _upload_global_template(client, db)
        r = client.get(f"/api/v1/calibrations/{calibration['id']}/certificate-templates", headers=auth_headers)
        assert r.status_code == 200, r.text
        ids = [t["id"] for t in r.json()]
        assert template["id"] in ids

    def test_empty_when_no_templates_uploaded(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        r = client.get(f"/api/v1/calibrations/{calibration['id']}/certificate-templates", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_unknown_calibration_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get(f"/api/v1/calibrations/{uuid.uuid4()}/certificate-templates", headers=auth_headers)
        assert r.status_code == 404

    def test_requires_authentication(self, client: TestClient, calibration: dict) -> None:
        r = client.get(f"/api/v1/calibrations/{calibration['id']}/certificate-templates")
        assert r.status_code == 403


class TestDownloadCertificateWithTemplate:
    def test_rejects_incomplete_calibration(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        # `calibration` fixture has no poly_coefficients — no fit/results yet.
        r = client.get(f"/api/v1/calibrations/{calibration['id']}/certificate/download", headers=auth_headers)
        assert r.status_code == 400

    def test_downloads_pdf_with_default_template(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        cal = client.post("/api/v1/calibrations", json=_atomic_payload(asset["id"]), headers=auth_headers).json()
        r = client.get(f"/api/v1/calibrations/{cal['id']}/certificate/download", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF-")

    def test_downloads_pdf_with_explicit_template(
        self, client: TestClient, auth_headers: dict, db: Session, asset: dict
    ) -> None:
        template = _upload_global_template(client, db)
        cal = client.post("/api/v1/calibrations", json=_atomic_payload(asset["id"]), headers=auth_headers).json()
        r = client.get(
            f"/api/v1/calibrations/{cal['id']}/certificate/download",
            params={"template_id": template["id"]},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        assert r.content.startswith(b"%PDF-")

    def test_does_not_overwrite_the_cached_certificate(
        self, client: TestClient, auth_headers: dict, db: Session, asset: dict
    ) -> None:
        """A one-off template-specific download is an ad-hoc render — it must
        not touch calibration_file_id, the canonical stored certificate."""
        template = _upload_global_template(client, db, name="Alt Template")
        cal = client.post("/api/v1/calibrations", json=_atomic_payload(asset["id"]), headers=auth_headers).json()
        before = client.get(f"/api/v1/calibrations/{cal['id']}", headers=auth_headers).json()
        client.get(
            f"/api/v1/calibrations/{cal['id']}/certificate/download",
            params={"template_id": template["id"]},
            headers=auth_headers,
        )
        after = client.get(f"/api/v1/calibrations/{cal['id']}", headers=auth_headers).json()
        assert before["calibration_file_id"] == after["calibration_file_id"]

    def test_unknown_template_id_returns_404(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        cal = client.post("/api/v1/calibrations", json=_atomic_payload(asset["id"]), headers=auth_headers).json()
        r = client.get(
            f"/api/v1/calibrations/{cal['id']}/certificate/download",
            params={"template_id": str(uuid.uuid4())},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_unknown_calibration_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get(f"/api/v1/calibrations/{uuid.uuid4()}/certificate/download", headers=auth_headers)
        assert r.status_code == 404

    def test_requires_authentication(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        cal = client.post("/api/v1/calibrations", json=_atomic_payload(asset["id"]), headers=auth_headers).json()
        r = client.get(f"/api/v1/calibrations/{cal['id']}/certificate/download")
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Calibration approval workflow: POST /calibrations/{id}/approve, /reject
# ---------------------------------------------------------------------------

def _payload_with_checker(asset_id: str, checker: User) -> dict:
    return {
        "asset_id": asset_id,
        "calibration_date": "2024-03-15",
        "due_date": "2025-03-15",
        "performed_by_name": "Lab Tech A",
        "checked_by_user_id": str(checker.id),
        "checked_by_name": checker.name,
        "notes": "Annual calibration",
    }


class TestCalibrationApproval:
    def test_naming_a_checker_starts_pending_approval(
        self, client: TestClient, auth_headers: dict, db: Session, asset: dict
    ) -> None:
        checker = _make_user(db, UserRole.technician, "Checker")
        cal = client.post(
            "/api/v1/calibrations", json=_payload_with_checker(asset["id"], checker), headers=auth_headers
        ).json()
        assert cal["status"] == "pending_approval"
        assert cal["is_active"] is False
        assert cal["checked_by_user_id"] == str(checker.id)

    def test_no_checker_is_valid_immediately(
        self, client: TestClient, auth_headers: dict, asset: dict, calibration: dict
    ) -> None:
        assert calibration["status"] == "valid"
        assert calibration["is_active"] is True
        assert calibration["checked_by_user_id"] is None

    def test_checker_can_approve(self, client: TestClient, auth_headers: dict, db: Session, asset: dict) -> None:
        checker = _make_user(db, UserRole.technician, "Checker")
        cal = client.post(
            "/api/v1/calibrations", json=_payload_with_checker(asset["id"], checker), headers=auth_headers
        ).json()
        r = client.post(f"/api/v1/calibrations/{cal['id']}/approve", headers=_headers_for(checker))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "valid"
        assert body["is_active"] is True
        assert body["decided_by"] == str(checker.id)
        assert body["decided_at"] is not None

    def test_checker_can_reject_with_reason(
        self, client: TestClient, auth_headers: dict, db: Session, asset: dict
    ) -> None:
        checker = _make_user(db, UserRole.technician, "Checker")
        cal = client.post(
            "/api/v1/calibrations", json=_payload_with_checker(asset["id"], checker), headers=auth_headers
        ).json()
        r = client.post(
            f"/api/v1/calibrations/{cal['id']}/reject",
            params={"reason": "reference standard uncertainty not documented"},
            headers=_headers_for(checker),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "rejected"
        assert body["is_active"] is False
        assert body["decision_reason"] == "reference standard uncertainty not documented"

    def test_checker_can_reject_without_reason(
        self, client: TestClient, auth_headers: dict, db: Session, asset: dict
    ) -> None:
        checker = _make_user(db, UserRole.technician, "Checker")
        cal = client.post(
            "/api/v1/calibrations", json=_payload_with_checker(asset["id"], checker), headers=auth_headers
        ).json()
        r = client.post(f"/api/v1/calibrations/{cal['id']}/reject", headers=_headers_for(checker))
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "rejected"

    def test_non_checker_non_admin_cannot_approve(
        self, client: TestClient, auth_headers: dict, db: Session, asset: dict
    ) -> None:
        checker = _make_user(db, UserRole.technician, "Checker")
        outsider = _make_user(db, UserRole.technician, "Outsider")
        cal = client.post(
            "/api/v1/calibrations", json=_payload_with_checker(asset["id"], checker), headers=auth_headers
        ).json()
        r = client.post(f"/api/v1/calibrations/{cal['id']}/approve", headers=_headers_for(outsider))
        assert r.status_code == 403

    def test_non_checker_non_admin_cannot_reject(
        self, client: TestClient, auth_headers: dict, db: Session, asset: dict
    ) -> None:
        checker = _make_user(db, UserRole.technician, "Checker")
        outsider = _make_user(db, UserRole.technician, "Outsider")
        cal = client.post(
            "/api/v1/calibrations", json=_payload_with_checker(asset["id"], checker), headers=auth_headers
        ).json()
        r = client.post(f"/api/v1/calibrations/{cal['id']}/reject", headers=_headers_for(outsider))
        assert r.status_code == 403

    def test_global_admin_override_can_approve(
        self, client: TestClient, auth_headers: dict, db: Session, asset: dict
    ) -> None:
        # auth_headers's user is a global admin but not the assigned checker.
        checker = _make_user(db, UserRole.technician, "Checker")
        cal = client.post(
            "/api/v1/calibrations", json=_payload_with_checker(asset["id"], checker), headers=auth_headers
        ).json()
        r = client.post(f"/api/v1/calibrations/{cal['id']}/approve", headers=auth_headers)
        assert r.status_code == 200, r.text

    def test_approve_on_non_pending_calibration_is_rejected(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        r = client.post(f"/api/v1/calibrations/{calibration['id']}/approve", headers=auth_headers)
        assert r.status_code == 400

    def test_reject_on_non_pending_calibration_is_rejected(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        r = client.post(f"/api/v1/calibrations/{calibration['id']}/reject", headers=auth_headers)
        assert r.status_code == 400

    def test_unknown_calibration_returns_404_on_approve(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(f"/api/v1/calibrations/{uuid.uuid4()}/approve", headers=auth_headers)
        assert r.status_code == 404

    def test_requires_authentication(self, client: TestClient, calibration: dict) -> None:
        r = client.post(f"/api/v1/calibrations/{calibration['id']}/approve")
        assert r.status_code == 403  # HTTPBearer returns 403 when missing

    def test_void_works_on_pending_approval_calibration(
        self, client: TestClient, auth_headers: dict, db: Session, asset: dict
    ) -> None:
        """Regression: a pending-approval calibration is already is_active=False,
        so voiding it must not incorrectly 400 as "already voided" — the
        precondition must check status == "void" specifically, not is_active."""
        checker = _make_user(db, UserRole.technician, "Checker")
        cal = client.post(
            "/api/v1/calibrations", json=_payload_with_checker(asset["id"], checker), headers=auth_headers
        ).json()
        r = client.delete(f"/api/v1/calibrations/{cal['id']}", headers=auth_headers)
        assert r.status_code == 204
        after = client.get(f"/api/v1/calibrations/{cal['id']}", headers=auth_headers).json()
        assert after["status"] == "void"
        assert after["is_active"] is False

    def test_restore_after_void_returns_to_valid_not_pending(
        self, client: TestClient, auth_headers: dict, db: Session, asset: dict
    ) -> None:
        """Restore always returns to "valid" — it does not attempt to resurrect
        a pending-approval or rejected calibration back to its prior state."""
        checker = _make_user(db, UserRole.technician, "Checker")
        cal = client.post(
            "/api/v1/calibrations", json=_payload_with_checker(asset["id"], checker), headers=auth_headers
        ).json()
        client.delete(f"/api/v1/calibrations/{cal['id']}", headers=auth_headers)
        r = client.post(f"/api/v1/calibrations/{cal['id']}/restore", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "valid"
        assert r.json()["is_active"] is True

    def test_checker_assigned_notification_created(
        self, client: TestClient, auth_headers: dict, db: Session, asset: dict
    ) -> None:
        checker = _make_user(db, UserRole.technician, "Checker")
        client.post(
            "/api/v1/calibrations", json=_payload_with_checker(asset["id"], checker), headers=auth_headers
        )
        notifications = client.get("/api/v1/notifications", headers=_headers_for(checker)).json()
        assert any(n["type"] == "calibration.checker_assigned" for n in notifications)

    def test_decision_notification_created_for_registrant(
        self, client: TestClient, auth_headers: dict, db: Session, asset: dict, test_user: User
    ) -> None:
        checker = _make_user(db, UserRole.technician, "Checker")
        payload = _payload_with_checker(asset["id"], checker)
        payload["performed_by_user_id"] = str(test_user.id)
        cal = client.post("/api/v1/calibrations", json=payload, headers=auth_headers).json()
        client.post(f"/api/v1/calibrations/{cal['id']}/approve", headers=_headers_for(checker))
        notifications = client.get("/api/v1/notifications", headers=auth_headers).json()
        assert any(n["type"] == "calibration.approved" for n in notifications)


# ---------------------------------------------------------------------------
# GET /assets/{id}/calibration-users
# ---------------------------------------------------------------------------

class TestCalibrationUsers:
    def test_returns_active_org_members(
        self, client: TestClient, auth_headers: dict, db: Session, test_user: User
    ) -> None:
        org = client.post("/api/v1/organizations", json={"name": "Cal Users Org"}, headers=auth_headers).json()
        technician = _make_user(db, UserRole.technician, "Technician Member")
        from app.repositories import organization as org_repo
        from app.models.organization_member import OrgRole
        org_repo.upsert_membership(db, uuid.UUID(org["id"]), technician.id, role=OrgRole.member)

        asset_payload = {
            "asset_id": make_asset_id(),
            "asset_type": "sensor",
            "name": "Org Asset",
            "manufacturer": "Fluke",
            "model": "724",
            "organization_id": org["id"],
            "sensor_channels": [{"channel_id": "CH1", "physical_quantity": "temperature", "unit": "°C"}],
        }
        asset = client.post("/api/v1/assets", json=asset_payload, headers=auth_headers).json()

        r = client.get(f"/api/v1/assets/{asset['id']}/calibration-users", headers=auth_headers)
        assert r.status_code == 200, r.text
        ids = [u["id"] for u in r.json()]
        assert str(technician.id) in ids

    def test_excludes_viewers(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        org = client.post("/api/v1/organizations", json={"name": "Cal Users Org 2"}, headers=auth_headers).json()
        viewer = _make_user(db, UserRole.viewer, "Viewer Member")
        from app.repositories import organization as org_repo
        from app.models.organization_member import OrgRole
        org_repo.upsert_membership(db, uuid.UUID(org["id"]), viewer.id, role=OrgRole.member)

        asset_payload = {
            "asset_id": make_asset_id(),
            "asset_type": "sensor",
            "name": "Org Asset 2",
            "manufacturer": "Fluke",
            "model": "724",
            "organization_id": org["id"],
            "sensor_channels": [{"channel_id": "CH1", "physical_quantity": "temperature", "unit": "°C"}],
        }
        asset = client.post("/api/v1/assets", json=asset_payload, headers=auth_headers).json()

        r = client.get(f"/api/v1/assets/{asset['id']}/calibration-users", headers=auth_headers)
        assert r.status_code == 200
        ids = [u["id"] for u in r.json()]
        assert str(viewer.id) not in ids

    def test_unknown_asset_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get(f"/api/v1/assets/{uuid.uuid4()}/calibration-users", headers=auth_headers)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Calibration type & purpose (4-value classification, calibration lab
# resolution, repair tracking, uploaded certificates)
# ---------------------------------------------------------------------------

def _minimal_payload(asset_id: str, **overrides) -> dict:
    payload = {
        "asset_id": asset_id,
        "calibration_date": "2025-03-01",
        "due_date": "2026-03-01",
        "performed_by_name": "Tech",
    }
    payload.update(overrides)
    return payload


class TestCalibrationTypeValidation:
    def test_default_type_is_valid(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        r = client.post("/api/v1/calibrations", json=_minimal_payload(asset["id"]), headers=auth_headers)
        assert r.status_code == 201, r.text
        assert r.json()["calibration_type"] == "external_accredited_lab"

    @pytest.mark.parametrize(
        "calibration_type", ["oem", "external_accredited_lab", "internal_lab", "customer_asset"]
    )
    def test_all_four_types_accepted(
        self, client: TestClient, auth_headers: dict, asset: dict, calibration_type: str
    ) -> None:
        r = client.post(
            "/api/v1/calibrations",
            json=_minimal_payload(asset["id"], calibration_type=calibration_type),
            headers=auth_headers,
        )
        assert r.status_code == 201, r.text
        assert r.json()["calibration_type"] == calibration_type

    def test_legacy_values_rejected(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        for legacy in ("internal", "external", "bogus"):
            r = client.post(
                "/api/v1/calibrations",
                json=_minimal_payload(asset["id"], calibration_type=legacy),
                headers=auth_headers,
            )
            assert r.status_code == 422, legacy


class TestCalibrationPurposeValidation:
    def test_default_purpose_is_routine(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        r = client.post("/api/v1/calibrations", json=_minimal_payload(asset["id"]), headers=auth_headers)
        assert r.status_code == 201, r.text
        assert r.json()["calibration_purpose"] == "routine"

    @pytest.mark.parametrize("purpose", ["initial", "routine", "after_repair", "verification"])
    def test_all_four_purposes_accepted(
        self, client: TestClient, auth_headers: dict, asset: dict, purpose: str
    ) -> None:
        payload = _minimal_payload(asset["id"], calibration_purpose=purpose)
        if purpose == "after_repair":
            payload["repair_date"] = "2025-02-15"
            payload["repair_description"] = "Replaced diaphragm"
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["calibration_purpose"] == purpose
        if purpose == "after_repair":
            assert body["repair_date"] == "2025-02-15"
            assert body["repair_description"] == "Replaced diaphragm"

    def test_invalid_purpose_rejected(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        r = client.post(
            "/api/v1/calibrations",
            json=_minimal_payload(asset["id"], calibration_purpose="bogus"),
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_repair_description_over_500_chars_rejected(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        r = client.post(
            "/api/v1/calibrations",
            json=_minimal_payload(
                asset["id"],
                calibration_purpose="after_repair",
                repair_date="2025-02-15",
                repair_description="x" * 501,
            ),
            headers=auth_headers,
        )
        assert r.status_code == 422


class TestCalibrationLabResolution:
    def test_oem_type_accepts_manufacturer_snapshot_in_external_lab_name(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        # The wizard snapshots profile.manufacturer into external_lab_name for
        # OEM calibrations; the backend just stores whatever string is sent.
        r = client.post(
            "/api/v1/calibrations",
            json=_minimal_payload(asset["id"], calibration_type="oem", external_lab_name=asset["manufacturer"]),
            headers=auth_headers,
        )
        assert r.status_code == 201, r.text
        assert r.json()["external_lab_name"] == asset["manufacturer"]

    def test_external_accredited_lab_stores_organization_id(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        org = client.post(
            "/api/v1/organizations",
            json={"name": "Accredited Co", "org_category": "external", "org_type": "provider"},
            headers=auth_headers,
        ).json()
        r = client.post(
            "/api/v1/calibrations",
            json=_minimal_payload(
                asset["id"], calibration_type="external_accredited_lab", calibration_organization_id=org["id"]
            ),
            headers=auth_headers,
        )
        assert r.status_code == 201, r.text
        assert r.json()["calibration_organization_id"] == org["id"]

    def test_customer_asset_stores_organization_id(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        org = client.post(
            "/api/v1/organizations",
            json={"name": "Customer Co", "org_category": "external", "org_type": "customer"},
            headers=auth_headers,
        ).json()
        r = client.post(
            "/api/v1/calibrations",
            json=_minimal_payload(
                asset["id"], calibration_type="customer_asset", calibration_organization_id=org["id"]
            ),
            headers=auth_headers,
        )
        assert r.status_code == 201, r.text
        assert r.json()["calibration_organization_id"] == org["id"]


# ---------------------------------------------------------------------------
# POST /calibrations/{id}/certificate/upload — PDF-only, takes priority over
# the system-generated certificate everywhere it's served.
# ---------------------------------------------------------------------------

_VALID_PDF_BYTES = b"%PDF-1.4\n%fake-but-valid-magic-bytes\n"


class TestCertificateUpload:
    def test_valid_pdf_upload_sets_uploaded_certificate_file_id(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        r = client.post(
            f"/api/v1/calibrations/{calibration['id']}/certificate/upload",
            files={"file": ("cert.pdf", _VALID_PDF_BYTES, "application/pdf")},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["uploaded_certificate_file_id"] is not None

    def test_wrong_content_type_rejected(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        r = client.post(
            f"/api/v1/calibrations/{calibration['id']}/certificate/upload",
            files={"file": ("cert.pdf", _VALID_PDF_BYTES, "image/png")},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_pdf_content_type_but_bad_magic_bytes_rejected(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        r = client.post(
            f"/api/v1/calibrations/{calibration['id']}/certificate/upload",
            files={"file": ("cert.pdf", b"not-actually-a-pdf", "application/pdf")},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_unknown_calibration_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            f"/api/v1/calibrations/{uuid.uuid4()}/certificate/upload",
            files={"file": ("cert.pdf", _VALID_PDF_BYTES, "application/pdf")},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_viewer_forbidden(self, client: TestClient, db: Session, calibration: dict) -> None:
        r = client.post(
            f"/api/v1/calibrations/{calibration['id']}/certificate/upload",
            files={"file": ("cert.pdf", _VALID_PDF_BYTES, "application/pdf")},
            headers=_viewer_headers(db),
        )
        assert r.status_code == 403

    def test_requires_authentication(self, client: TestClient, calibration: dict) -> None:
        r = client.post(
            f"/api/v1/calibrations/{calibration['id']}/certificate/upload",
            files={"file": ("cert.pdf", _VALID_PDF_BYTES, "application/pdf")},
        )
        assert r.status_code == 403

    def test_uploaded_certificate_takes_priority_on_get(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        cal = client.post("/api/v1/calibrations", json=_atomic_payload(asset["id"]), headers=auth_headers).json()
        # System-generated certificate exists (best-effort at create time).
        before = client.get(f"/api/v1/calibrations/{cal['id']}/certificate", headers=auth_headers)
        assert before.status_code == 200

        client.post(
            f"/api/v1/calibrations/{cal['id']}/certificate/upload",
            files={"file": ("uploaded.pdf", _VALID_PDF_BYTES, "application/pdf")},
            headers=auth_headers,
        )
        after = client.get(f"/api/v1/calibrations/{cal['id']}/certificate", headers=auth_headers)
        assert after.status_code == 200, after.text
        assert after.json()["filename"] == "uploaded.pdf"

    def test_uploaded_certificate_takes_priority_on_download(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        cal = client.post("/api/v1/calibrations", json=_atomic_payload(asset["id"]), headers=auth_headers).json()
        client.post(
            f"/api/v1/calibrations/{cal['id']}/certificate/upload",
            files={"file": ("uploaded.pdf", _VALID_PDF_BYTES, "application/pdf")},
            headers=auth_headers,
        )
        r = client.get(f"/api/v1/calibrations/{cal['id']}/certificate/download", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.content == _VALID_PDF_BYTES
        assert 'filename="uploaded.pdf"' in r.headers["content-disposition"]

