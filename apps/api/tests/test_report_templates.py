"""
Tests for report template assignment/resolution: a sensor channel's default template, a
calibration's per-record override (persisted, edit-rights-gated), document-template export/
import, and — the real end-to-end check — generating an actual PDF from a published editor
(JSON) template via the new document_to_latex -> Tectonic pipeline.
"""
import io
import json
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


@pytest.fixture()
def asset(client: TestClient, auth_headers: dict) -> dict:
    payload = {
        "asset_id": make_asset_id(),
        "asset_type": "sensor",
        "name": "Report Template Test Sensor",
        "manufacturer": "Fluke",
        "model": "724",
        "sensor_channels": [
            {"channel_id": "CH1", "physical_quantity": "temperature", "unit": "°C"}
        ],
    }
    r = client.post("/api/v1/assets", json=payload, headers=auth_headers)
    assert r.status_code == 201, r.text
    return r.json()


def _atomic_payload(asset_id: str, sensor_id: str | None = None) -> dict:
    return {
        "asset_id": asset_id,
        "calibration_date": "2025-01-15",
        "due_date": "2026-01-15",
        "performed_by_name": "Lab Auto",
        "calibration_type": "external_accredited_lab",
        "external_lab_name": "ACME Calibration",
        "calibration_interval": 12,
        "calibration_version": 1,
        **({"sensor_id": sensor_id} if sensor_id else {}),
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
                "point_index": 0, "reference_value": 0.0, "measured_value": 0.02,
                "calculated_value": 0.02, "residual_abs": -0.01, "residual_pct": -0.04,
                "reference_unit": "°C", "measured_unit": "°C",
            },
            {
                "point_index": 1, "reference_value": 50.0, "measured_value": 50.04,
                "calculated_value": 50.03, "residual_abs": -0.01, "residual_pct": -0.02,
                "reference_unit": "°C", "measured_unit": "°C",
            },
        ],
    }


def _create_published_document_template(client: TestClient, auth_headers: dict, *, name: str = "Test Editor Certificate") -> dict:
    created = client.post(
        "/api/v1/document-templates", json={"name": name, "type": "certificate"}, headers=auth_headers
    ).json()
    document = {
        "settings": {
            "page_size": "a4", "orientation": "portrait",
            "margins": {"top": 20, "right": 18, "bottom": 20, "left": 18},
            "default_font": "Inter", "default_font_size": 10,
            "header_enabled": True, "footer_enabled": True,
        },
        "header": {"enabled": True, "height": 14, "blocks": []},
        "footer": {"enabled": True, "height": 14, "blocks": []},
        "blocks": [
            {
                "id": "b1", "type": "heading", "level": 1,
                "content": {
                    "runs": [{"text": "Calibration Certificate"}],
                    "align": "left", "list": None, "line_height": 1.4, "spacing_before": 0, "spacing_after": 8,
                },
            },
            {
                "id": "b2", "type": "paragraph",
                "content": {
                    "runs": [
                        {"text": "Asset: "},
                        {"text": "{{asset.id}}", "variable": "asset.id"},
                    ],
                    "align": "left", "list": None, "line_height": 1.4, "spacing_before": 0, "spacing_after": 8,
                },
            },
            {
                "id": "b3", "type": "table", "header_row": True, "bordered": True, "repeat": "measurements",
                "columns": [{"width": None}, {"width": None}, {"width": None}],
                "rows": [
                    [
                        {"content": {"runs": [{"text": "Reference"}], "align": "left", "list": None, "line_height": 1.4, "spacing_before": 0, "spacing_after": 0}},
                        {"content": {"runs": [{"text": "Measured"}], "align": "left", "list": None, "line_height": 1.4, "spacing_before": 0, "spacing_after": 0}},
                        {"content": {"runs": [{"text": "Fitted"}], "align": "left", "list": None, "line_height": 1.4, "spacing_before": 0, "spacing_after": 0}},
                    ],
                    [
                        {"content": {"runs": [{"text": "{{measurement.reference}}", "variable": "measurement.reference"}], "align": "left", "list": None, "line_height": 1.4, "spacing_before": 0, "spacing_after": 0}},
                        {"content": {"runs": [{"text": "{{measurement.measured}}", "variable": "measurement.measured"}], "align": "left", "list": None, "line_height": 1.4, "spacing_before": 0, "spacing_after": 0}},
                        {"content": {"runs": [{"text": "{{measurement.fitted}}", "variable": "measurement.fitted"}], "align": "left", "list": None, "line_height": 1.4, "spacing_before": 0, "spacing_after": 0}},
                    ],
                ],
            },
        ],
    }
    r = client.put(f"/api/v1/document-templates/{created['id']}", json={"document": document}, headers=auth_headers)
    assert r.status_code == 200, r.text
    published = client.post(f"/api/v1/document-templates/{created['id']}/publish", headers=auth_headers)
    assert published.status_code == 200, published.text
    return published.json()


