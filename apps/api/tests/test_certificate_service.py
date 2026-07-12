"""
Unit tests for the certificate LaTeX-context builder helpers.

These are pure functions (no DB/network access) that turn a Calibration-like
object into plain dicts/strings for the Jinja template, so they're tested
directly with a lightweight stand-in object rather than a full Calibration
row or a compiled PDF.
"""
import io
from types import SimpleNamespace

from PIL import Image

from app.services.certificate_service import (
    _build_coefficient_rows,
    _build_conformity,
    _build_stat_rows,
    _build_uncertainty_budget_rows,
    _fmt,
    _fmt_accuracy,
    _normalize_to_png,
)


def _cal(**overrides) -> SimpleNamespace:
    base = dict(
        poly_coefficients=[1.0, 0.5],
        r_squared=0.999,
        rmse=0.01,
        max_error=0.02,
        standard_error=0.01,
        full_scale_error=0.1,
        non_linearity=0.05,
        repeatability=None,
        hysteresis=None,
        expanded_uncertainty=0.04,
        coverage_factor=2.0,
        confidence_level=95.0,
        combined_uncertainty=0.02,
        uncertainty_budget=None,
        effective_degrees_of_freedom=None,
        conformity_statement=None,
        range_min=0.0,
        range_max=100.0,
        valid_range_min=0.0,
        valid_range_max=100.0,
        notes=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class TestUncertaintyBudgetRows:
    def test_empty_when_budget_absent(self) -> None:
        assert _build_uncertainty_budget_rows(_cal(uncertainty_budget=None)) == []

    def test_rows_present_when_budget_supplied(self) -> None:
        budget = [
            {"source": "fit_residuals", "distribution": "normal", "standard_uncertainty": 0.02, "degrees_of_freedom": 4.0},
            {"source": "reference_standard", "distribution": "normal", "standard_uncertainty": 0.025, "degrees_of_freedom": None},
        ]
        rows = _build_uncertainty_budget_rows(_cal(uncertainty_budget=budget))
        assert len(rows) == 2
        assert rows[0]["source"] == "fit_residuals"
        assert rows[0]["standard_uncertainty"] == "0.02"
        assert rows[1]["dof"] == "—"


class TestConformity:
    def test_none_when_statement_absent(self) -> None:
        assert _build_conformity(_cal(conformity_statement=None)) is None

    def test_none_when_no_specification(self) -> None:
        statement = {
            "decision_rule": "simple_acceptance", "specification": None,
            "expanded_uncertainty_applied": None, "passed": True,
        }
        assert _build_conformity(_cal(conformity_statement=statement)) is None

    def test_conforms_statement(self) -> None:
        statement = {
            "decision_rule": "guard_band_w_uncertainty", "specification": "±0.5 (absolute)",
            "expanded_uncertainty_applied": 0.04, "passed": True,
        }
        result = _build_conformity(_cal(conformity_statement=statement))
        assert result is not None
        assert result["result_label"] == "CONFORMS"
        assert result["specification"] == "±0.5 (absolute)"
        assert "Guard-banded acceptance" in result["decision_rule_label"]
        assert result["expanded_uncertainty_line"] is not None

    def test_does_not_conform_statement(self) -> None:
        statement = {
            "decision_rule": "simple_acceptance", "specification": "±0.1 (absolute)",
            "expanded_uncertainty_applied": None, "passed": False,
        }
        result = _build_conformity(_cal(conformity_statement=statement))
        assert result is not None
        assert result["result_label"] == "DOES NOT CONFORM"
        assert result["expanded_uncertainty_line"] is None


class TestCoefficientRows:
    def test_empty_when_no_coefficients(self) -> None:
        rows, equation = _build_coefficient_rows(None)
        assert rows == []
        assert equation is None

    def test_linear_equation(self) -> None:
        rows, equation = _build_coefficient_rows([2.0, 1.0])  # highest-degree first: a1=2.0, a0=1.0
        assert len(rows) == 2
        assert rows[0]["coefficient"] == "a0"
        assert rows[1]["coefficient"] == "a1"
        assert equation == "y = 1 + 2*x"

    def test_quadratic_equation_mentions_x_squared(self) -> None:
        _, equation = _build_coefficient_rows([1.0, 2.0, 3.0])
        assert "x^2" in equation


class TestStatRows:
    def test_runs_without_error_when_no_regression_data(self) -> None:
        rows = _build_stat_rows(_cal(
            poly_coefficients=None, r_squared=None, rmse=None, max_error=None,
            standard_error=None, full_scale_error=None, non_linearity=None,
            expanded_uncertainty=None, combined_uncertainty=None,
        ))
        assert rows == []

    def test_includes_r_squared_and_rmse_pair(self) -> None:
        rows = _build_stat_rows(_cal())
        labels = [r["label"] for r in rows]
        assert "R²" in labels
        assert "RMSE" in labels


class TestFormatHelpers:
    def test_fmt_none_returns_placeholder(self) -> None:
        assert _fmt(None) == "—"

    def test_fmt_scientific_for_small_values(self) -> None:
        assert "e" in _fmt(0.0000001)

    def test_fmt_accuracy_includes_plus_minus(self) -> None:
        sensor = SimpleNamespace(accuracy_value=0.1, accuracy_type="of reading", accuracy_unit="%")
        assert _fmt_accuracy(sensor).startswith("±0.1")


class TestNormalizeToPng:
    """Regression test: org logos/profile pictures are only validated as
    'an image/* content type' at upload time, not a specific format — a
    browser will happily submit a .ico as content-type image/x-icon. LaTeX's
    \\includegraphics can only load PNG/JPEG/PDF, so every image handed to
    Tectonic must be normalized first, or certificate generation crashes on
    a stored file it doesn't control the format of."""

    def test_passes_through_a_real_png(self) -> None:
        img = Image.new("RGBA", (10, 10), (255, 0, 0, 255))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        result = _normalize_to_png(buf.getvalue())
        assert result is not None
        assert Image.open(io.BytesIO(result)).format == "PNG"

    def test_converts_a_non_png_format_like_ico(self) -> None:
        img = Image.new("RGBA", (32, 32), (0, 128, 255, 255))
        buf = io.BytesIO()
        img.save(buf, format="ICO")
        result = _normalize_to_png(buf.getvalue())
        assert result is not None
        assert Image.open(io.BytesIO(result)).format == "PNG"

    def test_returns_none_for_undecodable_bytes(self) -> None:
        assert _normalize_to_png(b"not an image at all") is None
