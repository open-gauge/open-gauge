"""Converts an editor (JSON) document template into a complete .tex source, for compilation by
the existing Tectonic pipeline (`latex_service.compile_tex`) — no second PDF library, no second
Jinja pass. Values are resolved and escaped directly in Python as the string is built; only
equation blocks (already raw LaTeX source) and file paths are ever injected unescaped.

Shape reference: `apps/web/src/types/template.ts` (the JSON this walks) and
`apps/web/src/lib/template-preview.ts` (the same variable-resolution semantics, mirrored here for
real data instead of sample data — see `runPreviewText`'s `rowContext` handling in particular).
"""
from __future__ import annotations

import io
import logging
import re
from typing import Any

from .latex_service import latex_escape

logger = logging.getLogger(__name__)

# Collection key -> item scope, mirroring apps/web/src/lib/template-variables.ts's collection
# catalog key-for-key. "measurements" is the only one a calibration REPORT context populates
# (see certificate_service._build_document_template_context); the rest back a Calibration
# Procedure template (see procedure_document.build_procedure_document_context). Either way, a
# template referencing a collection its context doesn't populate just renders its template row
# zero times — no error, no unresolved placeholder.
_COLLECTION_ITEM_SCOPE = {
    "measurements": "measurement",
    "required_equipment": "item",
    "materials": "material",
    "environmental_conditions": "condition",
    "steps": "step",
    "acceptance_criteria": "criterion",
    "safety_instructions": "instruction",
}

_MM = "mm"


def _mm(value: float) -> str:
    return f"{value}{_MM}"


def _hex_color(value: str | None) -> str | None:
    if not value:
        return None
    v = value.lstrip("#")
    return v if len(v) == 6 else None


# ---------------------------------------------------------------------------
# Variable resolution (mirrors template-preview.ts's runPreviewText, for real data)
# ---------------------------------------------------------------------------

def _resolve_variable(variable: str, context: dict, row: dict | None, item_scope: str | None) -> str:
    if row is not None and item_scope and variable.startswith(f"{item_scope}."):
        field = variable[len(item_scope) + 1:]
        value = row.get(field)
    else:
        value = context.get(variable)
    if value is None:
        return f"{{{{{variable}}}}}"  # unresolved — keep visible rather than silently blank
    return str(value)


def _run_text(run: dict, context: dict, row: dict | None, item_scope: str | None) -> str:
    if run.get("variable"):
        text = _resolve_variable(run["variable"], context, row, item_scope)
    else:
        text = run.get("text", "")
    escaped = latex_escape(text)
    if run.get("bold"):
        escaped = rf"\textbf{{{escaped}}}"
    if run.get("italic"):
        escaped = rf"\textit{{{escaped}}}"
    if run.get("underline"):
        escaped = rf"\underline{{{escaped}}}"
    return escaped


def _rich_text(rt: dict, context: dict, row: dict | None = None, item_scope: str | None = None) -> str:
    body = "".join(_run_text(r, context, row, item_scope) for r in rt.get("runs", []))
    if rt.get("list") == "bullet":
        body = rf"\begin{{itemize}}\item {body}\end{{itemize}}"
    elif rt.get("list") == "number":
        body = rf"\begin{{enumerate}}\item {body}\end{{enumerate}}"
    align = rt.get("align", "left")
    if align == "center":
        return rf"{{\centering {body}\par}}"
    if align == "right":
        return rf"{{\raggedleft {body}\par}}"
    if align == "left":
        return rf"{{\raggedright {body}\par}}"
    return rf"{body}\par"  # justify — LaTeX's article-class default


# ---------------------------------------------------------------------------
# Block renderers
# ---------------------------------------------------------------------------

_HEADING_SIZE = {1: r"\Large", 2: r"\large", 3: r"\normalsize"}


def _render_heading(block: dict, context: dict) -> str:
    size = _HEADING_SIZE.get(block.get("level", 2), r"\large")
    return rf"{{{size}\bfseries {_rich_text(block['content'], context)}}}" + "\n\\vspace{2mm}\n"


def _render_paragraph(block: dict, context: dict) -> str:
    spacing = block["content"].get("spacing_after", 8)
    return _rich_text(block["content"], context) + f"\n\\vspace{{{spacing}pt}}\n"


def _render_divider(_block: dict, _context: dict) -> str:
    return r"\noindent\textcolor{gray}{\rule{\linewidth}{0.5pt}}" + "\n\\vspace{2mm}\n"


def _render_spacer(block: dict, _context: dict) -> str:
    return f"\\vspace{{{_mm(block.get('height', 8))}}}\n"


