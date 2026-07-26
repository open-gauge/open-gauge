"""
Tests for the dashboard's "upcoming calibrations" data.

Regression coverage for two bugs fixed together:
  1. `GET /dashboard/calibration-events` used each asset's most-recently-*created*
     calibration record to decide its due date, so an asset with more than one active
     calibration (e.g. independently scheduled channels) could be reported overdue even
     though its actual current cycle — the one with the furthest-out due date — was still
     valid.
  2. The endpoint returned overdue calibrations at all, even though it only backs the
     dashboard's "Upcoming calibrations" panel.

Plus a regression for the dashboard's Activity panel never surfacing an actor's profile
picture (see test_activity_includes_actor_profile_picture below).
"""
from datetime import date, timedelta

from starlette.testclient import TestClient

from tests.conftest import make_asset_id


def _create_asset(client: TestClient, auth_headers: dict) -> dict:
    payload = {
        "asset_id": make_asset_id(),
        "asset_type": "sensor",
        "name": "Dashboard Test Sensor",
        "manufacturer": "Fluke",
        "model": "724",
        "sensor_channels": [
            {"channel_id": "CH1", "physical_quantity": "temperature", "unit": "°C"}
        ],
    }
    r = client.post("/api/v1/assets", json=payload, headers=auth_headers)
    assert r.status_code == 201, r.text
    return r.json()


def _create_calibration(client: TestClient, auth_headers: dict, asset_id: str, due_date: date) -> dict:
    payload = {
        "asset_id": asset_id,
        "calibration_date": (due_date - timedelta(days=365)).isoformat(),
        "due_date": due_date.isoformat(),
        "performed_by_name": "Auto",
    }
    r = client.post("/api/v1/calibrations", json=payload, headers=auth_headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_uses_furthest_out_due_date_not_latest_created(
    client: TestClient, auth_headers: dict
) -> None:
    """An asset's status must follow its furthest-out active due date, not whichever
    calibration record happens to have been created last."""
    asset = _create_asset(client, auth_headers)
    future_due = date.today() + timedelta(days=200)
    past_due = date.today() - timedelta(days=10)

    # Created first, due far in the future.
    _create_calibration(client, auth_headers, asset["id"], future_due)
    # Created second (so it has the later created_at) but with an earlier due date —
    # e.g. a different sensor channel on its own, shorter schedule.
    _create_calibration(client, auth_headers, asset["id"], past_due)

    r = client.get("/api/v1/dashboard/calibration-events", headers=auth_headers)
    assert r.status_code == 200
    events = {e["id"]: e for e in r.json()}

    assert asset["id"] in events, "asset's real next due date is still upcoming"
    assert events[asset["id"]]["due_date"] == future_due.isoformat()


def test_overdue_only_asset_excluded_from_upcoming_panel(
    client: TestClient, auth_headers: dict
) -> None:
    """The upcoming-calibrations panel must not surface overdue calibrations."""
    asset = _create_asset(client, auth_headers)
    _create_calibration(client, auth_headers, asset["id"], date.today() - timedelta(days=5))

    r = client.get("/api/v1/dashboard/calibration-events", headers=auth_headers)
    assert r.status_code == 200
    ids = {e["id"] for e in r.json()}

    assert asset["id"] not in ids


def test_activity_includes_actor_profile_picture(
    client: TestClient, auth_headers: dict
) -> None:
    """Regression: dash_repo.get_activity built its rows straight off the AuditLog/User
    join and never resolved profile_picture_id into a URL, so the dashboard's Activity
    panel always fell back to initials even for a user with a picture set — unlike the
    full /activity page, which already resolves it via audit_log_enrich.enrich()."""
    client.post(
        "/api/v1/users/me/picture",
        files={"file": ("photo.png", b"fake-image-bytes", "image/png")},
        headers=auth_headers,
    )
    asset = _create_asset(client, auth_headers)

    r = client.get("/api/v1/dashboard/activity", headers=auth_headers)
    assert r.status_code == 200
    entry = next(e for e in r.json() if e["entity_asset_id"] == asset["asset_id"])
    assert entry["actor_profile_picture_url"]
