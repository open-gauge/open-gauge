"""
Unit tests for the certificate PDF result-section builder.

`_build_results` is a pure function (no DB/network access) that turns a
Calibration-like object into a list of reportlab flowables, so it's tested
directly with a lightweight stand-in object rather than a full Calibration
row or a rendered PDF.
"""
from types import SimpleNamespace

from reportlab.platypus import Paragraph, Table

from app.services.certificate_service import _build_results


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


def _flat_text(story: list) -> str:
    """Flatten reportlab flowables (including KeepTogether wrappers) into their text."""
    chunks: list[str] = []
    for item in story:
        content = getattr(item, "_content", None)
        if content is not None:
            chunks.append(_flat_text(content))
        elif isinstance(item, Paragraph):
            chunks.append(item.text)
        elif isinstance(item, Table):
            for row in item._cellvalues:
                for cell in row:
                    chunks.append(cell.text if isinstance(cell, Paragraph) else str(cell))
    return " ".join(chunks)


class TestBuildResultsUncertaintyBudget:
    def test_no_budget_section_when_budget_absent(self) -> None:
        story = _build_results(_cal(uncertainty_budget=None))
        assert "Uncertainty Budget" not in _flat_text(story)

    def test_budget_section_present_when_budget_supplied(self) -> None:
        budget = [
            {
                "source": "fit_residuals",
                "description": "Type A: standard deviation of calibration-fit residuals",
                "value": 0.02,
                "distribution": "normal",
                "divisor": 1.0,
                "standard_uncertainty": 0.02,
                "degrees_of_freedom": 4.0,
            },
            {
                "source": "reference_standard",
                "description": "Type B: uncertainty of the reference standard used for this calibration",
                "value": 0.05,
                "distribution": "normal",
                "divisor": 2.0,
                "standard_uncertainty": 0.025,
                "degrees_of_freedom": None,
            },
        ]
        story = _build_results(_cal(uncertainty_budget=budget, effective_degrees_of_freedom=4.7))
        text = _flat_text(story)
        assert "Uncertainty Budget" in text
        assert "fit_residuals" in text
        assert "reference_standard" in text
        assert "Welch-Satterthwaite" in text

    def test_runs_without_error_when_no_regression_data(self) -> None:
        # A coefficients-only calibration (no fit yet performed).
        story = _build_results(_cal(
            poly_coefficients=None, r_squared=None, rmse=None, max_error=None,
            standard_error=None, full_scale_error=None, non_linearity=None,
            expanded_uncertainty=None, combined_uncertainty=None,
            range_min=None, range_max=None, valid_range_min=None, valid_range_max=None,
        ))
        assert isinstance(story, list)


class TestBuildResultsConformityStatement:
    def test_no_statement_section_when_absent(self) -> None:
        story = _build_results(_cal(conformity_statement=None))
        assert "Statement of Conformity" not in _flat_text(story)

    def test_no_statement_section_when_no_specification(self) -> None:
        # e.g. no accuracy spec was configured — conformity wasn't evaluated.
        story = _build_results(_cal(conformity_statement={
            "decision_rule": "simple_acceptance", "specification": None,
            "expanded_uncertainty_applied": None, "passed": True,
            "reason": "No accuracy specification provided; conformity not evaluated.",
        }))
        assert "Statement of Conformity" not in _flat_text(story)

    def test_conforms_statement_present(self) -> None:
        story = _build_results(_cal(conformity_statement={
            "decision_rule": "guard_band_w_uncertainty", "specification": "±0.5 (absolute)",
            "expanded_uncertainty_applied": 0.04, "passed": True, "reason": None,
        }))
        text = _flat_text(story)
        assert "Statement of Conformity" in text
        assert "CONFORMS" in text
        assert "±0.5 (absolute)" in text
        assert "Guard-banded acceptance" in text

    def test_does_not_conform_statement_present(self) -> None:
        story = _build_results(_cal(conformity_statement={
            "decision_rule": "simple_acceptance", "specification": "±0.1 (absolute)",
            "expanded_uncertainty_applied": None, "passed": False, "reason": None,
        }))
        text = _flat_text(story)
        assert "DOES NOT CONFORM" in text