def _table_col_spec(columns: list[dict]) -> str:
    n = len(columns) or 1
    named = [c for c in columns if c.get("width")]
    total_named = sum(c["width"] for c in named)
    remaining_cols = n - len(named)
    remaining_pct = max(0.0, 100.0 - total_named)
    share = remaining_pct / remaining_cols if remaining_cols else 0.0
    specs = []
    for c in columns:
        pct = c["width"] if c.get("width") else share
        specs.append(f"p{{{pct / 100:.4f}\\linewidth}}")
    return "".join(f"@{{}}{s}" for s in specs) + "@{}"


def _table_row_cells(row: list[dict], context: dict, row_data: dict | None, item_scope: str | None) -> list[str]:
    cells = []
    for cell in row:
        text = _rich_text(cell["content"], context, row_data, item_scope)
        bg = _hex_color(cell.get("background"))
        if bg:
            text = f"\\cellcolor[HTML]{{{bg}}} {text}"
        span = cell.get("col_span", 1) or 1
        if span > 1:
            text = f"\\multicolumn{{{span}}}{{l}}{{{text}}}"
        cells.append(text)
    return cells


def _render_table(block: dict, context: dict) -> str:
    columns = block.get("columns", [])
    rows = block.get("rows", [])
    if not rows:
        return ""
    col_spec = _table_col_spec(columns)
    border_color = _hex_color(block.get("border_color"))
    rule_color = f"\\arrayrulecolor[HTML]{{{border_color}}}" if border_color else ""
    lines = [rule_color, f"\\begin{{longtable}}{{{col_spec}}}"]
    if block.get("bordered", True):
        lines.append(r"\toprule")

    header_row = block.get("header_row", False)
    template_index = len(rows) - 1
    collection_key = block.get("repeat")
    item_scope = _COLLECTION_ITEM_SCOPE.get(collection_key) if collection_key else None
    collection_rows = context.get("_collections", {}).get(collection_key, []) if collection_key else None

    for i, row in enumerate(rows):
        is_template = collection_key is not None and i == template_index and (not header_row or template_index > 0)
        if is_template:
            if collection_rows:
                for item in collection_rows:
                    cells = _table_row_cells(row, context, item, item_scope)
                    lines.append(" & ".join(cells) + r" \\")
            continue  # zero real rows if the collection is empty/unavailable — no placeholder row
        cells = _table_row_cells(row, context, None, None)
        line = " & ".join(cells) + r" \\"
        if header_row and i == 0:
            lines.append(line)
            if block.get("bordered", True):
                lines.append(r"\midrule")
            lines.append(r"\endhead")
        else:
            lines.append(line)

    if block.get("bordered", True):
        lines.append(r"\bottomrule")
    lines.append(r"\end{longtable}")
    if border_color:
        lines.append(r"\arrayrulecolor{black}")
    return "\n".join(lines) + "\n\\vspace{2mm}\n"


def _render_measurement_table(block: dict, context: dict) -> str:
    columns = block.get("columns", [])
    if not columns:
        return ""
    n = len(columns)
    col_spec = "".join("@{}l" for _ in range(n)) + "@{}"
    rows_data = context.get("_collections", {}).get("measurements", [])
    lines = [f"\\begin{{longtable}}{{{col_spec}}}"]
    if block.get("bordered", True):
        lines.append(r"\toprule")
    lines.append(" & ".join(rf"\bfseries {latex_escape(c['label'])}" for c in columns) + r" \\")
    if block.get("bordered", True):
        lines.append(r"\midrule")
    lines.append(r"\endhead")
    for item in rows_data:
        lines.append(" & ".join(latex_escape(item.get(c["key"], "—")) for c in columns) + r" \\")
    if block.get("bordered", True):
        lines.append(r"\bottomrule")
    lines.append(r"\end{longtable}")
    return "\n".join(lines) + "\n\\vspace{2mm}\n"


def _render_key_value(block: dict, context: dict) -> str:
    items = block.get("items", [])
    cols = block.get("columns", 1)
    col_spec = "@{}p{4cm}p{6cm}" * cols + "@{}"
    lines = [f"\\begin{{tabular}}{{{col_spec}}}"]
    for i in range(0, len(items), cols):
        pair = items[i:i + cols]
        cells = []
        for item in pair:
            value = _resolve_variable(item["variable"], context, None, None) if item.get("variable") else "—"
            cells.append(rf"\bfseries {latex_escape(item['label'])} & {latex_escape(value)}")
        # pad an odd trailing row so column count stays consistent
        while len(cells) < cols:
            cells.append(" & ")
        lines.append(" & ".join(cells) + r" \\")
    lines.append(r"\end{tabular}")
    return "\n".join(lines) + "\n\\vspace{2mm}\n"


