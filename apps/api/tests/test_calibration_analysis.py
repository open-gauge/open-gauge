"""
Unit tests for the calibration analysis service.

These are pure-Python tests — no database or HTTP client needed.
They cover the regression math, AIC degree selection, uncertainty,
hysteresis, repeatability, and pass/fail logic.
"""
import math

import pytest

from app.services.calibration_analysis import run_analysis, _aic, _select_degree


# ---------------------------------------------------------------------------
# AIC helper
# ---------------------------------------------------------------------------

class TestAIC:
    def test_lower_rss_gives_lower_aic(self) -> None:
        assert _aic(10, 0.1, 2) < _aic(10, 1.0, 2)

    def test_more_params_penalises_aic(self) -> None:
        # Same RSS, more parameters → higher AIC
        assert _aic(10, 0.5, 3) > _aic(10, 0.5, 2)

    def test_zero_rss_returns_inf(self) -> None:
        assert math.isinf(_aic(10, 0.0, 2))


# ---------------------------------------------------------------------------
# Degree selection
# ---------------------------------------------------------------------------

class TestSelectDegree:
    def test_linear_data_gives_degree_1(self) -> None:
        import numpy as np
        x = np.linspace(0, 100, 20)
        y = 2.0 * x + 5.0 + np.random.default_rng(42).normal(0, 0.01, len(x))
        assert _select_degree(x, y) == 1

    def test_quadratic_data_gives_degree_2(self) -> None:
        import numpy as np
        x = np.linspace(0, 10, 30)
        y = 0.5 * x**2 - 2 * x + 1.0 + np.random.default_rng(0).normal(0, 0.05, len(x))
        degree = _select_degree(x, y)
        assert degree >= 2  # May pick 2 or higher; must not pick 1


# ---------------------------------------------------------------------------
# run_analysis — basic correctness
# ---------------------------------------------------------------------------

PERFECT_LINEAR = {
    "reference_values": [0.0, 10.0, 20.0, 30.0, 40.0, 50.0],
    "measured_values":  [0.5, 10.5, 20.5, 30.5, 40.5, 50.5],
    "reference_unit": "°C",
    "measured_unit": "°C",
}


class TestRunAnalysisLinear:
    def test_degree_is_1_for_perfect_linear(self) -> None:
        result = run_analysis(**PERFECT_LINEAR)
        assert result.poly_degree == 1

    def test_r_squared_near_1_for_perfect_linear(self) -> None:
        result = run_analysis(**PERFECT_LINEAR)
        assert result.r_squared > 0.9999

    def test_rmse_near_zero_for_perfect_offset(self) -> None:
        result = run_analysis(**PERFECT_LINEAR)
        assert result.rmse < 1e-6

    def test_valid_range_matches_input(self) -> None:
        result = run_analysis(**PERFECT_LINEAR)
        assert result.valid_range_min == pytest.approx(0.0)
        assert result.valid_range_max == pytest.approx(50.0)

    def test_coefficients_length_equals_degree_plus_1(self) -> None:
        result = run_analysis(**PERFECT_LINEAR)
        assert len(result.coefficients) == result.poly_degree + 1

    def test_point_count_matches_input(self) -> None:
        result = run_analysis(**PERFECT_LINEAR)
        assert len(result.points) == len(PERFECT_LINEAR["reference_values"])

    def test_residuals_near_zero_for_perfect_fit(self) -> None:
        result = run_analysis(**PERFECT_LINEAR)
        for pt in result.points:
            assert abs(pt.residual_abs) < 1e-6

    def test_calculated_values_populated(self) -> None:
        result = run_analysis(**PERFECT_LINEAR)
        for pt in result.points:
            assert pt.calculated_value is not None


# ---------------------------------------------------------------------------
# run_analysis — auto vs. explicit degree
# ---------------------------------------------------------------------------

class TestDegreeSelection:
    def test_explicit_degree_is_respected(self) -> None:
        result = run_analysis(**PERFECT_LINEAR, poly_degree=2)
        assert result.poly_degree == 2

    def test_auto_degree_none_runs_without_error(self) -> None:
        result = run_analysis(**PERFECT_LINEAR, poly_degree=None)
        assert result.poly_degree >= 1

    def test_degree_clamped_to_5(self) -> None:
        result = run_analysis(**PERFECT_LINEAR, poly_degree=10)
        assert result.poly_degree <= 5


# ---------------------------------------------------------------------------
# run_analysis — pass/fail
# ---------------------------------------------------------------------------

