"""
Jinja-to-LaTeX rendering and Tectonic compilation.

Templates use LaTeX-safe Jinja delimiters (\\VAR{...}, \\BLOCK{...}) since the
default {{ }}/{% %} collide with LaTeX's own {} group syntax. Free-text values
must be passed through the `latex` filter (\\VAR{value|latex}) to escape
characters LaTeX treats specially — filenames/paths used inside
\\includegraphics must NOT be escaped.
"""
from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

import jinja2

BUILTIN_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "templates" / "certificates" / "default.tex.jinja"

_LATEX_ESCAPE_MAP = {
    "\\": r"\textbackslash{}",
    "{": r"\{",
    "}": r"\}",
    "$": r"\$",
    "&": r"\&",
    "#": r"\#",
    "^": r"\textasciicircum{}",
    "_": r"\_",
    "%": r"\%",
    "~": r"\textasciitilde{}",
}
_LATEX_ESCAPE_RE = re.compile("|".join(re.escape(k) for k in _LATEX_ESCAPE_MAP))


def latex_escape(value: object) -> str:
    """Jinja filter: escape a value for safe inclusion in LaTeX source."""
    if value is None or value == "":
        return "--"
    text = str(value)
    return _LATEX_ESCAPE_RE.sub(lambda m: _LATEX_ESCAPE_MAP[m.group()], text)


def _build_env() -> jinja2.Environment:
    env = jinja2.Environment(
        block_start_string=r"\BLOCK{",
        block_end_string="}",
        variable_start_string=r"\VAR{",
        variable_end_string="}",
        comment_start_string=r"\#{",
        comment_end_string="}",
        line_statement_prefix="%%",
        line_comment_prefix="%#",
        trim_blocks=True,
        lstrip_blocks=True,
        autoescape=False,
    )
    env.filters["latex"] = latex_escape
    return env


def render_template(tex_source: str, context: dict) -> str:
    """Render a .tex Jinja template string with the LaTeX-safe environment."""
    template = _build_env().from_string(tex_source)
    return template.render(**context)


class LatexCompileError(Exception):
    """Raised when Tectonic fails to compile a rendered .tex source."""


def compile_tex(tex_source: str, images: dict[str, bytes], timeout: int = 60) -> bytes:
    """Compile a rendered .tex source (plus any referenced local images) to PDF bytes.

    `images` maps the relative filename used in the template's \\includegraphics
    calls (e.g. "chart.png") to its raw bytes — written into the same temp
    working directory Tectonic compiles in, so relative \\includegraphics paths
    resolve correctly.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        tex_path = tmp / "certificate.tex"
        tex_path.write_text(tex_source, encoding="utf-8")
        for name, data in images.items():
            (tmp / name).write_bytes(data)

        try:
            result = subprocess.run(
                ["tectonic", "--outdir", str(tmp), str(tex_path)],
                cwd=str(tmp),
                capture_output=True,
                timeout=timeout,
            )
        except FileNotFoundError:
            raise LatexCompileError("Tectonic is not installed in this environment")
        except subprocess.TimeoutExpired:
            raise LatexCompileError(f"LaTeX compilation timed out after {timeout}s")

        if result.returncode != 0:
            detail = result.stderr.decode("utf-8", errors="replace") or result.stdout.decode("utf-8", errors="replace")
            raise LatexCompileError(detail.strip() or "Tectonic failed with no output")

        pdf_path = tmp / "certificate.pdf"
        if not pdf_path.exists():
            raise LatexCompileError("Tectonic did not produce a PDF file")
        return pdf_path.read_bytes()


def dummy_placeholder_png() -> bytes:
    """A tiny valid PNG used for warm/dry-run compiles where image content doesn't matter."""
    import io

    from PIL import Image

    img = Image.new("RGB", (4, 4), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def dummy_context() -> dict:
    """Minimal but structurally complete context for warming/dry-run compiles."""
    return {
        "certificate_number": "OG-CAL-DEMO-0001-v1",
        "org_name": "Demo Organization",
        "org_logo_path": "logo.png",
        "performer_name": "Jane Doe",
        "performer_signature_path": "signature.png",
        "calibration_date": "2026-01-01",
        "due_date": "2027-01-01",
        "version": 1,
        "calibration_type": "internal",
        "asset_id": "OG-00001",
        "asset_name": "Demo Sensor",
        "asset_manufacturer": "Acme",
        "asset_model": "X-100",
        "asset_serial": "SN-123",
        "asset_part_number": "PN-1",
        "asset_type_label": "Sensor",
        "asset_notes": None,
        "channel": {
            "id": "CH1", "quantity": "pressure", "unit": "bar",
            "min": "0", "max": "10", "accuracy": "±0.1%",
        },
        "external_lab_name": None,
        "external_lab_certificate_number": None,
        "procedure": {"id": "P-1", "name": "Demo Procedure", "version": "1.0", "standard_ref": "ISO 1"},
        "reference_asset": {
            "id": "OG-00002", "name": "Reference Standard",
            "manufacturer": "Acme", "model": "REF-1", "serial": "SN-999",
        },
        "temperature": "21.0",
        "humidity": "45.0",
        "pressure": "101325",
        "coefficient_rows": [
            {"coefficient": "a0", "term": "1", "value": "0.1"},
            {"coefficient": "a1", "term": "x^1", "value": "1.0"},
        ],
        "equation": "y = 0.1 + 1.0*x",
        "stat_rows": [{"label": "R²", "value": "0.999"}],
        "uncertainty_budget_rows": [
            {"source": "fit_residuals", "distribution": "normal", "standard_uncertainty": "0.02", "dof": "4"},
        ],
        "effective_dof_note": None,
        "uncertainty_statement": None,
        "conformity": None,
        "valid_range": "0 to 10",
        "notes": None,
        "dataset_rows": [
            {"index": "0", "measured": "1.0", "reference": "1.1", "fit": "1.1", "residual_abs": "0.0", "residual_pct": "0.0"},
        ],
        "measured_unit": "bar",
        "reference_unit": "bar",
        "qr_path": "qr.png",
        "chart_path": "chart.png",
        "lab_footer": "Demo Organization",
    }


def compile_dummy(tex_source: str, timeout: int = 60) -> bytes:
    """Render + compile a candidate template with dummy data, returning the PDF
    bytes. Used both to validate a template before it's persisted (raising
    LatexCompileError on failure) and for an admin "preview" of a template.
    """
    rendered = render_template(tex_source, dummy_context())
    placeholder = dummy_placeholder_png()
    images = {name: placeholder for name in ("logo.png", "signature.png", "qr.png", "chart.png")}
    return compile_tex(rendered, images, timeout=timeout)


def dry_run_compile(tex_source: str, timeout: int = 60) -> None:
    """Validate a candidate template compiles, raising LatexCompileError on failure."""
    compile_dummy(tex_source, timeout=timeout)


def warm_cache() -> None:
    """Compile the built-in template with dummy data once, at Docker build time.

    This pre-fetches Tectonic's LaTeX package bundle into the image so no
    network access is attempted at container runtime (self-hosted / air-gapped
    requirement) for the packages the shipped template actually uses.
    """
    tex_source = BUILTIN_TEMPLATE_PATH.read_text(encoding="utf-8")
    # First-ever compile fetches Tectonic's whole package bundle over the network —
    # much slower than a normal (already-cached) compile, hence the generous timeout.
    dry_run_compile(tex_source, timeout=300)