def _render_equation(block: dict, _context: dict) -> str:
    latex = block.get("latex", "").strip()
    if not latex:
        return ""
    out = f"\\[\n{latex}\n\\]\n"
    if block.get("caption"):
        out += f"{{\\small\\itshape {latex_escape(block['caption'])}}}\\par\n"
    return out


def _series_from_collection(context: dict, variable: str) -> list[float]:
    item_scope = variable.split(".", 1)[0]
    collection_key = next((k for k, s in _COLLECTION_ITEM_SCOPE.items() if s == item_scope), None)
    if not collection_key:
        return []
    field = variable.split(".", 1)[1] if "." in variable else variable
    rows = context.get("_collections", {}).get(collection_key, [])
    out = []
    for row in rows:
        try:
            out.append(float(row.get(field)))
        except (TypeError, ValueError):
            continue
    return out


def _render_graph(block: dict, context: dict, images: dict[str, bytes]) -> str:
    x = _series_from_collection(context, block["x_variable"])
    y = _series_from_collection(context, block["y_variable"])
    if not x or not y or len(x) != len(y):
        # No matching series available (e.g. drift_over_time needs calibration HISTORY, not a
        # single calibration's data) — degrade to a labeled placeholder instead of failing the
        # whole document.
        title = latex_escape(block.get("title") or "Chart")
        return f"{{\\small\\itshape [{title}: no data available]}}\\par\n\\vspace{{2mm}}\n"

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    fig, ax = plt.subplots(figsize=(block.get("width", 160) / 25.4, block.get("height", 90) / 25.4), dpi=200)
    if block.get("kind") == "residual_plot":
        ax.scatter(x, y, s=14, color="#1b4f64")
        ax.axhline(0, color="#6b7280", linewidth=0.6)
    else:
        ax.scatter(x, y, s=14, color="#1b4f64", label="Data", zorder=3)
        if len(x) > 1:
            coeffs = np.polyfit(x, y, 1)
            xs = np.linspace(min(x), max(x), 100)
            ax.plot(xs, np.polyval(coeffs, xs), color="#2f819b", linewidth=1.3, label="Fit", zorder=2)
        if block.get("show_legend", True):
            ax.legend(fontsize=7, frameon=False)
    x_label = block.get("x_label") or block["x_variable"]
    y_label = block.get("y_label") or block["y_variable"]
    if block.get("x_unit"):
        x_label = f"{x_label} ({block['x_unit']})"
    if block.get("y_unit"):
        y_label = f"{y_label} ({block['y_unit']})"
    ax.set_xlabel(x_label, fontsize=8)
    ax.set_ylabel(y_label, fontsize=8)
    ax.tick_params(labelsize=7)
    if block.get("show_grid", True):
        ax.grid(True, linewidth=0.4, color="#e5e7eb")
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor="white")
    plt.close(fig)

    filename = f"graph_{block['id']}.png"
    images[filename] = buf.getvalue()
    width_mm = block.get("width", 160)
    return f"\\includegraphics[width={width_mm}mm]{{{filename}}}\\par\n\\vspace{{2mm}}\n"


def _render_image(block: dict, images_by_file_id: dict[str, bytes], images: dict[str, bytes]) -> str:
    file_id = block.get("file_id")
    data = images_by_file_id.get(file_id) if file_id else None
    if not data:
        return ""
    filename = f"image_{block['id']}.png"
    images[filename] = data
    width = block.get("width") or 80
    align_cmd = {"left": r"\raggedright", "center": r"\centering", "right": r"\raggedleft"}.get(block.get("align", "left"), "")
    return f"{{{align_cmd}\\includegraphics[width={width}mm]{{{filename}}}\\par}}\n\\vspace{{2mm}}\n"


def _render_qr_code(block: dict, context: dict, images: dict[str, bytes]) -> str:
    payload_type = block.get("payload_type", "asset_url")
    if payload_type == "custom":
        payload = block.get("custom_value") or ""
    elif payload_type == "variable" and block.get("variable"):
        payload = _resolve_variable(block["variable"], context, None, None)
    elif payload_type == "asset_id":
        payload = context.get("asset.id", "")
    elif payload_type == "certificate_id":
        payload = context.get("calibration.id", "")
    elif payload_type == "certificate_url":
        payload = context.get("calibration.certificate_url", "")
    else:
        payload = context.get("asset.public_url", "")
    if not payload:
        return ""

    import qrcode
    qr = qrcode.make(payload)
    buf = io.BytesIO()
    qr.save(buf, format="PNG")
    filename = f"qr_{block['id']}.png"
    images[filename] = buf.getvalue()
    size = block.get("size", 24)
    return f"\\includegraphics[width={size}mm]{{{filename}}}\n"