class TestPassFail:
    def test_pass_when_error_within_absolute_accuracy(self) -> None:
        # All residuals ≈ 0, accuracy 1.0 absolute → should pass
        result = run_analysis(
            **PERFECT_LINEAR,
            channel_accuracy_value=1.0,
            channel_accuracy_type="absolute",
        )
        assert result.passed is True

    def test_fail_when_error_exceeds_absolute_accuracy(self) -> None:
        # constant offset of 0.5, accuracy 0.1 → fail
        result = run_analysis(
            **PERFECT_LINEAR,
            channel_accuracy_value=0.1,
            channel_accuracy_type="absolute",
        )
        assert result.passed is False

    def test_pass_when_error_within_full_scale_accuracy(self) -> None:
        # span=50, accuracy 2% FS = 1.0, max residual ≈ 0 → pass
        result = run_analysis(
            **PERFECT_LINEAR,
            channel_accuracy_value=2.0,
            channel_accuracy_type="percent_of_full_scale",
        )
        assert result.passed is True

    def test_no_accuracy_spec_always_passes(self) -> None:
        result = run_analysis(**PERFECT_LINEAR)
        assert result.passed is True

    def test_zero_accuracy_value_always_passes(self) -> None:
        result = run_analysis(**PERFECT_LINEAR, channel_accuracy_value=0.0)
        assert result.passed is True


# ---------------------------------------------------------------------------
# run_analysis — uncertainty
# ---------------------------------------------------------------------------

class TestUncertainty:
    def test_normal_distribution_uses_coverage_factor(self) -> None:
        result = run_analysis(**PERFECT_LINEAR, distribution_type="normal", coverage_factor=2.0)
        assert result.coverage_factor == 2.0
        assert result.distribution_type == "normal"
        assert result.expanded_uncertainty >= result.combined_uncertainty

    def test_t_distribution_returns_non_negative_uncertainty(self) -> None:
        result = run_analysis(**PERFECT_LINEAR, distribution_type="t", confidence_level=95.0)
        assert result.expanded_uncertainty >= 0.0

    def test_chi_squared_distribution_returns_non_negative_uncertainty(self) -> None:
        result = run_analysis(**PERFECT_LINEAR, distribution_type="chi_squared", confidence_level=95.0)
        assert result.expanded_uncertainty >= 0.0


# ---------------------------------------------------------------------------
# run_analysis — hysteresis and repeatability
# ---------------------------------------------------------------------------

class TestHysteresisAndRepeatability:
    def test_no_hysteresis_for_monotonic_data(self) -> None:
        result = run_analysis(**PERFECT_LINEAR)
        assert result.hysteresis is None

    def test_hysteresis_detected_for_up_down_sweep(self) -> None:
        # Ascending then descending sweep with different measured values
        ref = [0.0, 10.0, 20.0, 30.0, 20.0, 10.0, 0.0]
        meas = [0.1, 10.1, 20.1, 30.1, 20.2, 10.2, 0.2]  # up/down differ by ~0.1
        result = run_analysis(
            reference_values=ref,
            measured_values=meas,
            reference_unit="°C",
            measured_unit="°C",
        )
        assert result.hysteresis is not None
        assert result.hysteresis > 0.0

    def test_no_repeatability_without_duplicate_refs(self) -> None:
        result = run_analysis(**PERFECT_LINEAR)
        assert result.repeatability is None

    def test_repeatability_detected_with_triplicate_points(self) -> None:
        # Three measurements at the same reference value
        ref = [0.0, 0.0, 0.0, 50.0, 100.0]
        meas = [0.1, 0.15, 0.12, 50.0, 100.0]
        result = run_analysis(
            reference_values=ref,
            measured_values=meas,
            reference_unit="Pa",
            measured_unit="Pa",
        )
        assert result.repeatability is not None
        assert result.repeatability >= 0.0


# ---------------------------------------------------------------------------
# run_analysis — error cases
# ---------------------------------------------------------------------------

class TestRunAnalysisErrors:
    def test_raises_for_single_point(self) -> None:
        with pytest.raises(ValueError, match="at least 2"):
            run_analysis(
                reference_values=[0.0],
                measured_values=[0.0],
                reference_unit="°C",
                measured_unit="°C",
            )

    def test_raises_for_mismatched_lengths(self) -> None:
        with pytest.raises(ValueError, match="same length"):
            run_analysis(
                reference_values=[0.0, 1.0],
                measured_values=[0.0],
                reference_unit="°C",
                measured_unit="°C",
            )
