"""
Tests for calibration records.

Covers: create calibration, list calibrations for asset, calibration date
ordering (most recent first), analyze endpoint (ephemeral), atomic create
with embedded polynomial/regression fields + points, GET /{id}/points,
authentication guards, version auto-increment/renumbering, and the
void/restore soft-delete flow.
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


# ---------------------------------------------------------------------------
# calibration_version renumbering (chronological, not insertion order)
# ---------------------------------------------------------------------------

class TestVersionRenumbering:
    def test_backfilled_earlier_date_becomes_version_one(
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

        # Backfill an earlier calibration_date after the fact.
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
        assert backfilled["calibration_version"] == 1

        # The originally-first record must have shifted up to make room.
        refetched_first = client.get(
            f"/api/v1/calibrations/{first['id']}", headers=auth_headers
        ).json()
        assert refetched_first["calibration_version"] == 2

    def test_renumbering_is_scoped_per_asset(
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
        # A backfill on a *different* asset must not renumber this asset's history.
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

        this_asset_cals = client.get(
            f"/api/v1/assets/{asset['id']}/calibrations", headers=auth_headers
        ).json()
        assert all(c["calibration_version"] == 1 for c in this_asset_cals)


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