def _render_signature(block: dict, context: dict, images: dict[str, bytes]) -> str:
    mode = block.get("mode", "prepared_by")
    name = context.get("calibration.technician" if mode == "prepared_by" else "_checked_by_name", "")
    label = latex_escape(block.get("label") or ("Prepared by" if mode == "prepared_by" else "Checked by"))
    name_line = latex_escape(name) if name and name != "—" else "\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_"

    sig_bytes = context.get(f"_signature_{mode}_bytes")
    sig_block = ""
    if sig_bytes:
        filename = f"signature_{mode}.png"
        images[filename] = sig_bytes
        sig_block = f"\\includegraphics[height=12mm]{{{filename}}}\\par\n"
    return (
        f"\\vspace{{4mm}}{sig_block}\\noindent\\rule{{50mm}}{{0.4pt}}\\par\n"
        f"{{\\small {name_line}}}\\par\n"
        f"{{\\footnotesize\\color{{gray}} {label}}}\\par\n\\vspace{{2mm}}\n"
    )


def _render_date(block: dict, context: dict) -> str:
    variant = block.get("variant", "current")
    return latex_escape(context.get(f"date.{variant}", "—")) + "\n"


def _render_section(block: dict, _context: dict) -> str:
    title = latex_escape(block.get("title", ""))
    return (
        "\\vspace{3mm}\\noindent\\textcolor{gray}{\\rule{\\linewidth}{0.8pt}}\\par\n"
        f"{{\\small\\bfseries\\color{{gray}} {title.upper()}}}\\par\n\\vspace{{1mm}}\n"
    )


def _render_columns(block: dict, context: dict, images_by_file_id: dict[str, bytes], images: dict[str, bytes]) -> str:
    ratios = block.get("ratios") or [1] * len(block.get("columns", []))
    total = sum(ratios) or 1
    parts = []
    for col_blocks, ratio in zip(block.get("columns", []), ratios):
        width = ratio / total
        inner = "".join(_render_block(b, context, images_by_file_id, images) for b in col_blocks)
        parts.append(f"\\begin{{minipage}}[t]{{{width:.4f}\\linewidth}}\n{inner}\\end{{minipage}}%")
    return "\\noindent" + "\\hfill".join(parts) + "\n\\vspace{2mm}\n"


def _render_block(block: dict, context: dict, images_by_file_id: dict[str, bytes], images: dict[str, bytes]) -> str:
    block_type = block.get("type")
    if block_type == "heading":
        return _render_heading(block, context)
    if block_type == "paragraph":
        return _render_paragraph(block, context)
    if block_type == "divider":
        return _render_divider(block, context)
    if block_type == "page_break":
        return "\\newpage\n"
    if block_type == "spacer":
        return _render_spacer(block, context)
    if block_type == "table":
        return _render_table(block, context)
    if block_type == "measurement_table":
        return _render_measurement_table(block, context)
    if block_type == "key_value":
        return _render_key_value(block, context)
    if block_type == "equation":
        return _render_equation(block, context)
    if block_type == "graph":
        return _render_graph(block, context, images)
    if block_type == "image":
        return _render_image(block, images_by_file_id, images)
    if block_type == "qr_code":
        return _render_qr_code(block, context, images)
    if block_type == "signature":
        return _render_signature(block, context, images)
    if block_type == "date":
        return _render_date(block, context)
    if block_type == "section":
        return _render_section(block, context)
    if block_type == "columns":
        return _render_columns(block, context, images_by_file_id, images)
    logger.warning("document_to_latex: unknown block type %r, skipped", block_type)
    return ""


def collect_image_file_ids(document: dict) -> list[str]:
    """Walks the whole block tree (body + header + footer + nested columns) collecting every
    "image" block's `file_id` — the caller fetches these once up front and passes the resulting
    {file_id: bytes} map into `document_to_latex` as `images_by_file_id`."""
    ids: list[str] = []

    def walk(blocks: list[dict]) -> None:
        for block in blocks:
            if block.get("type") == "image" and block.get("file_id"):
                ids.append(block["file_id"])
            elif block.get("type") == "columns":
                for col in block.get("columns", []):
                    walk(col)

    walk(document.get("blocks", []))
    walk(document.get("header", {}).get("blocks", []))
    walk(document.get("footer", {}).get("blocks", []))
    return ids


