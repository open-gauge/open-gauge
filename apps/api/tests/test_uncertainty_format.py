"""
Unit tests for the GUM §7.2 reporting-rule helpers.
"""
import math

from app.utils.uncertainty_format import format_expanded_uncertainty_statement, round_to_sig_figs


class TestRoundToSigFigs:
    def test_rounds_to_two_significant_figures_by_default(self) -> None:
        assert round_to_sig_figs(0.123456) == 0.12
        assert round_to_sig_figs(123.456) == 120.0
        assert round_to_sig_figs(0.000123456) == 0.00012

    def test_respects_custom_sig_figs(self) -> None:
        assert round_to_sig_figs(0.123456, 3) == 0.123
        assert round_to_sig_figs(0.123456, 1) == 0.1

    def test_zero_is_unchanged(self) -> None:
        assert round_to_sig_figs(0.0) == 0.0

    def test_negative_value_rounds_preserving_sign(self) -> None:
        assert round_to_sig_figs(-0.123456) == -0.12

    def test_non_finite_returned_unchanged(self) -> None:
        assert math.isnan(round_to_sig_figs(float("nan")))
        assert round_to_sig_figs(float("inf")) == float("inf")

    def test_value_already_at_sig_figs_unchanged(self) -> None:
        assert round_to_sig_figs(0.25, 2) == 0.25


class TestFormatExpandedUncertaintyStatement:
    def test_returns_none_when_no_expanded_uncertainty(self) -> None:
        assert format_expanded_uncertainty_statement(
            combined_uncertainty=0.02, expanded_uncertainty=None,
            coverage_factor=2.0, confidence_level=95.0, unit="°C",
        ) is None

    def test_returns_none_when_no_combined_uncertainty(self) -> None:
        assert format_expanded_uncertainty_statement(
            combined_uncertainty=None, expanded_uncertainty=0.04,
            coverage_factor=2.0, confidence_level=95.0, unit="°C",
        ) is None

    def test_statement_includes_rounded_values_and_unit(self) -> None:
        text = format_expanded_uncertainty_statement(
            combined_uncertainty=0.123456, expanded_uncertainty=0.246912,
            coverage_factor=2.0, confidence_level=95.0, unit="°C",
        )
        assert text is not None
        assert "0.25 °C" in text  # expanded, rounded to 2 sig figs
        assert "0.12 °C" in text  # combined, rounded to 2 sig figs
        assert "95%" in text
        assert "JCGM 100:2008 §7.2.6" in text

    def test_statement_uses_normal_distribution_when_no_dof(self) -> None:
        text = format_expanded_uncertainty_statement(
            combined_uncertainty=0.1, expanded_uncertainty=0.2,
            coverage_factor=2.0, confidence_level=95.0, unit="°C",
        )
        assert "normal distribution" in text

    def test_statement_uses_t_distribution_basis_when_dof_given(self) -> None:
        text = format_expanded_uncertainty_statement(
            combined_uncertainty=0.1, expanded_uncertainty=0.2,
            coverage_factor=2.0, confidence_level=95.0, unit="°C",
            effective_degrees_of_freedom=4.7,
        )
        assert "4.7" in text
        assert "degrees of freedom" in text

    def test_statement_includes_range_when_given(self) -> None:
        text = format_expanded_uncertainty_statement(
            combined_uncertainty=0.1, expanded_uncertainty=0.2,
            coverage_factor=2.0, confidence_level=95.0, unit="°C",
            range_min=0.0, range_max=100.0,
        )
        assert "0 to 100 °C" in text

    def test_statement_omits_range_when_not_given(self) -> None:
        text = format_expanded_uncertainty_statement(
            combined_uncertainty=0.1, expanded_uncertainty=0.2,
            coverage_factor=2.0, confidence_level=95.0, unit="°C",
        )
        assert "range" not in text.lower()
