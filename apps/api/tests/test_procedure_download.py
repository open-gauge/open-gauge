"""
Tests for "Download a procedure as PDF" (GET /procedures/{id}/download): rendering with the
built-in default procedure template, rendering with a specific published procedure document
template, and the guardrails around template kind/status.
"""
import uuid

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient


def _procedure_payload() -> dict:
    return {
        "proc_id": f"PROC-{uuid.uuid4().hex[:8]}",
        "physical_quantity": "pressure",
        "name": "Pressure Gauge Calibration Procedure",
        "description": "Comparison calibration against a reference pressure standard.",
        "version": "1.0",
        "difficulty": "intermediate",
        "standard_ref": "ISO 5171",
        "author": "Casey Morgan",
        "duration_min": 45,
        "tags": ["pressure", "comparison"],
        "equipment": [{"name": "Reference pressure standard", "model": "Druck DPI 620"}],
        "materials": [{"name": "Thread sealant tape", "quantity": "1 roll"}],
        "environment": [{"parameter": "Ambient temperature", "value": "20 ± 2 °C"}],
        "safety_notes": ["Depressurize the system before disconnecting fittings."],
        "steps": [
            {"title": "Zero the reference standard", "description": "Vent both ports to atmosphere.", "duration_min": 5},
            {"title": "Apply test pressures", "description": "Apply 0/25/50/75/100% of full scale.", "duration_min": 25},
        ],
        "acceptance_criteria": [{"label": "Maximum permissible error", "limit": "± 0.5 %FS"}],
    }


@pytest.fixture()
def procedure(client: TestClient, auth_headers: dict) -> dict:
    r = client.post("/api/v1/procedures", json=_procedure_payload(), headers=auth_headers)
    assert r.status_code == 201, r.text
    return r.json()


def _rich(text: str, variable: str | None = None) -> dict:
    run: dict = {"text": text}
    if variable:
        run["variable"] = variable
    return {"runs": [run], "align": "left", "list": None, "line_height": 1.4, "spacing_before": 0, "spacing_after": 8}


def _create_published_procedure_template(client: TestClient, auth_headers: dict, *, name: str = "Test Procedure Template") -> dict:
    created = client.post(
        "/api/v1/document-templates", json={"name": name, "type": "procedure"}, headers=auth_headers
    ).json()
    document = {
        "settings": {
            "page_size": "a4", "orientation": "portrait",
            "margins": {"top": 20, "right": 18, "bottom": 20, "left": 18},
            "default_font": "Inter", "default_font_size": 10,
            "header_enabled": False, "footer_enabled": False,
        },
        "header": {"enabled": False, "height": 14, "blocks": []},
        "footer": {"enabled": False, "height": 14, "blocks": []},
        "blocks": [
            {"id": "b1", "type": "heading", "level": 1, "content": _rich("Procedure Title", "procedure.title")},
            {
                "id": "b2", "type": "table", "header_row": True, "bordered": True, "repeat": "steps",
                "columns": [{"width": None}, {"width": None}],
                "rows": [
                    [{"content": _rich("Title")}, {"content": _rich("Description")}],
                    [{"content": _rich("Step title", "step.title")}, {"content": _rich("Step description", "step.description")}],
                ],
            },
        ],
    }
    r = client.put(f"/api/v1/document-templates/{created['id']}", json={"document": document}, headers=auth_headers)
    assert r.status_code == 200, r.text
    published = client.post(f"/api/v1/document-templates/{created['id']}/publish", headers=auth_headers)
    assert published.status_code == 200, published.text
    return published.json()


class TestDownloadProcedurePdf:
    def test_download_with_built_in_default_template(self, client: TestClient, auth_headers: dict, procedure: dict) -> None:
        r = client.get(f"/api/v1/procedures/{procedure['id']}/download", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF-")
        assert "attachment" in r.headers["content-disposition"]

    def test_download_with_published_procedure_template(self, client: TestClient, auth_headers: dict, procedure: dict) -> None:
        template = _create_published_procedure_template(client, auth_headers)
        r = client.get(
            f"/api/v1/procedures/{procedure['id']}/download",
            params={"document_template_id": template["id"]},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        assert r.content.startswith(b"%PDF-")

    def test_download_rejects_certificate_type_template(self, client: TestClient, auth_headers: dict, procedure: dict) -> None:
        created = client.post(
            "/api/v1/document-templates", json={"name": "A Certificate Template", "type": "certificate"}, headers=auth_headers
        ).json()
        published = client.post(f"/api/v1/document-templates/{created['id']}/publish", headers=auth_headers).json()
        r = client.get(
            f"/api/v1/procedures/{procedure['id']}/download",
            params={"document_template_id": published["id"]},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_download_rejects_draft_template(self, client: TestClient, auth_headers: dict, procedure: dict) -> None:
        created = client.post(
            "/api/v1/document-templates", json={"name": "Still Draft", "type": "procedure"}, headers=auth_headers
        ).json()
        r = client.get(
            f"/api/v1/procedures/{procedure['id']}/download",
            params={"document_template_id": created["id"]},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_download_unknown_procedure_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get(f"/api/v1/procedures/{uuid.uuid4()}/download", headers=auth_headers)
        assert r.status_code == 404

    def test_download_creates_audit_log_entry(self, client: TestClient, auth_headers: dict, db: Session, procedure: dict) -> None:
        r = client.get(f"/api/v1/procedures/{procedure['id']}/download", headers=auth_headers)
        assert r.status_code == 200, r.text

        from app.models.audit_log import AuditLog

        log = (
            db.query(AuditLog)
            .filter(AuditLog.entity_id == uuid.UUID(procedure["id"]), AuditLog.action == "procedure.downloaded")
            .first()
        )
        assert log is not None


class TestPreviewProcedureTemplate:
    def test_preview_renders_pdf_with_procedure_sample_data(self, client: TestClient, auth_headers: dict) -> None:
        template = _create_published_procedure_template(client, auth_headers, name="Preview Me")
        r = client.post(f"/api/v1/document-templates/{template['id']}/preview", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.content.startswith(b"%PDF-")