# ---------------------------------------------------------------------------
# Document assembly
# ---------------------------------------------------------------------------

_PREAMBLE = r"""\documentclass[%(fontsize)spt]{article}
\usepackage[%(paper)s,%(orientation)stop=%(top)smm,bottom=%(bottom)smm,left=%(left)smm,right=%(right)smm]{geometry}
\usepackage{fontspec}
\setmainfont{DejaVu Sans}
\usepackage{xcolor}
\usepackage{graphicx}
\usepackage{longtable}
\usepackage{array}
\usepackage{booktabs}
\usepackage{fancyhdr}
\usepackage{lastpage}
\usepackage[hidelinks]{hyperref}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
%(headerfooter)s
\begin{document}
"""



# Matches a bare `\par` control word (not the prefix of `\parbox`/`\parskip`/...).
_STANDALONE_PAR_RE = re.compile(r"\\par(?![a-zA-Z])")


def _header_footer_zone(inner: str) -> str:
    """fancyhdr's `\\fancyhead`/`\\fancyfoot` collects its argument as a non-`\\long` macro
    argument — TeX aborts that collection with "Paragraph ended before \\f@nch@fancyhf was
    complete" the moment it sees a `\\par` token anywhere in the raw stream, *before* any nested
    grouping (braces, `\\parbox`, minipages, ...) gets a chance to matter. Every text block ends
    with `\\par` (see `_rich_text`), so a header/footer zone — always a compact one-line strip, not
    real body copy — has every standalone `\\par` stripped before being wrapped in a `parbox` (for
    the `\\vspace`/minipage content that's still perfectly fine, just not multi-paragraph text)."""
    return f"\\parbox[t]{{\\linewidth}}{{{_STANDALONE_PAR_RE.sub('', inner)}}}"


def _header_footer_preamble(document: dict, context: dict, images_by_file_id: dict[str, bytes], images: dict[str, bytes]) -> str:
    settings = document["settings"]
    lines = [r"\pagestyle{fancy}", r"\fancyhf{}", r"\renewcommand{\headrulewidth}{0pt}", r"\renewcommand{\footrulewidth}{0.4pt}"]
    if settings.get("header_enabled") and document["header"].get("enabled"):
        inner = "".join(_render_block(b, context, images_by_file_id, images) for b in document["header"]["blocks"])
        lines.append(f"\\fancyhead[C]{{\\footnotesize {_header_footer_zone(inner)}}}")
        lines.append(r"\renewcommand{\headrulewidth}{0.4pt}")
    if settings.get("footer_enabled") and document["footer"].get("enabled"):
        inner = "".join(_render_block(b, context, images_by_file_id, images) for b in document["footer"]["blocks"])
        lines.append(f"\\fancyfoot[C]{{\\footnotesize {_header_footer_zone(inner)}}}")
    lines.append(r"\fancyfoot[R]{\footnotesize\color{gray}\thepage\ / \pageref{LastPage}}")
    return "\n".join(lines)


def document_to_latex(document: dict, context: dict, images: dict[str, bytes], images_by_file_id: dict[str, bytes] | None = None) -> str:
    """Build a complete .tex source for `document` (a TemplateDocument, see template.ts) resolved
    against `context` (dot-path variable values, plus a `_collections` key for repeating-row
    data — see certificate_service._build_document_template_context). `images` is filled in place
    with any graph/QR/embedded-image PNGs the document produces (relative filename -> PNG bytes),
    ready to pass straight to latex_service.compile_tex. `images_by_file_id` supplies the raw
    bytes for uploaded "image" blocks, keyed by their stored file id.
    """
    images_by_file_id = images_by_file_id or {}
    settings = document["settings"]
    margins = settings["margins"]
    preamble = _PREAMBLE % {
        "fontsize": settings.get("default_font_size", 10),
        "paper": "a4paper" if settings.get("page_size") == "a4" else "letterpaper",
        "orientation": "landscape," if settings.get("orientation") == "landscape" else "",
        "top": margins["top"],
        "bottom": margins["bottom"],
        "left": margins["left"],
        "right": margins["right"],
        "headerfooter": _header_footer_preamble(document, context, images_by_file_id, images),
    }
    body = "".join(_render_block(b, context, images_by_file_id, images) for b in document["blocks"])
    if not body.strip():
        # An empty page still needs some content, or Tectonic emits "did not
        # produce ...xdv; document may be empty" instead of a blank PDF page.
        body = "\\strut"
    return preamble + body + "\n\\end{document}\n"
