"""
Tests for asset import (POST /assets/import).

Covers: round-trip export->import fidelity (new asset/sensor/calibration rows,
channel_id relinking, calibration_version preserved verbatim), and the edge
cases the import service is meant to handle gracefully: corrupt zips, a
top-level folder without asset.yaml, and duplicate asset_id collisions.
"""
import io
import zipfile

import pytest
import yaml
from starlette.testclient import TestClient

from tests.conftest import make_asset_id


@pytest.fixture()
def populated_asset(client: TestClient, auth_headers: dict) -> dict:
    payload = {
        "asset_id": make_asset_id(),
        "asset_type": "sensor",
        "name": "Import Test Sensor",
        "manufacturer": "WIKA",
        "model": "TC-10",
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
        "poly_order": 1,
        "poly_coefficients": [0.0, 1.0],
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


def _export_zip(client: TestClient, auth_headers: dict, asset_id: str) -> bytes:
    r = client.get(f"/api/v1/assets/{asset_id}/export", headers=auth_headers)
    assert r.status_code == 200
    return r.content


def _zip_from_files(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for path, content in files.items():
            zf.writestr(path, content)
    return buf.getvalue()


def _rewrite_asset_id(zip_bytes: bytes, folder: str, new_asset_id: str) -> bytes:
    """Return a copy of the zip with the given folder's asset.yaml `asset_id`
    field changed. Used to simulate importing into a *different* system,
    where the exported asset_id doesn't already exist — re-importing the
    literal, unmodified export into the very same database it came from is
    expected to collide with the original (still-present) asset."""
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as src:
        items = {name: src.read(name) for name in src.namelist()}
    data = yaml.safe_load(items[f"{folder}/asset.yaml"])
    data["asset"]["asset_id"] = new_asset_id
    items[f"{folder}/asset.yaml"] = yaml.safe_dump(data, sort_keys=False, allow_unicode=True).encode("utf-8")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as dst:
        for name, content in items.items():
            dst.writestr(name, content)
    return buf.getvalue()


class TestImportRoundTrip:
    def test_reimport_creates_new_asset_with_same_data(
        self, client: TestClient, auth_headers: dict, populated_asset: dict
    ) -> None:
        # Simulate importing into a *different* system: the exported asset_id
        # is changed to one that doesn't already exist in this database
        # (re-importing the literal export into the same DB it came from
        # would correctly collide with the still-present original asset).
        new_asset_id = make_asset_id()
        zip_bytes = _export_zip(client, auth_headers, populated_asset["id"])
        zip_bytes = _rewrite_asset_id(zip_bytes, populated_asset["asset_id"], new_asset_id)

        r = client.post(
            "/api/v1/assets/import",
            files={"file": ("export.zip", zip_bytes, "application/zip")},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        results = r.json()["results"]
        assert len(results) == 1
        assert results[0]["status"] == "created"
        new_pk = results[0]["new_asset_pk"]
        assert new_pk != populated_asset["id"]
        assert results[0]["asset_id"] == new_asset_id

        profile = client.get(f"/api/v1/assets/{new_pk}/profile", headers=auth_headers).json()
        assert profile["asset_id"] == new_asset_id
        assert profile["location_id"] is None
        assert len(profile["sensor_channels"]) == 1
        assert profile["sensor_channels"][0]["channel_id"] == "CH1"
        new_sensor_id = profile["sensor_channels"][0]["id"]
        assert new_sensor_id != populated_asset["sensor_channels"][0]["id"]

        cals = client.get(f"/api/v1/assets/{new_pk}/calibrations", headers=auth_headers).json()
        assert len(cals) == 1
        assert cals[0]["calibration_version"] == 1
        assert cals[0]["sensor_id"] == new_sensor_id

        points = client.get(f"/api/v1/calibrations/{cals[0]['id']}/points", headers=auth_headers).json()
        assert len(points) == 2
        assert points[0]["reference_value"] == 0.0

    def test_reimporting_same_zip_twice_fails_second_time(
        self, client: TestClient, auth_headers: dict, populated_asset: dict
    ) -> None:
        zip_bytes = _export_zip(client, auth_headers, populated_asset["id"])
        zip_bytes = _rewrite_asset_id(zip_bytes, populated_asset["asset_id"], make_asset_id())
        first = client.post(
            "/api/v1/assets/import",
            files={"file": ("export.zip", zip_bytes, "application/zip")},
            headers=auth_headers,
        ).json()
        assert first["results"][0]["status"] == "created"

        second = client.post(
            "/api/v1/assets/import",
            files={"file": ("export.zip", zip_bytes, "application/zip")},
            headers=auth_headers,
        ).json()
        assert second["results"][0]["status"] == "error"
        assert "already exists" in second["results"][0]["error_message"]

    def test_bulk_zip_with_two_asset_folders_imports_both(
        self, client: TestClient, auth_headers: dict, populated_asset: dict
    ) -> None:
        other_payload = {
            "asset_id": make_asset_id(),
            "asset_type": "daq",
            "name": "Second Import DAQ",
            "manufacturer": "NI",
            "model": "cDAQ",
        }
        other = client.post("/api/v1/assets", json=other_payload, headers=auth_headers).json()

        r = client.post(
            "/api/v1/assets/export/bulk",
            json={"asset_ids": [populated_asset["id"], other["id"]]},
            headers=auth_headers,
        )
        assert r.status_code == 200

        # Both source assets still exist in this DB, so give the bundle fresh
        # asset_ids to simulate importing into a different system.
        new_id_1, new_id_2 = make_asset_id(), make_asset_id()
        zip_bytes = _rewrite_asset_id(r.content, populated_asset["asset_id"], new_id_1)
        zip_bytes = _rewrite_asset_id(zip_bytes, other["asset_id"], new_id_2)

        result = client.post(
            "/api/v1/assets/import",
            files={"file": ("bulk.zip", zip_bytes, "application/zip")},
            headers=auth_headers,
        ).json()
        statuses = {res["asset_id"]: res["status"] for res in result["results"]}
        assert statuses[new_id_1] == "created"
        assert statuses[new_id_2] == "created"


class TestImportEdgeCases:
    def test_corrupt_zip_returns_error_result(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/assets/import",
            files={"file": ("not-a-zip.zip", b"this is not a zip file", "application/zip")},
            headers=auth_headers,
        )
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) == 1
        assert results[0]["status"] == "error"
        assert "zip" in results[0]["error_message"].lower()

    def test_folder_without_asset_yaml_reports_error(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        zip_bytes = _zip_from_files({"SomeFolder/readme.txt": b"hello"})
        r = client.post(
            "/api/v1/assets/import",
            files={"file": ("broken.zip", zip_bytes, "application/zip")},
            headers=auth_headers,
        )
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) == 1
        assert results[0]["source_folder"] == "SomeFolder"
        assert results[0]["status"] == "error"
        assert "asset.yaml" in results[0]["error_message"]

    def test_malformed_asset_yaml_reports_error_without_aborting_batch(
        self, client: TestClient, auth_headers: dict, populated_asset: dict
    ) -> None:
        good_zip_bytes = _export_zip(client, auth_headers, populated_asset["id"])
        with zipfile.ZipFile(io.BytesIO(good_zip_bytes)) as zf:
            good_data = yaml.safe_load(zf.read(f"{populated_asset['asset_id']}/asset.yaml"))
        # give it a fresh asset_id so it doesn't collide with the fixture's own asset
        good_data["asset"]["asset_id"] = make_asset_id()
        good_yaml = yaml.safe_dump(good_data, sort_keys=False, allow_unicode=True).encode("utf-8")

        combined = _zip_from_files({
            "BadFolder/asset.yaml": b"not: [valid, yaml: structure",
            "GoodFolder/asset.yaml": good_yaml,
        })
        r = client.post(
            "/api/v1/assets/import",
            files={"file": ("mixed.zip", combined, "application/zip")},
            headers=auth_headers,
        )
        assert r.status_code == 200
        results = {res["source_folder"]: res for res in r.json()["results"]}
        assert results["BadFolder"]["status"] == "error"
        assert results["GoodFolder"]["status"] == "created"

    def test_import_unauthenticated_is_rejected(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/assets/import",
            files={"file": ("x.zip", b"irrelevant", "application/zip")},
        )
        assert r.status_code == 403


class TestValidateImportZip:
    def test_valid_zip_returns_preview(
        self, client: TestClient, auth_headers: dict, populated_asset: dict
    ) -> None:
        zip_bytes = _export_zip(client, auth_headers, populated_asset["id"])
        r = client.post(
            "/api/v1/assets/import/validate",
            files={"file": ("export.zip", zip_bytes, "application/zip")},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["valid"] is True
        assert body["asset_id"] == populated_asset["asset_id"]
        assert body["manufacturer"] == "WIKA"
        assert body["channel_count"] == 1
        assert body["calibration_count"] == 1

    def test_corrupt_zip_is_invalid(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/assets/import/validate",
            files={"file": ("bad.zip", b"not a zip", "application/zip")},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["valid"] is False

    def test_zip_with_multiple_folders_is_invalid(
        self, client: TestClient, auth_headers: dict, populated_asset: dict
    ) -> None:
        zip_bytes = _export_zip(client, auth_headers, populated_asset["id"])
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            asset_yaml = zf.read(f"{populated_asset['asset_id']}/asset.yaml")
        combined = _zip_from_files({
            "FolderA/asset.yaml": asset_yaml,
            "FolderB/asset.yaml": asset_yaml,
        })
        r = client.post(
            "/api/v1/assets/import/validate",
            files={"file": ("combined.zip", combined, "application/zip")},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["valid"] is False

    def test_validate_unauthenticated_is_rejected(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/assets/import/validate",
            files={"file": ("x.zip", b"irrelevant", "application/zip")},
        )
        assert r.status_code == 403


class TestImportWithOverrides:
    def test_import_applies_location_and_owner_overrides(
        self, client: TestClient, auth_headers: dict, populated_asset: dict
    ) -> None:
        org = client.post(
            "/api/v1/organizations", json={"name": "Test Org"}, headers=auth_headers
        ).json()
        location = client.post(
            "/api/v1/locations",
            json={"organization_id": org["id"], "name": "Lab A", "location_type": "laboratory"},
            headers=auth_headers,
        ).json()
        team = client.post(
            "/api/v1/teams",
            json={"name": "Cal Team", "organization_id": org["id"]},
            headers=auth_headers,
        ).json()

        zip_bytes = _export_zip(client, auth_headers, populated_asset["id"])
        zip_bytes = _rewrite_asset_id(zip_bytes, populated_asset["asset_id"], make_asset_id())

        r = client.post(
            "/api/v1/assets/import",
            files={"file": ("export.zip", zip_bytes, "application/zip")},
            data={"location_id": location["id"], "owner": team["id"]},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        result = r.json()["results"][0]
        assert result["status"] == "created"

        new_asset = client.get(
            f"/api/v1/assets/{result['new_asset_pk']}", headers=auth_headers
        ).json()
        assert new_asset["location_id"] == location["id"]
        assert new_asset["owner"] == team["id"]

    def test_import_without_overrides_leaves_location_and_owner_null(
        self, client: TestClient, auth_headers: dict, populated_asset: dict
    ) -> None:
        zip_bytes = _export_zip(client, auth_headers, populated_asset["id"])
        zip_bytes = _rewrite_asset_id(zip_bytes, populated_asset["asset_id"], make_asset_id())
        r = client.post(
            "/api/v1/assets/import",
            files={"file": ("export.zip", zip_bytes, "application/zip")},
            headers=auth_headers,
        )
        result = r.json()["results"][0]
        new_asset = client.get(
            f"/api/v1/assets/{result['new_asset_pk']}", headers=auth_headers
        ).json()
        assert new_asset["location_id"] is None
        assert new_asset["owner"] is None
