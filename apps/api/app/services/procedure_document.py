"""
Renders a standalone Procedure as a PDF, the same way certificate_service renders a calibration
report: build a flat dot-path context (+ `_collections` for repeating rows), hand it to
`document_template_latex.document_to_latex` together with a published "procedure" DocumentTemplate
(or the built-in default below), and compile the result with `latex_service.compile_tex`.

Unlike a calibration certificate, a procedure PDF documents the *method* itself, not one
calibration event — there's no technician/signature/organization to resolve, and no PAdES signing
step. See apps/web/src/lib/template-variables.ts's PROCEDURE_VARIABLE_CATEGORIES for the variable
catalog this mirrors, and apps/docs/content/docs/guide/procedures/index.mdx for the user-facing
explanation.
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from ..repositories import document_template as doctpl_repo

if TYPE_CHECKING:
    from ..models.calibration_method import Procedure
    from ..models.document_template import DocumentTemplate


def _s(value: object) -> str:
    """String-format a scalar for display, "—" for anything missing/empty."""
    if value is None or value == "":
        return "—"
    return str(value)


def _join(items: list[str] | None) -> str:
    return ", ".join(items) if items else "—"


# ---------------------------------------------------------------------------
# Real-data context (used by the actual "download PDF" endpoint)
# ---------------------------------------------------------------------------

def build_procedure_document_context(procedure: "Procedure") -> tuple[dict, dict[str, bytes]]:
    """Flat dot-path context + `_collections`, matching every category in
    apps/web/src/lib/template-variables.ts's PROCEDURE_VARIABLE_CATEGORIES. `approval` and
    `revision_history` have no backing fields on Procedure (no approval workflow or per-version
    history table exists) — they resolve to "—" / an empty collection rather than an unresolved
    `{{...}}` token, so a custom template referencing them still renders cleanly.
    """
    ctx: dict = {
        "equipment.asset_type": _s(procedure.physical_quantity),
        "equipment.name": "—",
        "equipment.model": "—",
        "procedure.number": _s(procedure.proc_id),
        "procedure.revision": _s(procedure.version),
        "procedure.title": _s(procedure.name),
        "procedure.standard_ref": _s(procedure.standard_ref),
        "procedure.description": _s(procedure.description),
        "procedure.author": _s(procedure.author),
        "procedure.duration_min": _s(procedure.duration_min),
        "procedure.tags": _join(procedure.tags),
        "procedure.physical_quantity": _s(procedure.physical_quantity),
        "procedure.difficulty": _s(procedure.difficulty),
        "user.name": "—",
        "user.email": "—",
        "user.role": "—",
        "approval.approver_name": "—",
        "approval.approved_date": "—",
        "approval.status": "—",
        "date.current": date.today().strftime("%d %b %Y"),
        "date.calibration": "—",
        "date.issue": "—",
        "date.expiration": "—",
    }
    ctx["_collections"] = {
        "required_equipment": [
            {"name": _s(item.get("name")), "model": _s(item.get("model"))}
            for item in (procedure.equipment or [])
        ],
        "materials": [
            {"name": _s(item.get("name")), "quantity": _s(item.get("quantity"))}
            for item in (procedure.materials or [])
        ],
        "environmental_conditions": [
            {"parameter": _s(item.get("parameter")), "value": _s(item.get("value"))}
            for item in (procedure.environment or [])
        ],
        "steps": [
            {
                "index": i + 1,
                "title": _s(step.get("title")),
                "description": _s(step.get("description")),
                "duration_min": _s(step.get("duration_min")),
            }
            for i, step in enumerate(procedure.steps or [])
        ],
        "acceptance_criteria": [
            {"label": _s(item.get("label")), "limit": _s(item.get("limit"))}
            for item in (procedure.acceptance_criteria or [])
        ],
        "safety_instructions": [{"text": note} for note in (procedure.safety_notes or [])],
        "revision_history": [],
    }
    return ctx, {}


# ---------------------------------------------------------------------------
# Static sample context (admin "preview a procedure template" mode)
# ---------------------------------------------------------------------------

def build_sample_procedure_context() -> tuple[dict, dict[str, bytes]]:
    """Static dot-path sample values for previewing an editor (JSON) procedure template with no
    real procedure on hand — mirrors template-variables.ts's PROCEDURE_VARIABLE_CATEGORIES sample
    catalog key-for-key. Deterministic, same spirit as certificate_service.build_sample_document_context."""
    ctx: dict = {
        "equipment.asset_type": "Pressure Gauge",
        "equipment.name": "Digital Pressure Calibrator",
        "equipment.model": "DPI 620",
        "procedure.number": "PROC-PRE-014",
        "procedure.revision": "Rev. C",
        "procedure.title": "Pressure Gauge Calibration Procedure",
        "procedure.standard_ref": "ISO 5171",
        "procedure.description": "Comparison calibration of a pressure gauge against a reference pressure standard across its full scale.",
        "procedure.author": "Casey Morgan",
        "procedure.duration_min": 45,
        "procedure.tags": "pressure, comparison, field",
        "procedure.physical_quantity": "Pressure",
        "procedure.difficulty": "Intermediate",
        "user.name": "Jordan Reyes",
        "user.email": "jordan.reyes@opengauge.example",
        "user.role": "Calibration Technician",
        "approval.approver_name": "Casey Morgan",
        "approval.approved_date": "12 Jul 2026",
        "approval.status": "Approved",
        "date.current": "28 Aug 2026",
        "date.calibration": "28 Aug 2026",
        "date.issue": "28 Aug 2026",
        "date.expiration": "28 Aug 2027",
    }
    ctx["_collections"] = {
        "required_equipment": [
            {"name": "Reference pressure standard", "model": "Druck DPI 620"},
            {"name": "Calibration hose assembly", "model": "DPI 620-HA"},
            {"name": "Adapter fitting kit", "model": "1/4 NPT"},
        ],
        "materials": [
            {"name": "Thread sealant tape", "quantity": "1 roll"},
            {"name": "Lint-free wipes", "quantity": "5"},
        ],
        "environmental_conditions": [
            {"parameter": "Ambient temperature", "value": "20 ± 2 °C"},
            {"parameter": "Relative humidity", "value": "< 70 %RH"},
            {"parameter": "Vibration", "value": "Negligible"},
        ],
        "steps": [
            {"index": 1, "title": "Zero the reference standard", "description": "Vent both ports to atmosphere and record the zero reading.", "duration_min": 5},
            {"index": 2, "title": "Connect the unit under test", "description": "Connect via the adapter fitting, checking for leaks.", "duration_min": 10},
            {"index": 3, "title": "Apply test pressures", "description": "Apply 0%, 25%, 50%, 75%, 100% of full scale, ascending then descending.", "duration_min": 25},
            {"index": 4, "title": "Record readings", "description": "Record the reference and unit-under-test readings at each point.", "duration_min": 5},
        ],
        "acceptance_criteria": [
            {"label": "Maximum permissible error", "limit": "± 0.5 %FS"},
            {"label": "Hysteresis", "limit": "± 0.2 %FS"},
            {"label": "Repeatability", "limit": "± 0.1 %FS"},
        ],
        "safety_instructions": [
            {"text": "Depressurize the system before disconnecting fittings."},
            {"text": "Wear eye protection when working with pressurized gas."},
        ],
        "revision_history": [
            {"version": "Rev. C", "date": "12 Jul 2026", "author": "Casey Morgan", "change_reason": "Updated acceptance criteria for new reference standard"},
            {"version": "Rev. B", "date": "03 Feb 2025", "author": "Alex Chen", "change_reason": "Added environmental condition limits"},
            {"version": "Rev. A", "date": "15 Sep 2023", "author": "Alex Chen", "change_reason": "Initial release"},
        ],
    }
    return ctx, {}


# ---------------------------------------------------------------------------
# Built-in default template (the "basic template" a fresh install renders with
# when no custom procedure template has been published yet)
# ---------------------------------------------------------------------------

def _rt(runs: list[dict], align: str = "left", spacing_after: int = 8, list_style: str | None = None) -> dict:
    return {"runs": runs, "align": align, "list": list_style, "line_height": 1.4, "spacing_before": 0, "spacing_after": spacing_after}


def _run(text: str, variable: str | None = None, bold: bool = False) -> dict:
    run: dict = {"text": text}
    if variable:
        run["variable"] = variable
    if bold:
        run["bold"] = True
    return run


def _cell(text: str, variable: str | None = None, spacing_after: int = 4) -> dict:
    return {"content": _rt([_run(text, variable)], spacing_after=spacing_after)}


def _repeating_table(collection_key: str, item_scope: str, columns: list[tuple[str, str]]) -> dict:
    """A table pre-bound to repeat over `collection_key` — a header row of labels, then one
    template row of variable-chip cells — the same shape the editor's "insert as table" shortcut
    produces (see apps/web/src/lib/template-blocks.ts::createRepeatingTableBlock)."""
    header = [_cell(label) for label, _field in columns]
    template_row = [_cell(label, f"{item_scope}.{field}") for label, field in columns]
    return {
        "id": f"tbl-{collection_key}",
        "type": "table",
        "columns": [{"width": None} for _ in columns],
        "header_row": True,
        "bordered": True,
        "border_color": None,
        "repeat": collection_key,
        "rows": [header, template_row],
    }


def _section(title: str, block_id: str) -> dict:
    return {"id": block_id, "type": "section", "title": title}


def default_procedure_document() -> dict:
    """The built-in "basic" procedure template — covers every field on the Procedure model, used
    whenever a download request doesn't name a specific published procedure template. Ships as an
    in-code block tree (no DB row, no `created_by`) so a fresh install can render a procedure PDF
    before any admin has authored a custom template, mirroring how certificates fall back to
    `templates/certificates/default.tex.jinja` with no DB row either."""
    return {
        "settings": {
            "page_size": "a4",
            "orientation": "portrait",
            "margins": {"top": 20, "right": 18, "bottom": 20, "left": 18},
            "default_font": "Inter",
            "default_font_size": 10,
            "header_enabled": True,
            "footer_enabled": True,
        },
        "header": {
            "enabled": True,
            "height": 14,
            # A single paragraph, not a "columns" block: fancyhdr re-executes header/footer
            # content on every page, and a `minipage` (what a columns block renders each column
            # as) corrupts TeX's box-allocation state on that re-execution — "Undefined control
            # sequence" at `\endminipage` on the second page. `parbox`-based content (a plain
            # paragraph, via `_header_footer_zone`) doesn't have that problem.
            "blocks": [
                {"id": "hdr-text", "type": "paragraph", "content": _rt(
                    [
                        _run("CALIBRATION PROCEDURE   ·   "),
                        _run("PROC-000", "procedure.number"),
                    ],
                    align="center", spacing_after=0,
                )},
            ],
        },
        "footer": {
            "enabled": True,
            "height": 12,
            "blocks": [
                {"id": "ftr-text", "type": "paragraph", "content": _rt(
                    [_run("Rev. "), _run("1.0", "procedure.revision"), _run("  ·  Generated "), _run("28 Aug 2026", "date.current")],
                    spacing_after=0,
                )},
            ],
        },
        "blocks": [
            {"id": "logo", "type": "image", "file_id": None, "url": None, "alt": "Organization logo", "width": 32, "align": "left"},
            {"id": "title", "type": "heading", "level": 1, "content": _rt([_run("Procedure Title", "procedure.title")], spacing_after=4)},
            {"id": "subtitle", "type": "paragraph", "content": _rt(
                [
                    _run("Standard: "), _run("ISO 5171", "procedure.standard_ref"),
                    _run("   ·   Physical quantity: "), _run("Pressure", "procedure.physical_quantity"),
                ],
                spacing_after=10,
            )},
            {"id": "divider-1", "type": "divider"},
            {
                "id": "meta",
                "type": "key_value",
                "columns": 2,
                "items": [
                    {"label": "Procedure ID", "variable": "procedure.number"},
                    {"label": "Revision", "variable": "procedure.revision"},
                    {"label": "Difficulty", "variable": "procedure.difficulty"},
                    {"label": "Author", "variable": "procedure.author"},
                    {"label": "Estimated duration (min)", "variable": "procedure.duration_min"},
                    {"label": "Tags", "variable": "procedure.tags"},
                ],
            },
            _section("Description", "sec-description"),
            {"id": "description", "type": "paragraph", "content": _rt([_run("Procedure description.", "procedure.description")])},
            _section("Required Equipment", "sec-equipment"),
            _repeating_table("required_equipment", "item", [("Name", "name"), ("Model", "model")]),
            _section("Materials", "sec-materials"),
            _repeating_table("materials", "material", [("Name", "name"), ("Quantity", "quantity")]),
            _section("Environmental Conditions", "sec-environment"),
            _repeating_table("environmental_conditions", "condition", [("Parameter", "parameter"), ("Value", "value")]),
            _section("Safety Instructions", "sec-safety"),
            _repeating_table("safety_instructions", "instruction", [("Instruction", "text")]),
            {"id": "page-break-steps", "type": "page_break"},
            _section("Procedure Steps", "sec-steps"),
            _repeating_table(
                "steps", "step",
                [("Step", "index"), ("Title", "title"), ("Description", "description"), ("Duration (min)", "duration_min")],
            ),
            _section("Acceptance Criteria", "sec-acceptance"),
            _repeating_table("acceptance_criteria", "criterion", [("Criterion", "label"), ("Limit", "limit")]),
        ],
    }


# ---------------------------------------------------------------------------
# PDF generation
# ---------------------------------------------------------------------------

def generate_procedure_pdf(
    db: Session, procedure: "Procedure", document_template_id: uuid.UUID | None, requested_by: uuid.UUID,
) -> bytes:
    """Live-renders `procedure` into a PDF using either a specific published, enabled "procedure"
    DocumentTemplate (`document_template_id`) or the org's current default (Admin -> Templates ->
    Procedures), which is always resolvable — `ensure_procedure_default_fallback` lazily creates
    the built-in Open Gauge template and marks it default the first time this runs on a fresh
    install with nothing configured yet. Raises ValueError if an explicit template_id doesn't
    resolve to a published, enabled procedure template."""
    from . import template_defaults_service
    from .certificate_service import resolve_uploaded_images
    from .document_template_latex import document_to_latex
    from .latex_service import compile_tex

    if document_template_id is not None:
        template: DocumentTemplate | None = doctpl_repo.get_by_id(db, document_template_id)
        if not template or template.type != "procedure" or template.status != "published" or not template.is_enabled:
            raise ValueError(f"Procedure template {document_template_id} not found, not published, or disabled")
    else:
        template_defaults_service.ensure_procedure_default_fallback(db, requested_by)
        template = doctpl_repo.get_default(db, type="procedure")
        if template is None:
            raise ValueError("No procedure template available")

    images_by_file_id = resolve_uploaded_images(db, template.document)
    context, images = build_procedure_document_context(procedure)
    tex_source = document_to_latex(template.document, context, images, images_by_file_id)
    return compile_tex(tex_source, images)
