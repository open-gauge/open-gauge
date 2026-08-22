"""
Tests for the asset "Interface" and "CAD" tab endpoints.

Covers: pinout-image / mechanical-image upload+replace+delete (mirrors the
asset picture endpoints), pinout_table/mechanical_table updates via the
generic PUT, and CAD file list/upload/delete with format+size validation.
"""
import io
import uuid
import zipfile

import pytest
from starlette.testclient import TestClient

from tests.conftest import make_asset_id


@pytest.fixture()
def created_asset(client: TestClient, auth_headers: dict) -> dict:
    payload = {
        "asset_id": make_asset_id(),
        "asset_type": "sensor",
        "name": "Interface Test Sensor",
        "manufacturer": "WIKA",
        "model": "TC-10",
    }
    response = client.post("/api/v1/assets", json=payload, headers=auth_headers)
    assert response.status_code == 201, response.text
    return response.json()


class TestPinoutImage:
    def test_upload_sets_pinout_image(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        response = client.post(
            f"/api/v1/assets/{asset_id}/pinout-image",
            files={"file": ("connector.png", b"fake-image-bytes", "image/png")},
            headers=auth_headers,
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["pinout_image_id"] is not None
        assert body["pinout_image_url"]

    def test_uploading_new_image_replaces_old_one(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        first = client.post(
            f"/api/v1/assets/{asset_id}/pinout-image",
            files={"file": ("first.png", b"first-bytes", "image/png")},
            headers=auth_headers,
        ).json()
        second = client.post(
            f"/api/v1/assets/{asset_id}/pinout-image",
            files={"file": ("second.png", b"second-bytes", "image/png")},
            headers=auth_headers,
        ).json()
        assert second["pinout_image_id"] != first["pinout_image_id"]

    def test_delete_clears_pinout_image(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        client.post(
            f"/api/v1/assets/{asset_id}/pinout-image",
            files={"file": ("connector.png", b"fake-image-bytes", "image/png")},
            headers=auth_headers,
        )
        response = client.delete(f"/api/v1/assets/{asset_id}/pinout-image", headers=auth_headers)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["pinout_image_id"] is None
        assert body["pinout_image_url"] is None

    def test_upload_rejects_non_image_content_type(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        response = client.post(
            f"/api/v1/assets/{created_asset['id']}/pinout-image",
            files={"file": ("doc.pdf", b"%PDF-1.4", "application/pdf")},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_upload_nonexistent_asset_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        response = client.post(
            f"/api/v1/assets/{uuid.uuid4()}/pinout-image",
            files={"file": ("connector.png", b"fake-image-bytes", "image/png")},
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_upload_unauthenticated_is_rejected(
        self, client: TestClient, created_asset: dict
    ) -> None:
        response = client.post(
            f"/api/v1/assets/{created_asset['id']}/pinout-image",
            files={"file": ("connector.png", b"fake-image-bytes", "image/png")},
        )
        assert response.status_code == 403


class TestMechanicalImage:
    def test_upload_sets_mechanical_image(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        response = client.post(
            f"/api/v1/assets/{asset_id}/mechanical-image",
            files={"file": ("drawing.png", b"fake-image-bytes", "image/png")},
            headers=auth_headers,
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["mechanical_image_id"] is not None
        assert body["mechanical_image_url"]

    def test_delete_clears_mechanical_image(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        client.post(
            f"/api/v1/assets/{asset_id}/mechanical-image",
            files={"file": ("drawing.png", b"fake-image-bytes", "image/png")},
            headers=auth_headers,
        )
        response = client.delete(f"/api/v1/assets/{asset_id}/mechanical-image", headers=auth_headers)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["mechanical_image_id"] is None
        assert body["mechanical_image_url"] is None

    def test_pinout_and_mechanical_images_are_independent(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        client.post(
            f"/api/v1/assets/{asset_id}/pinout-image",
            files={"file": ("connector.png", b"pinout-bytes", "image/png")},
            headers=auth_headers,
        )
        response = client.post(
            f"/api/v1/assets/{asset_id}/mechanical-image",
            files={"file": ("drawing.png", b"mech-bytes", "image/png")},
            headers=auth_headers,
        )
        body = response.json()
        assert body["pinout_image_id"] is not None
        assert body["mechanical_image_id"] is not None
        assert body["pinout_image_id"] != body["mechanical_image_id"]


class TestPinoutAndMechanicalTables:
    def test_update_pinout_table(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        rows = [
            {"pin_number": 1, "signal_name": "GND", "wire_colors": ["#000000"], "description": "Ground", "x": None, "y": None},
            {"pin_number": 2, "signal_name": "VCC", "wire_colors": ["#dc2626", "#eab308"], "description": "", "x": 50.0, "y": 25.0},
        ]
        response = client.put(
            f"/api/v1/assets/{asset_id}",
            json={"pinout_table": rows},
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["pinout_table"] == rows

    def test_update_mechanical_table(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        rows = [{"point_label": "M4-A", "type": "Screw", "torque_spec": "1.2 Nm", "description": ""}]
        response = client.put(
            f"/api/v1/assets/{asset_id}",
            json={"mechanical_table": rows},
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["mechanical_table"] == rows

    def test_update_pinout_table_does_not_touch_mechanical_table(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        mech_rows = [{"point_label": "M4-A", "type": "Screw", "torque_spec": "1.2 Nm", "description": ""}]
        client.put(f"/api/v1/assets/{asset_id}", json={"mechanical_table": mech_rows}, headers=auth_headers)

        pin_rows = [{"pin_number": 1, "signal_name": "GND", "wire_colors": None, "description": "", "x": None, "y": None}]
        response = client.put(f"/api/v1/assets/{asset_id}", json={"pinout_table": pin_rows}, headers=auth_headers)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["pinout_table"] == pin_rows
        assert body["mechanical_table"] == mech_rows


class TestCadFiles:
    def test_list_empty(self, client: TestClient, auth_headers: dict, created_asset: dict) -> None:
        response = client.get(f"/api/v1/assets/{created_asset['id']}/cad-files", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == []

    def test_upload_and_list_stl(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        upload = client.post(
            f"/api/v1/assets/{asset_id}/cad-files",
            files={"file": ("model.stl", b"solid cube\nendsolid cube\n", "application/octet-stream")},
            headers=auth_headers,
        )
        assert upload.status_code == 201, upload.text
        body = upload.json()
        assert body["original_filename"] == "model.stl"
        assert body["url"]

        listed = client.get(f"/api/v1/assets/{asset_id}/cad-files", headers=auth_headers).json()
        assert len(listed) == 1
        assert listed[0]["id"] == body["id"]

    def test_upload_accepts_step_and_iges(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        for filename in ("part.step", "part.stp", "part.iges", "part.igs", "part.brep"):
            response = client.post(
                f"/api/v1/assets/{asset_id}/cad-files",
                files={"file": (filename, b"dummy-cad-bytes", "application/octet-stream")},
                headers=auth_headers,
            )
            assert response.status_code == 201, f"{filename}: {response.text}"

    def test_upload_rejects_unsupported_extension(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        response = client.post(
            f"/api/v1/assets/{created_asset['id']}/cad-files",
            files={"file": ("notes.txt", b"not a cad file", "text/plain")},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_upload_rejects_oversized_file(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        oversized = b"0" * (50 * 1024 * 1024 + 1)
        response = client.post(
            f"/api/v1/assets/{created_asset['id']}/cad-files",
            files={"file": ("big.stl", oversized, "application/octet-stream")},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_delete_cad_file(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        uploaded = client.post(
            f"/api/v1/assets/{asset_id}/cad-files",
            files={"file": ("model.stl", b"solid cube\nendsolid cube\n", "application/octet-stream")},
            headers=auth_headers,
        ).json()

        response = client.delete(f"/api/v1/assets/{asset_id}/cad-files/{uploaded['id']}", headers=auth_headers)
        assert response.status_code == 204

        listed = client.get(f"/api/v1/assets/{asset_id}/cad-files", headers=auth_headers).json()
        assert listed == []

    def test_cad_files_do_not_appear_in_general_files_list(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        client.post(
            f"/api/v1/assets/{asset_id}/cad-files",
            files={"file": ("model.stl", b"solid cube\nendsolid cube\n", "application/octet-stream")},
            headers=auth_headers,
        )
        general_files = client.get(f"/api/v1/assets/{asset_id}/files", headers=auth_headers).json()
        assert general_files == []

    def test_upload_nonexistent_asset_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        response = client.post(
            f"/api/v1/assets/{uuid.uuid4()}/cad-files",
            files={"file": ("model.stl", b"solid cube\nendsolid cube\n", "application/octet-stream")},
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_upload_unauthenticated_is_rejected(
        self, client: TestClient, created_asset: dict
    ) -> None:
        response = client.post(
            f"/api/v1/assets/{created_asset['id']}/cad-files",
            files={"file": ("model.stl", b"solid cube\nendsolid cube\n", "application/octet-stream")},
        )
        assert response.status_code == 403


class TestExportImportIncludesInterfaceAndCad:
    def test_export_includes_mechanical_image_flag_and_cad_files(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        client.post(
            f"/api/v1/assets/{asset_id}/mechanical-image",
            files={"file": ("drawing.png", b"mech-bytes", "image/png")},
            headers=auth_headers,
        )
        client.post(
            f"/api/v1/assets/{asset_id}/cad-files",
            files={"file": ("model.stl", b"solid cube\nendsolid cube\n", "application/octet-stream")},
            headers=auth_headers,
        )

        response = client.get(f"/api/v1/assets/{asset_id}/export", headers=auth_headers)
        assert response.status_code == 200

        import yaml
        with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
            names = zf.namelist()
            asset_folder = created_asset["asset_id"]
            assert any(n.startswith(f"{asset_folder}/media/mechanical_image") for n in names)
            assert any(n.startswith(f"{asset_folder}/media/cad/") for n in names)
            data = yaml.safe_load(zf.read(f"{asset_folder}/asset.yaml"))
        assert data["asset"]["has_mechanical_image"] is True
        assert len(data["cad_files"]) == 1
        assert data["cad_files"][0]["original_filename"] == "model.stl"


class TestDuplicateAssetCopiesFiles:
    """Regression: duplicating an asset must copy its picture, pinout/mechanical
    images, mechanical_table, and CAD files to the new asset — and each file must
    become its own independent storage object, not a shared reference. Sharing
    would mean deleting/replacing either asset's file deletes it out from under
    the other (see _copy_asset_file's docstring in api/v1/assets.py)."""

    def test_duplicate_leaves_serial_number_blank_and_skips_calibrations(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        client.put(f"/api/v1/assets/{asset_id}", json={"serial_number": "SN-ORIGINAL"}, headers=auth_headers)
        client.post(
            "/api/v1/calibrations",
            json={
                "asset_id": asset_id,
                "calibration_date": "2024-03-15",
                "due_date": "2025-03-15",
                "performed_by_name": "Lab Tech",
            },
            headers=auth_headers,
        )

        new_id = make_asset_id()
        response = client.post(
            f"/api/v1/assets/{asset_id}/duplicate", json={"new_asset_id": new_id}, headers=auth_headers
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["serial_number"] is None
        assert body["name"] == created_asset["name"]
        assert body["manufacturer"] == created_asset["manufacturer"]

        cals = client.get(f"/api/v1/assets/{body['id']}/calibrations", headers=auth_headers).json()
        assert cals == []

    def test_duplicate_rejects_existing_asset_id(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        response = client.post(
            f"/api/v1/assets/{created_asset['id']}/duplicate",
            json={"new_asset_id": created_asset["asset_id"]},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_duplicate_copies_picture_pinout_mechanical_and_table(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        client.post(
            f"/api/v1/assets/{asset_id}/picture",
            files={"file": ("photo.png", b"picture-bytes", "image/png")},
            headers=auth_headers,
        )
        client.post(
            f"/api/v1/assets/{asset_id}/pinout-image",
            files={"file": ("connector.png", b"pinout-bytes", "image/png")},
            headers=auth_headers,
        )
        client.post(
            f"/api/v1/assets/{asset_id}/mechanical-image",
            files={"file": ("drawing.png", b"mech-bytes", "image/png")},
            headers=auth_headers,
        )
        mech_rows = [{"point_label": "M4-A", "type": "Screw", "torque_spec": "1.2 Nm", "description": ""}]
        client.put(f"/api/v1/assets/{asset_id}", json={"mechanical_table": mech_rows}, headers=auth_headers)
        source = client.get(f"/api/v1/assets/{asset_id}", headers=auth_headers).json()

        new_id = make_asset_id()
        dup = client.post(
            f"/api/v1/assets/{asset_id}/duplicate", json={"new_asset_id": new_id}, headers=auth_headers
        ).json()

        assert dup["picture_id"] is not None
        assert dup["picture_id"] != source["picture_id"]
        assert dup["picture_url"]

        assert dup["pinout_image_id"] is not None
        assert dup["pinout_image_id"] != source["pinout_image_id"]
        assert dup["pinout_image_url"]

        assert dup["mechanical_image_id"] is not None
        assert dup["mechanical_image_id"] != source["mechanical_image_id"]
        assert dup["mechanical_image_url"]

        assert dup["mechanical_table"] == mech_rows

    def test_duplicate_copies_cad_files_independently(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        client.post(
            f"/api/v1/assets/{asset_id}/cad-files",
            files={"file": ("model.stl", b"solid cube\nendsolid cube\n", "application/octet-stream")},
            headers=auth_headers,
        )

        new_id = make_asset_id()
        dup = client.post(
            f"/api/v1/assets/{asset_id}/duplicate", json={"new_asset_id": new_id}, headers=auth_headers
        ).json()

        dup_cad = client.get(f"/api/v1/assets/{dup['id']}/cad-files", headers=auth_headers).json()
        assert len(dup_cad) == 1
        assert dup_cad[0]["original_filename"] == "model.stl"

        source_cad = client.get(f"/api/v1/assets/{asset_id}/cad-files", headers=auth_headers).json()
        assert dup_cad[0]["id"] != source_cad[0]["id"]

    def test_deleting_source_picture_does_not_break_duplicates_picture(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        asset_id = created_asset["id"]
        client.post(
            f"/api/v1/assets/{asset_id}/picture",
            files={"file": ("photo.png", b"picture-bytes", "image/png")},
            headers=auth_headers,
        )
        new_id = make_asset_id()
        dup = client.post(
            f"/api/v1/assets/{asset_id}/duplicate", json={"new_asset_id": new_id}, headers=auth_headers
        ).json()

        response = client.delete(f"/api/v1/assets/{asset_id}/picture", headers=auth_headers)
        assert response.status_code == 200

        dup_after = client.get(f"/api/v1/assets/{dup['id']}", headers=auth_headers).json()
        assert dup_after["picture_id"] == dup["picture_id"]
        assert dup_after["picture_url"]

    def test_duplicate_of_asset_with_no_files_succeeds(
        self, client: TestClient, auth_headers: dict, created_asset: dict
    ) -> None:
        new_id = make_asset_id()
        response = client.post(
            f"/api/v1/assets/{created_asset['id']}/duplicate", json={"new_asset_id": new_id}, headers=auth_headers
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["picture_id"] is None
        assert body["pinout_image_id"] is None
        assert body["mechanical_image_id"] is None
