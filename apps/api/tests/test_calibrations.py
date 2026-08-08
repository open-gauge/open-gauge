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
        "temperature_uncertainty": 0.5,
        "humidity": 48.0,
        "humidity_uncertainty": 2.0,
        "pressure": 101325.0,
        "pressure_uncertainty": 50.0,
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
        assert abs(body["temperature_uncertainty"] - 0.5) < 0.01
        assert abs(body["pressure_uncertainty"] - 50.0) < 1.0
        assert abs(body["humidity_uncertainty"] - 2.0) < 0.01

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

    def test_ignores_fields_dropped_by_the_revert_and_never_reused(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        """629052c's frequency-response-as-a-separate-step feature was reverted
        (see 035_revert_frequency_response). Of its 5 dropped columns,
        frequency_response_frequency_unit/amplitude_type were later reused —
        with new semantics and a differently-shaped frequency_response_points
        — by 036's frequency_response input mechanism (see
        TestFrequencyResponseRoundTrip below), so sending them (or the old
        points shape) now correctly validates against the new field instead
        of being silently ignored. Only the 3 columns never reused
        (has_frequency_response, frequency_response_amplitude_unit,
        frequency_response_phase_unit) are still genuinely unknown to the
        schema — a client still sending those must not error
        (CalibrationCreate has no `extra="forbid"`), and they must not appear
        on the created record."""
        payload = _atomic_payload(asset["id"])
        payload.update({
            "has_frequency_response": True,
            "frequency_response_amplitude_unit": None,
            "frequency_response_phase_unit": "°",
        })
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201, r.text
        body = r.json()
        assert "has_frequency_response" not in body
        assert "frequency_response_amplitude_unit" not in body
        assert "frequency_response_phase_unit" not in body


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
# GET /calibrations/{id}/frequency-points — route removed by 629052c's revert
# ---------------------------------------------------------------------------

class TestFrequencyPointsRouteRemoved:
    def test_returns_404_route_no_longer_exists(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        r = client.get(f"/api/v1/calibrations/{calibration['id']}/frequency-points", headers=auth_headers)
        assert r.status_code == 404


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


# ---------------------------------------------------------------------------
# Alternative data-entry modes (data_entry_mode) — model provided directly,
# reference-vs-indicated, reference-vs-as-found/as-left
# ---------------------------------------------------------------------------

class TestDataEntryModeValidation:
    def test_default_mode_is_raw_data(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        r = client.post("/api/v1/calibrations", json=_minimal_payload(asset["id"]), headers=auth_headers)
        assert r.status_code == 201, r.text
        assert r.json()["data_entry_mode"] == "raw_data"

    def test_unknown_mode_rejected(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        r = client.post(
            "/api/v1/calibrations",
            json=_minimal_payload(asset["id"], data_entry_mode="not_a_real_mode"),
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_unknown_model_type_rejected(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        r = client.post(
            "/api/v1/calibrations",
            json=_minimal_payload(asset["id"], model_type="quadratic_spline"),
            headers=auth_headers,
        )
        assert r.status_code == 422


class TestDataEntryModePurposePairing:
    """reference_vs_as_found_as_left <-> after_repair and model_direct <->
    not after_repair are enforced by CalibrationCreate's model_validator.
    reference_vs_indicated has no purpose restriction at all — the wizard's
    Step 2 "Input data" method picker offers it regardless of purpose."""

    @pytest.mark.parametrize("purpose", ["initial", "routine", "after_repair", "verification"])
    def test_reference_vs_indicated_accepted_with_any_purpose(
        self, client: TestClient, auth_headers: dict, asset: dict, purpose: str
    ) -> None:
        payload = _minimal_payload(asset["id"], data_entry_mode="reference_vs_indicated", calibration_purpose=purpose)
        if purpose == "after_repair":
            payload["repair_date"] = "2025-02-15"
            payload["repair_description"] = "n/a"
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201, (purpose, r.text)

    def test_as_found_as_left_requires_after_repair_purpose(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        r = client.post(
            "/api/v1/calibrations",
            json=_minimal_payload(
                asset["id"], data_entry_mode="reference_vs_as_found_as_left", calibration_purpose="routine",
            ),
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_as_found_as_left_accepted_with_after_repair_purpose(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        r = client.post(
            "/api/v1/calibrations",
            json=_minimal_payload(
                asset["id"], data_entry_mode="reference_vs_as_found_as_left", calibration_purpose="after_repair",
                repair_date="2025-02-15", repair_description="Replaced sensor element",
            ),
            headers=auth_headers,
        )
        assert r.status_code == 201, r.text

    def test_model_direct_rejected_for_after_repair_purpose(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        r = client.post(
            "/api/v1/calibrations",
            json=_minimal_payload(
                asset["id"], data_entry_mode="model_direct", calibration_purpose="after_repair",
                repair_date="2025-02-15", repair_description="n/a",
            ),
            headers=auth_headers,
        )
        assert r.status_code == 422

    @pytest.mark.parametrize("purpose", ["initial", "routine", "verification"])
    def test_model_direct_accepted_for_non_after_repair_purposes(
        self, client: TestClient, auth_headers: dict, asset: dict, purpose: str
    ) -> None:
        r = client.post(
            "/api/v1/calibrations",
            json=_minimal_payload(asset["id"], data_entry_mode="model_direct", calibration_purpose=purpose),
            headers=auth_headers,
        )
        assert r.status_code == 201, (purpose, r.text)


class TestModelDirectRoundTrip:
    def test_polynomial_model_direct_round_trip(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        payload = _minimal_payload(
            asset["id"],
            data_entry_mode="model_direct",
            model_type="polynomial",
            poly_order=1,
            poly_coefficients=[1.0025, -0.42],
            range_min=0.0,
            range_max=1000.0,
            valid_range_min=0.0,
            valid_range_max=1000.0,
        )
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["data_entry_mode"] == "model_direct"
        assert body["model_type"] == "polynomial"
        assert body["poly_coefficients"] == [1.0025, -0.42]
        assert body["custom_formula"] is None

        # No raw data at all for this mode.
        pts = client.get(f"/api/v1/calibrations/{body['id']}/points", headers=auth_headers).json()
        assert pts == []

    def test_custom_formula_round_trip(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        payload = _minimal_payload(
            asset["id"],
            data_entry_mode="model_direct",
            model_type="custom_formula",
            custom_formula="2.5 * x + 1.2",
            range_min=0.0,
            range_max=100.0,
        )
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["model_type"] == "custom_formula"
        assert body["custom_formula"] == "2.5 * x + 1.2"

    def test_invalid_custom_formula_rejected(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        payload = _minimal_payload(
            asset["id"],
            data_entry_mode="model_direct",
            model_type="custom_formula",
            custom_formula="not_a_real_function(x)",
        )
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 422, r.text


class TestReferenceVsIndicatedRoundTrip:
    def _points(self) -> list[dict]:
        return [
            {
                "point_index": 0, "reference_value": 0.0, "measured_value": 0.05,
                "calculated_value": 0.05, "residual_abs": -0.05, "residual_pct": -0.1,
                "reference_unit": "°C", "measured_unit": "°C",
            },
            {
                "point_index": 1, "reference_value": 50.0, "measured_value": 49.9,
                "calculated_value": 49.9, "residual_abs": 0.1, "residual_pct": 0.2,
                "reference_unit": "°C", "measured_unit": "°C",
            },
        ]

    def test_round_trip_with_points_no_model(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        payload = _minimal_payload(
            asset["id"],
            data_entry_mode="reference_vs_indicated",
            calibration_purpose="verification",
            points=self._points(),
            r_squared=0.98,
            rmse=0.07,
            max_error=0.1,
        )
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["data_entry_mode"] == "reference_vs_indicated"
        # No transference function -> no model stored.
        assert not body["poly_coefficients"]
        assert body["poly_order"] is None
        # But real fit-free statistics are still stored, same as raw_data.
        assert body["r_squared"] == pytest.approx(0.98)

        pts = client.get(f"/api/v1/calibrations/{body['id']}/points", headers=auth_headers).json()
        assert len(pts) == 2
        assert all(p["point_role"] == "primary" for p in pts)


class TestReferenceVsAsFoundAsLeftRoundTrip:
    def _points(self, offset: float) -> list[dict]:
        return [
            {
                "point_index": 0, "reference_value": 0.0, "measured_value": offset,
                "reference_unit": "°C", "measured_unit": "°C",
            },
            {
                "point_index": 1, "reference_value": 50.0, "measured_value": 50.0 + offset,
                "reference_unit": "°C", "measured_unit": "°C",
            },
        ]

    def test_as_left_is_primary_and_as_found_is_diagnostic(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        as_found_summary = {
            "poly_degree": None, "coefficients": [], "r_squared": 0.9, "rmse": 0.3,
            "max_error": 0.5, "valid_range_min": 0.0, "valid_range_max": 50.0,
            "passed": False, "conformity_statement": {"specification": None},
            "uncertainty_budget": [], "combined_uncertainty": 0.1, "expanded_uncertainty": 0.2,
            "points": [],
        }
        payload = _minimal_payload(
            asset["id"],
            data_entry_mode="reference_vs_as_found_as_left",
            calibration_purpose="after_repair",
            repair_date="2025-02-15",
            repair_description="Replaced sensor element",
            points=self._points(offset=0.02),  # as-left: this record's primary result
            as_found_points=self._points(offset=0.5),  # as-found: diagnostic only
            as_found_summary=as_found_summary,
        )
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["data_entry_mode"] == "reference_vs_as_found_as_left"
        assert body["as_found_summary"]["max_error"] == pytest.approx(0.5)

        primary_pts = client.get(f"/api/v1/calibrations/{body['id']}/points", headers=auth_headers).json()
        assert len(primary_pts) == 2
        assert all(p["point_role"] == "primary" for p in primary_pts)
        assert primary_pts[0]["measured_value"] == pytest.approx(0.02)  # as-left values

        as_found_pts = client.get(
            f"/api/v1/calibrations/{body['id']}/points", params={"role": "as_found"}, headers=auth_headers,
        ).json()
        assert len(as_found_pts) == 2
        assert all(p["point_role"] == "as_found" for p in as_found_pts)
        assert as_found_pts[0]["measured_value"] == pytest.approx(0.5)  # as-found values, kept separate

    def test_as_found_points_optional(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        payload = _minimal_payload(
            asset["id"],
            data_entry_mode="reference_vs_as_found_as_left",
            calibration_purpose="after_repair",
            repair_date="2025-02-15",
            repair_description="n/a",
            points=self._points(offset=0.02),
        )
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201, r.text
        as_found_pts = client.get(
            f"/api/v1/calibrations/{r.json()['id']}/points", params={"role": "as_found"}, headers=auth_headers,
        ).json()
        assert as_found_pts == []


# ---------------------------------------------------------------------------
# data_entry_mode="raw_data"'s Step 3 "Calibration method" — Polynomial Fit
# (default, unchanged) / Lookup Table / Custom Formula
# ---------------------------------------------------------------------------

def _raw_points() -> list[dict]:
    return [
        {"reference": 0.0, "measured": 0.0},
        {"reference": 10.0, "measured": 5.0},
        {"reference": 20.0, "measured": 10.0},
        {"reference": 30.0, "measured": 15.0},
    ]


class TestAnalyzeCalibrationMethod:
    def test_lookup_table_via_analyze_endpoint(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/calibrations/analyze",
            json={
                "points": _raw_points(), "reference_unit": "°C", "measured_unit": "°C",
                "poly_degree": None, "calibration_method": "lookup_table",
                "distribution_type": "normal", "confidence_level": 95.0,
                "channel_accuracy_value": None, "channel_accuracy_type": None,
                "decision_rule": "simple_acceptance",
            },
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["poly_degree"] is None
        assert body["coefficients"] == []
        assert body["non_linearity_pct"] is None
        for pt in body["points"]:
            assert pt["residual_abs"] == pytest.approx(0.0, abs=1e-6)

    def test_custom_formula_via_analyze_endpoint(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/calibrations/analyze",
            json={
                "points": _raw_points(), "reference_unit": "°C", "measured_unit": "°C",
                "poly_degree": None, "calibration_method": "custom_formula",
                "custom_formula_template": "a*x",
                "distribution_type": "normal", "confidence_level": 95.0,
                "channel_accuracy_value": None, "channel_accuracy_type": None,
                "decision_rule": "simple_acceptance",
            },
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["resolved_custom_formula"] is not None
        assert body["custom_formula_parameter_values"]["a"] == pytest.approx(2.0, abs=1e-3)

    def test_custom_formula_with_no_parameters_returns_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/calibrations/analyze",
            json={
                "points": _raw_points(), "reference_unit": "°C", "measured_unit": "°C",
                "poly_degree": None, "calibration_method": "custom_formula",
                "custom_formula_template": "x + 1",
                "distribution_type": "normal", "confidence_level": 95.0,
                "channel_accuracy_value": None, "channel_accuracy_type": None,
                "decision_rule": "simple_acceptance",
            },
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_default_method_is_unchanged_polynomial_fit(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Omitting calibration_method entirely must behave exactly like
        # before this feature existed (backward compatible default).
        r = client.post(
            "/api/v1/calibrations/analyze",
            json={
                "points": _raw_points(), "reference_unit": "°C", "measured_unit": "°C",
                "poly_degree": 1,
                "distribution_type": "normal", "confidence_level": 95.0,
                "channel_accuracy_value": None, "channel_accuracy_type": None,
                "decision_rule": "simple_acceptance",
            },
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["poly_degree"] == 1
        assert len(body["coefficients"]) == 2


class TestRawDataCalibrationMethodRoundTrip:
    def test_lookup_table_round_trip(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        analyze = client.post(
            "/api/v1/calibrations/analyze",
            json={
                "points": _raw_points(), "reference_unit": "°C", "measured_unit": "°C",
                "poly_degree": None, "calibration_method": "lookup_table",
                "distribution_type": "normal", "confidence_level": 95.0,
                "channel_accuracy_value": None, "channel_accuracy_type": None,
                "decision_rule": "simple_acceptance",
            },
            headers=auth_headers,
        ).json()
        payload = _minimal_payload(
            asset["id"],
            model_type="lookup_table",
            poly_order=None,
            poly_coefficients=[],
            r_squared=analyze["r_squared"],
            points=[
                {
                    "point_index": p["point_index"], "reference_value": p["reference_value"],
                    "measured_value": p["measured_value"], "calculated_value": p["calculated_value"],
                    "residual_abs": p["residual_abs"], "residual_pct": p["residual_pct"],
                    "reference_unit": "°C", "measured_unit": "°C",
                }
                for p in analyze["points"]
            ],
        )
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201, r.text
        assert r.json()["model_type"] == "lookup_table"

    def test_custom_formula_round_trip(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        analyze = client.post(
            "/api/v1/calibrations/analyze",
            json={
                "points": _raw_points(), "reference_unit": "°C", "measured_unit": "°C",
                "poly_degree": None, "calibration_method": "custom_formula",
                "custom_formula_template": "a*x",
                "distribution_type": "normal", "confidence_level": 95.0,
                "channel_accuracy_value": None, "channel_accuracy_type": None,
                "decision_rule": "simple_acceptance",
            },
            headers=auth_headers,
        ).json()
        payload = _minimal_payload(
            asset["id"],
            model_type="custom_formula",
            custom_formula=analyze["resolved_custom_formula"],
            r_squared=analyze["r_squared"],
        )
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["model_type"] == "custom_formula"
        assert body["custom_formula"] == analyze["resolved_custom_formula"]


# ---------------------------------------------------------------------------
# data_entry_mode="frequency_response"
# ---------------------------------------------------------------------------

def _freq_sweep_points() -> list[dict]:
    # sensitivity = measured/reference: 10, 12, 8 at reference=1 throughout —
    # baseline (sweep_index=1) gain=12, deviations -16.667%/0%/-33.333%.
    return [
        {
            "sweep_index": 0, "frequency_value": 10.0, "reference_value": 1.0, "measured_value": 10.0,
            "offset_value": -2.0, "reference_unit": "g", "measured_unit": "mV",
        },
        {
            "sweep_index": 1, "frequency_value": 100.0, "reference_value": 1.0, "measured_value": 12.0,
            "offset_value": -5.0, "reference_unit": "g", "measured_unit": "mV",
        },
        {
            "sweep_index": 2, "frequency_value": 1000.0, "reference_value": 1.0, "measured_value": 8.0,
            "offset_value": None, "reference_unit": "g", "measured_unit": "mV",
        },
    ]


class TestAnalyzeFrequencyResponseEndpoint:
    def test_returns_200_with_computed_sensitivity(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/calibrations/analyze-frequency-response",
            json={
                "points": [
                    {"sweep_index": 0, "frequency_value": 10.0, "reference_value": 1.0, "measured_value": 10.0},
                    {"sweep_index": 1, "frequency_value": 100.0, "reference_value": 1.0, "measured_value": 12.0},
                ],
                "baseline_sweep_index": 1,
            },
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["gain"] == pytest.approx(12.0)
        assert body["poly_coefficients"] == [pytest.approx(12.0), 0.0]
        baseline = next(p for p in body["points"] if p["sweep_index"] == 1)
        assert baseline["deviation_pct"] == pytest.approx(0.0)

    def test_fails_with_single_point(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/calibrations/analyze-frequency-response",
            json={
                "points": [{"sweep_index": 0, "frequency_value": 10.0, "reference_value": 1.0, "measured_value": 10.0}],
                "baseline_sweep_index": 0,
            },
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_invalid_baseline_index_is_422(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/calibrations/analyze-frequency-response",
            json={
                "points": [
                    {"sweep_index": 0, "frequency_value": 10.0, "reference_value": 1.0, "measured_value": 10.0},
                    {"sweep_index": 1, "frequency_value": 100.0, "reference_value": 1.0, "measured_value": 12.0},
                ],
                "baseline_sweep_index": 99,
            },
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_does_not_persist_anything(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        r_before = client.get(f"/api/v1/assets/{asset['id']}/calibrations", headers=auth_headers)
        count_before = len(r_before.json())
        client.post(
            "/api/v1/calibrations/analyze-frequency-response",
            json={
                "points": [
                    {"sweep_index": 0, "frequency_value": 10.0, "reference_value": 1.0, "measured_value": 10.0},
                    {"sweep_index": 1, "frequency_value": 100.0, "reference_value": 1.0, "measured_value": 12.0},
                ],
                "baseline_sweep_index": 0,
            },
            headers=auth_headers,
        )
        r_after = client.get(f"/api/v1/assets/{asset['id']}/calibrations", headers=auth_headers)
        assert len(r_after.json()) == count_before

    def test_requires_authentication(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/calibrations/analyze-frequency-response",
            json={
                "points": [
                    {"sweep_index": 0, "frequency_value": 10.0, "reference_value": 1.0, "measured_value": 10.0},
                    {"sweep_index": 1, "frequency_value": 100.0, "reference_value": 1.0, "measured_value": 12.0},
                ],
                "baseline_sweep_index": 0,
            },
        )
        assert r.status_code == 403


class TestFrequencyResponseRoundTrip:
    def test_round_trip_computes_and_stores_sensitivity(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        payload = _minimal_payload(
            asset["id"],
            data_entry_mode="frequency_response",
            frequency_response_frequency_unit="Hz",
            frequency_response_amplitude_type="RMS",
            frequency_response_offset_enabled=True,
            frequency_response_offset_unit="°",
            frequency_response_baseline_sweep_index=1,
            frequency_response_points=_freq_sweep_points(),
        )
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["data_entry_mode"] == "frequency_response"
        # Server-computed gain-only model — [gain, 0], never trusted from the client.
        assert body["poly_order"] == 1
        assert body["poly_coefficients"] == [pytest.approx(12.0), 0.0]
        assert body["range_min"] == pytest.approx(1.0)
        assert body["range_max"] == pytest.approx(1.0)
        assert body["frequency_response_frequency_unit"] == "Hz"
        assert body["frequency_response_offset_enabled"] is True
        assert body["frequency_response_baseline_sweep_index"] == 1
        # No raw_data-style points — the sweep lives in its own collection.
        assert body["poly_coefficients"] != []

        pts = client.get(
            f"/api/v1/calibrations/{body['id']}/frequency-response-points", headers=auth_headers
        ).json()
        assert len(pts) == 3
        pts_by_index = {p["sweep_index"]: p for p in pts}
        assert pts_by_index[0]["sensitivity_value"] == pytest.approx(10.0)
        assert pts_by_index[1]["sensitivity_value"] == pytest.approx(12.0)
        assert pts_by_index[1]["deviation_pct"] == pytest.approx(0.0)
        assert pts_by_index[2]["deviation_pct"] == pytest.approx((8.0 - 12.0) / 12.0 * 100)
        # Offset only entered for sweep_index 0 and 1 — sweep_index 2 stays null.
        assert pts_by_index[0]["offset_value"] == pytest.approx(-2.0)
        assert pts_by_index[2]["offset_value"] is None

        # GET /points (the raw_data-style collection) stays empty for this mode.
        primary_pts = client.get(f"/api/v1/calibrations/{body['id']}/points", headers=auth_headers).json()
        assert primary_pts == []

    def test_offset_disabled_leaves_offset_and_phase_fields_null(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        points = [
            {**p, "offset_value": None} for p in _freq_sweep_points()
        ]
        payload = _minimal_payload(
            asset["id"],
            data_entry_mode="frequency_response",
            frequency_response_frequency_unit="Hz",
            frequency_response_amplitude_type="RMS",
            frequency_response_offset_enabled=False,
            frequency_response_baseline_sweep_index=1,
            frequency_response_points=points,
        )
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["frequency_response_offset_enabled"] is False
        assert body["frequency_response_offset_unit"] is None

        pts = client.get(
            f"/api/v1/calibrations/{body['id']}/frequency-response-points", headers=auth_headers
        ).json()
        assert all(p["offset_value"] is None for p in pts)

    def test_available_for_after_repair_purpose(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        # Unlike model_direct, frequency_response has no purpose restriction.
        payload = _minimal_payload(
            asset["id"],
            data_entry_mode="frequency_response",
            calibration_purpose="after_repair",
            repair_date="2025-02-01",
            frequency_response_baseline_sweep_index=0,
            frequency_response_points=_freq_sweep_points(),
        )
        r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
        assert r.status_code == 201, r.text
        assert r.json()["calibration_purpose"] == "after_repair"

    def test_frequency_response_points_empty_for_other_modes(
        self, client: TestClient, auth_headers: dict, calibration: dict
    ) -> None:
        pts = client.get(
            f"/api/v1/calibrations/{calibration['id']}/frequency-response-points", headers=auth_headers
        ).json()
        assert pts == []