# ---------------------------------------------------------------------------
# Document template export / import
# ---------------------------------------------------------------------------

class TestExportImport:
    def test_export_then_import_round_trips(self, client: TestClient, auth_headers: dict) -> None:
        created = client.post(
            "/api/v1/document-templates", json={"name": "Export Me", "type": "certificate"}, headers=auth_headers
        ).json()
        exported = client.get(f"/api/v1/document-templates/{created['id']}/export", headers=auth_headers)
        assert exported.status_code == 200, exported.text
        payload = json.loads(exported.content)
        assert payload["name"] == "Export Me"
        assert payload["type"] == "certificate"
        assert "document" in payload

        imported = client.post(
            "/api/v1/document-templates/import",
            files={"file": ("template.json", io.BytesIO(exported.content), "application/json")},
            headers=auth_headers,
        )
        assert imported.status_code == 201, imported.text
        body = imported.json()
        assert body["name"] == "Export Me"
        assert body["status"] == "draft"
        assert body["version"] == 1
        assert body["template_group_id"] != created["template_group_id"]

    def test_import_rejects_malformed_json(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/document-templates/import",
            files={"file": ("bad.json", io.BytesIO(b"not json"), "application/json")},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_import_rejects_missing_document(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(
            "/api/v1/document-templates/import",
            files={"file": ("bad.json", io.BytesIO(json.dumps({"name": "X", "type": "certificate"}).encode()), "application/json")},
            headers=auth_headers,
        )
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Channel default template
# ---------------------------------------------------------------------------

class TestChannelDefaultTemplate:
    def test_assign_document_template_as_channel_default(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        template = _create_published_document_template(client, auth_headers)
        ch = asset["sensor_channels"][0]
        r = client.put(
            f"/api/v1/assets/{asset['id']}",
            json={"sensor_channels": [{**{k: ch[k] for k in ("channel_id", "physical_quantity", "unit")}, "sensor_id": ch["id"], "default_document_template_id": template["id"]}]},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        updated_ch = r.json()["sensor_channels"][0]
        assert updated_ch["default_document_template_id"] == template["id"]
        assert updated_ch["default_document_template_name"] == template["name"]


# ---------------------------------------------------------------------------
# Calibration report-template override
# ---------------------------------------------------------------------------

class TestSetReportTemplate:
    def test_set_and_clear_override(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        template = _create_published_document_template(client, auth_headers, name="Override Template")
        cal = client.post("/api/v1/calibrations", json=_atomic_payload(asset["id"]), headers=auth_headers).json()

        r = client.put(
            f"/api/v1/calibrations/{cal['id']}/report-template",
            json={"document_template_id": template["id"]},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["report_document_template_id"] == template["id"]

        cleared = client.put(
            f"/api/v1/calibrations/{cal['id']}/report-template",
            json={},
            headers=auth_headers,
        )
        assert cleared.status_code == 200, cleared.text
        assert cleared.json()["report_document_template_id"] is None

    def test_rejects_both_kinds_set(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        cal = client.post("/api/v1/calibrations", json=_atomic_payload(asset["id"]), headers=auth_headers).json()
        r = client.put(
            f"/api/v1/calibrations/{cal['id']}/report-template",
            json={"certificate_template_id": str(uuid.uuid4()), "document_template_id": str(uuid.uuid4())},
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_rejects_unpublished_document_template(self, client: TestClient, auth_headers: dict, asset: dict) -> None:
        draft = client.post(
            "/api/v1/document-templates", json={"name": "Still Draft", "type": "certificate"}, headers=auth_headers
        ).json()
        cal = client.post("/api/v1/calibrations", json=_atomic_payload(asset["id"]), headers=auth_headers).json()
        r = client.put(
            f"/api/v1/calibrations/{cal['id']}/report-template",
            json={"document_template_id": draft["id"]},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_viewer_cannot_set_override(self, client: TestClient, auth_headers: dict, db: Session, asset: dict) -> None:
        cal = client.post("/api/v1/calibrations", json=_atomic_payload(asset["id"]), headers=auth_headers).json()
        r = client.put(
            f"/api/v1/calibrations/{cal['id']}/report-template",
            json={},
            headers=_viewer_headers(db),
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# End-to-end: a published editor template actually renders a real PDF
# ---------------------------------------------------------------------------

class TestDocumentTemplateReportGeneration:
    def test_calibration_override_generates_pdf_from_editor_template(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        template = _create_published_document_template(client, auth_headers, name="E2E Editor Certificate")
        cal = client.post("/api/v1/calibrations", json=_atomic_payload(asset["id"]), headers=auth_headers).json()
        client.put(
            f"/api/v1/calibrations/{cal['id']}/report-template",
            json={"document_template_id": template["id"]},
            headers=auth_headers,
        )

        r = client.get(f"/api/v1/calibrations/{cal['id']}/certificate/download", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF-")

    def test_sensor_default_document_template_is_used_when_no_override(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        template = _create_published_document_template(client, auth_headers, name="Sensor Default Editor Certificate")
        ch = asset["sensor_channels"][0]
        client.put(
            f"/api/v1/assets/{asset['id']}",
            json={"sensor_channels": [{**{k: ch[k] for k in ("channel_id", "physical_quantity", "unit")}, "sensor_id": ch["id"], "default_document_template_id": template["id"]}]},
            headers=auth_headers,
        )
        cal = client.post(
            "/api/v1/calibrations", json=_atomic_payload(asset["id"], sensor_id=ch["id"]), headers=auth_headers
        ).json()

        r = client.get(f"/api/v1/calibrations/{cal['id']}/certificate/download", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.content.startswith(b"%PDF-")

    def test_certificate_templates_list_includes_published_document_templates(
        self, client: TestClient, auth_headers: dict, asset: dict
    ) -> None:
        template = _create_published_document_template(client, auth_headers, name="Listed Editor Certificate")
        cal = client.post("/api/v1/calibrations", json=_atomic_payload(asset["id"]), headers=auth_headers).json()
        r = client.get(f"/api/v1/calibrations/{cal['id']}/certificate-templates", headers=auth_headers)
        assert r.status_code == 200, r.text
        matches = [t for t in r.json() if t["id"] == template["id"]]
        assert len(matches) == 1
        assert matches[0]["kind"] == "document"


# ---------------------------------------------------------------------------
# Admin "Templates" section UI rework: versioned upload/import, raw download,
# and a static-sample-data preview for editor templates.
# ---------------------------------------------------------------------------

def _default_tex_source() -> str:
    from pathlib import Path

    return (
        Path(__file__).resolve().parent.parent / "app" / "templates" / "certificates" / "default.tex.jinja"
    ).read_text(encoding="utf-8")


class TestCertificateTemplateVersionAndDownload:
    def test_upload_with_version_round_trips(self, client: TestClient, db: Session) -> None:
        headers = _superadmin_headers(db)
        r = client.post(
            "/api/v1/certificate-templates",
            files={"file": ("template.tex", _default_tex_source().encode("utf-8"), "text/x-tex")},
            data={"name": "Versioned Cert", "is_default": "false", "version": "7"},
            headers=headers,
        )
        assert r.status_code == 201, r.text
        assert r.json()["version"] == 7

    def test_upload_without_version_defaults_to_one(self, client: TestClient, db: Session) -> None:
        headers = _superadmin_headers(db)
        r = client.post(
            "/api/v1/certificate-templates",
            files={"file": ("template.tex", _default_tex_source().encode("utf-8"), "text/x-tex")},
            data={"name": "Default Version Cert", "is_default": "false"},
            headers=headers,
        )
        assert r.status_code == 201, r.text
        assert r.json()["version"] == 1

    def test_download_returns_original_bytes(self, client: TestClient, db: Session) -> None:
        headers = _superadmin_headers(db)
        source = _default_tex_source()
        created = client.post(
            "/api/v1/certificate-templates",
            files={"file": ("template.tex", source.encode("utf-8"), "text/x-tex")},
            data={"name": "Download Me", "is_default": "false"},
            headers=headers,
        ).json()
        r = client.get(f"/api/v1/certificate-templates/{created['id']}/download", headers=headers)
        assert r.status_code == 200, r.text
        assert r.content.decode("utf-8") == source
        assert "attachment" in r.headers["content-disposition"]

    def test_download_unknown_template_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get(f"/api/v1/certificate-templates/{uuid.uuid4()}/download", headers=auth_headers)
        assert r.status_code == 404


class TestDocumentTemplatePreviewAndImportVersion:
    def test_preview_renders_pdf_for_a_draft(self, client: TestClient, auth_headers: dict) -> None:
        created = client.post(
            "/api/v1/document-templates", json={"name": "Draft Preview", "type": "certificate"}, headers=auth_headers
        ).json()
        r = client.post(f"/api/v1/document-templates/{created['id']}/preview", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF-")

    def test_preview_renders_pdf_for_a_published_template_with_content(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        template = _create_published_document_template(client, auth_headers, name="Preview With Content")
        r = client.post(f"/api/v1/document-templates/{template['id']}/preview", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.content.startswith(b"%PDF-")

    def test_preview_unknown_template_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        r = client.post(f"/api/v1/document-templates/{uuid.uuid4()}/preview", headers=auth_headers)
        assert r.status_code == 404

    def test_import_with_version_sets_starting_version(self, client: TestClient, auth_headers: dict) -> None:
        created = client.post(
            "/api/v1/document-templates", json={"name": "Export Then Reimport", "type": "certificate"}, headers=auth_headers
        ).json()
        exported = client.get(f"/api/v1/document-templates/{created['id']}/export", headers=auth_headers)

        imported = client.post(
            "/api/v1/document-templates/import",
            files={"file": ("template.json", io.BytesIO(exported.content), "application/json")},
            data={"version": "3"},
            headers=auth_headers,
        )
        assert imported.status_code == 201, imported.text
        assert imported.json()["version"] == 3

    def test_import_with_name_override(self, client: TestClient, auth_headers: dict) -> None:
        created = client.post(
            "/api/v1/document-templates", json={"name": "Original Name", "type": "certificate"}, headers=auth_headers
        ).json()
        exported = client.get(f"/api/v1/document-templates/{created['id']}/export", headers=auth_headers)

        imported = client.post(
            "/api/v1/document-templates/import",
            files={"file": ("template.json", io.BytesIO(exported.content), "application/json")},
            data={"name": "Renamed On Import"},
            headers=auth_headers,
        )
        assert imported.status_code == 201, imported.text
        assert imported.json()["name"] == "Renamed On Import"
