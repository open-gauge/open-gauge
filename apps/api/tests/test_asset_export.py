"""
Tests for asset export (GET /assets/{id}/export, POST /assets/export/bulk).

Covers: zip structure, YAML content (no excluded UUIDs leak in), calibration +
certificate bundling, auth guards, and bulk export of multiple assets.
"""
import io
import zipfile

import pytest
import yaml
from starlette.testclient import TestClient

from tests.conftest import make_asset_id


@pytest.fixture()
def populated_asset(client: TestClient, auth_headers: dict) -> dict:
    """A sensor asset with one channel and one calibration (with points + an
    auto-generated certificate, since POST /calibrations always tries to
    generate one)."""
    payload = {
        "asset_id": make_asset_id(),
        "asset_type": "sensor",
        "name": "Export Test Sensor",
        "manufacturer": "WIKA",
        "model": "TC-10",
        "serial_number": "SN-EXPORT-001",
        "sensor_channels": [
            {"channel_id": "CH1", "physical_quantity": "temperature", "unit": "°C"}
        ],
    }
    asset = client.post("/api/v1/assets", json=payload, headers=auth_headers).json()

    cal_payload = {
        "asset_id": asset["id"],
        "sensor_id": asset["sensor_channels"][0]["id"],
        "calibration_date": "2024-03-15",
        "due_date": "2025-03-15",
        "performed_by_name": "Lab Tech A",
        "notes": "Annual calibration",
        "poly_order": 1,
        "poly_coefficients": [0.0, 1.0],
        "r_squared": 0.999,
        "points": [
            {"point_index": 0, "reference_value": 0.0, "measured_value": 0.1,
             "reference_unit": "°C", "measured_unit": "°C"},
            {"point_index": 1, "reference_value": 100.0, "measured_value": 100.2,
             "reference_unit": "°C", "measured_unit": "°C"},
        ],
    }
    r = client.post("/api/v1/calibrations", json=cal_payload, headers=auth_headers)
    assert r.status_code == 201, r.text
    return asset


def _read_yaml(zip_bytes: bytes, asset_id: str) -> dict:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        return yaml.safe_load(zf.read(f"{asset_id}/asset.yaml"))


class TestExportAsset:
    def test_export_returns_zip(
        self, client: TestClient, auth_headers: dict, populated_asset: dict
    ) -> None:
        r = client.get(f"/api/v1/assets/{populated_asset['id']}/export", headers=auth_headers)
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/zip"
        with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
            names = zf.namelist()
        asset_id = populated_asset["asset_id"]
        assert f"{asset_id}/asset.yaml" in names
        assert any(n.startswith(f"{asset_id}/media/calibrations/001/") for n in names)

    def test_yaml_excludes_raw_uuids(
        self, client: TestClient, auth_headers: dict, populated_asset: dict
    ) -> None:
        r = client.get(f"/api/v1/assets/{populated_asset['id']}/export", headers=auth_headers)
        data = _read_yaml(r.content, populated_asset["asset_id"])

        asset_block = data["asset"]
        for excluded in ("id", "location_id", "owner", "created_by", "retired_by",
                         "datasheet_file_id", "pinout_image_id", "sensor_image_id",
                         "sensor_schematic_id", "picture_id"):
            assert excluded not in asset_block

        assert data["sensor_channels"][0]["channel_id"] == "CH1"
        assert "id" not in data["sensor_channels"][0]
        assert "calibration_method_id" not in data["sensor_channels"][0]

        cal = data["calibrations"][0]
        assert cal["channel_id"] == "CH1"
        assert cal["calibration_version"] == 1
        assert cal["has_certificate_file"] is True
        for excluded in ("id", "asset_id", "sensor_id", "created_by",
                         "calibration_file_id", "internal_procedure_id",
                         "daq_id", "calibration_data_id", "calibration_location_id"):
            assert excluded not in cal
        assert cal["data_points"][0]["reference_value"] == 0.0

    def test_export_nonexistent_asset_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        import uuid
        r = client.get(f"/api/v1/assets/{uuid.uuid4()}/export", headers=auth_headers)
        assert r.status_code == 404

    def test_export_unauthenticated_is_rejected(
        self, client: TestClient, populated_asset: dict
    ) -> None:
        r = client.get(f"/api/v1/assets/{populated_asset['id']}/export")
        assert r.status_code == 403

    def test_export_asset_without_channels_or_calibrations(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        payload = {
            "asset_id": make_asset_id(),
            "asset_type": "daq",
            "name": "Bare DAQ",
            "manufacturer": "NI",
            "model": "cDAQ",
        }
        asset = client.post("/api/v1/assets", json=payload, headers=auth_headers).json()
        r = client.get(f"/api/v1/assets/{asset['id']}/export", headers=auth_headers)
        assert r.status_code == 200
        data = _read_yaml(r.content, asset["asset_id"])
        assert data["sensor_channels"] == []
        assert data["calibrations"] == []
        assert data["daq_details"] is None


class TestBulkExportAssets:
    def test_bulk_export_contains_one_folder_per_asset(
        self, client: TestClient, auth_headers: dict, populated_asset: dict
    ) -> None:
        other_payload = {
            "asset_id": make_asset_id(),
            "asset_type": "sensor",
            "name": "Second Export Sensor",
            "manufacturer": "Omega",
            "model": "PX",
        }
        other = client.post("/api/v1/assets", json=other_payload, headers=auth_headers).json()

        r = client.post(
            "/api/v1/assets/export/bulk",
            json={"asset_ids": [populated_asset["id"], other["id"]]},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
            names = zf.namelist()
        assert f"{populated_asset['asset_id']}/asset.yaml" in names
        assert f"{other['asset_id']}/asset.yaml" in names

    def test_bulk_export_no_matching_assets_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        import uuid
        r = client.post(
            "/api/v1/assets/export/bulk",
            json={"asset_ids": [str(uuid.uuid4())]},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_bulk_export_unauthenticated_is_rejected(
        self, client: TestClient, populated_asset: dict
    ) -> None:
        r = client.post(
            "/api/v1/assets/export/bulk",
            json={"asset_ids": [populated_asset["id"]]},
        )
        assert r.status_code == 403
