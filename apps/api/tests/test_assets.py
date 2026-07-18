"""
Tests for the asset endpoints.

Covers: list, create, get, profile, update (including the Decimal
serialization regression for audit-log before/after state), and retire.
"""
import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from tests.conftest import make_asset_id


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def created_asset(client: TestClient, auth_headers: dict) -> dict:
    """Create an asset and return the response body."""
    payload = {
        "asset_id": make_asset_id(),
        "asset_type": "sensor",
        "name": "Test Thermocouple",
        "manufacturer": "WIKA",
        "model": "TC-10",
        "serial_number": "SN-TC-001",
        "weight_kg": 0.45,
        "price_eur": 320.00,
        "operating_temperature_min": -40.0,
        "operating_temperature_max": 125.0,
        "operating_humidity_min": 0.0,
        "operating_humidity_max": 95.0,
        "sensor_channels": [
            {
                "channel_id": "CH1",
                "physical_quantity": "temperature",
                "unit": "°C",
                "technology": "thermocouple type K",
                "measurement_min": -200.0,
                "measurement_max": 1260.0,
                "accuracy_value": 2.5,
                "accuracy_type": "absolute",
                "accuracy_unit": "°C",
            }
        ],
    }
    response = client.post("/api/v1/assets", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

class TestListAssets:
    def test_returns_200(self, client: TestClient, auth_headers: dict) -> None:
        response = client.get("/api/v1/assets", headers=auth_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_unauthenticated_is_rejected(self, client: TestClient) -> None:
        response = client.get("/api/v1/assets")
        assert response.status_code == 403

    def test_created_asset_appears_in_list(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        response = client.get("/api/v1/assets", headers=auth_headers)
        ids = [a["id"] for a in response.json()]
        assert created_asset["id"] in ids


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

class TestCreateAsset:
    def test_create_sensor_returns_201(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        payload = {
            "asset_id": make_asset_id(),
            "asset_type": "sensor",
            "name": "New Pressure Sensor",
            "manufacturer": "Kistler",
            "model": "6001",
        }
        response = client.post("/api/v1/assets", json=payload, headers=auth_headers)
        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "New Pressure Sensor"
        assert body["version"] == 1

    def test_duplicate_asset_id_is_rejected(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        payload = {
            "asset_id": created_asset["asset_id"],
            "asset_type": "sensor",
            "name": "Duplicate",
            "manufacturer": "X",
            "model": "Y",
        }
        response = client.post("/api/v1/assets", json=payload, headers=auth_headers)
        assert response.status_code == 400

    def test_invalid_asset_id_format_is_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        payload = {
            "asset_id": "NOTOG001",  # wrong format
            "asset_type": "sensor",
            "name": "Bad",
            "manufacturer": "X",
            "model": "Y",
        }
        response = client.post("/api/v1/assets", json=payload, headers=auth_headers)
        assert response.status_code == 422

    def test_create_with_channels_stores_channel_data(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        assert len(created_asset["sensor_channels"]) == 1
        ch = created_asset["sensor_channels"][0]
        assert ch["channel_id"] == "CH1"
        assert ch["physical_quantity"] == "temperature"
        assert ch["technology"] == "thermocouple type K"

    def test_create_with_measurement_type_round_trips(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # e.g. a pressure channel's absolute-vs-gauge measurement mode.
        payload = {
            "asset_id": make_asset_id(),
            "asset_type": "sensor",
            "name": "Test Pressure Transmitter",
            "manufacturer": "WIKA",
            "model": "P-10",
            "sensor_channels": [
                {
                    "channel_id": "CH1",
                    "physical_quantity": "pressure",
                    "measurement_type": "gauge",
                    "unit": "kPa",
                }
            ],
        }
        response = client.post("/api/v1/assets", json=payload, headers=auth_headers)
        assert response.status_code == 201, response.text
        ch = response.json()["sensor_channels"][0]
        assert ch["measurement_type"] == "gauge"


# ---------------------------------------------------------------------------
# Get
# ---------------------------------------------------------------------------

class TestGetAsset:
    def test_get_existing_asset(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        response = client.get(f"/api/v1/assets/{asset_id}", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["id"] == asset_id

    def test_get_nonexistent_asset_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        import uuid
        response = client.get(
            f"/api/v1/assets/{uuid.uuid4()}", headers=auth_headers
        )
        assert response.status_code == 404

    def test_get_profile(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        response = client.get(
            f"/api/v1/assets/{asset_id}/profile", headers=auth_headers
        )
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == asset_id
        assert "calibration_status" in body
        assert body["calibration_count"] == 0


# ---------------------------------------------------------------------------
# Update (including Decimal serialization regression)
# ---------------------------------------------------------------------------

class TestUpdateAsset:
    def test_update_name(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        response = client.put(
            f"/api/v1/assets/{asset_id}",
            json={"name": "Updated Thermocouple Name"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Thermocouple Name"

    def test_update_increments_version(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        original_version = created_asset["version"]
        response = client.put(
            f"/api/v1/assets/{asset_id}",
            json={"name": "Version Bump"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["version"] == original_version + 1

    def test_update_with_decimal_fields_does_not_crash(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        """
        Regression: Numeric(x,y) columns return Decimal from PostgreSQL.
        The audit-log _serialize helper must handle Decimal or the PUT returns 500.
        """
        asset_id = created_asset["id"]
        response = client.put(
            f"/api/v1/assets/{asset_id}",
            json={
                "weight_kg": 0.55,
                "price_eur": 410.50,
                "operating_temperature_min": -55.0,
                "operating_temperature_max": 150.0,
                "operating_humidity_min": 5.0,
                "operating_humidity_max": 90.0,
            },
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert abs(body["weight_kg"] - 0.55) < 0.001
        assert abs(body["price_eur"] - 410.50) < 0.01

    def test_update_can_clear_optional_field(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        response = client.put(
            f"/api/v1/assets/{asset_id}",
            json={"serial_number": None},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["serial_number"] is None

    def test_update_replaces_sensor_channels(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        response = client.put(
            f"/api/v1/assets/{asset_id}",
            json={
                "sensor_channels": [
                    {
                        "channel_id": "CH1",
                        "physical_quantity": "pressure",
                        "unit": "bar",
                        "technology": "piezoelectric",
                        "measurement_min": 0.0,
                        "measurement_max": 10.0,
                    },
                    {
                        "channel_id": "CH2",
                        "physical_quantity": "temperature",
                        "unit": "°C",
                    },
                ]
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        channels = response.json()["sensor_channels"]
        assert len(channels) == 2
        channel_ids = {ch["channel_id"] for ch in channels}
        assert channel_ids == {"CH1", "CH2"}

    def test_update_nonexistent_asset_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        import uuid
        response = client.put(
            f"/api/v1/assets/{uuid.uuid4()}",
            json={"name": "Ghost"},
            headers=auth_headers,
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Retire (DELETE)
# ---------------------------------------------------------------------------

class TestRetireAsset:
    def test_retire_asset(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        response = client.delete(
            f"/api/v1/assets/{asset_id}", headers=auth_headers
        )
        assert response.status_code == 204

    def test_retired_asset_is_inactive(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        client.delete(f"/api/v1/assets/{asset_id}", headers=auth_headers)
        response = client.get(
            f"/api/v1/assets/{asset_id}", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is False


# ---------------------------------------------------------------------------
# Asset picture
# ---------------------------------------------------------------------------

class TestAssetPicture:
    def test_upload_picture_sets_picture_url(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        response = client.post(
            f"/api/v1/assets/{asset_id}/picture",
            files={"file": ("photo.png", b"fake-image-bytes", "image/png")},
            headers=auth_headers,
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["picture_id"] is not None
        assert body["picture_url"]

    def test_uploading_new_picture_replaces_old_one(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        first = client.post(
            f"/api/v1/assets/{asset_id}/picture",
            files={"file": ("first.png", b"first-bytes", "image/png")},
            headers=auth_headers,
        ).json()
        second = client.post(
            f"/api/v1/assets/{asset_id}/picture",
            files={"file": ("second.png", b"second-bytes", "image/png")},
            headers=auth_headers,
        ).json()
        assert second["picture_id"] != first["picture_id"]

    def test_upload_rejects_non_image_content_type(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        response = client.post(
            f"/api/v1/assets/{asset_id}/picture",
            files={"file": ("doc.pdf", b"%PDF-1.4", "application/pdf")},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_upload_picture_nonexistent_asset_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        import uuid
        response = client.post(
            f"/api/v1/assets/{uuid.uuid4()}/picture",
            files={"file": ("photo.png", b"fake-image-bytes", "image/png")},
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_upload_unauthenticated_is_rejected(
        self, client: TestClient, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        response = client.post(
            f"/api/v1/assets/{asset_id}/picture",
            files={"file": ("photo.png", b"fake-image-bytes", "image/png")},
        )
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# Asset files
# ---------------------------------------------------------------------------

class TestAssetFiles:
    """Regression: the asset picture is uploaded through the same StoredFile
    table (entity_id=asset id, entity_type="asset_picture") as regular
    attachments (entity_type="asset") — the Files list must only ever return
    the latter, since the picture is managed from the Image section instead."""

    def test_list_files_excludes_the_asset_picture(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        client.post(
            f"/api/v1/assets/{asset_id}/files",
            files={"file": ("datasheet.pdf", b"%PDF-1.4 fake", "application/pdf")},
            headers=auth_headers,
        )
        client.post(
            f"/api/v1/assets/{asset_id}/picture",
            files={"file": ("photo.png", b"fake-image-bytes", "image/png")},
            headers=auth_headers,
        )

        response = client.get(f"/api/v1/assets/{asset_id}/files", headers=auth_headers)
        assert response.status_code == 200, response.text
        names = [f["original_filename"] for f in response.json()]
        assert names == ["datasheet.pdf"]
        assert "photo.png" not in names

    def test_delete_picture_clears_it(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        client.post(
            f"/api/v1/assets/{asset_id}/picture",
            files={"file": ("photo.png", b"fake-image-bytes", "image/png")},
            headers=auth_headers,
        )
        response = client.delete(
            f"/api/v1/assets/{asset_id}/picture", headers=auth_headers
        )
        assert response.status_code == 200
        body = response.json()
        assert body["picture_id"] is None
        assert body["picture_url"] is None

    def test_delete_picture_nonexistent_asset_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        import uuid
        response = client.delete(
            f"/api/v1/assets/{uuid.uuid4()}/picture", headers=auth_headers
        )
        assert response.status_code == 404
