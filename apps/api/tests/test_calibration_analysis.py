"""
Unit tests for the calibration analysis service.

These are pure-Python tests — no database or HTTP client needed.
They cover the regression math, AIC degree selection, uncertainty,
hysteresis, repeatability, and pass/fail logic.
"""
import math

import pytest

from app.services.calibration_analysis import (
    run_analysis, _aic, _select_degree, predict_with_uncertainty,
)


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
        # A constant offset is fully absorbed by the fit's intercept (see
        # test_rmse_near_zero_for_perfect_offset), so it can't be used to
        # trigger a fail. Use one outlier point a degree-1 fit can't absorb.
        result = run_analysis(
            reference_values=[0.0, 10.0, 20.0, 30.0, 40.0, 50.0],
            measured_values=[0.5, 10.5, 20.5, 31.0, 40.5, 50.5],
            reference_unit="°C",
            measured_unit="°C",
            poly_degree=1,
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
# run_analysis — decision rules (ISO/IEC 17025 §7.1.3, §7.8.6)
# ---------------------------------------------------------------------------

_OUTLIER_LINEAR = dict(
    reference_values=[0.0, 10.0, 20.0, 30.0, 40.0, 50.0],
    measured_values=[0.5, 10.5, 20.5, 31.0, 40.5, 50.5],
    reference_unit="°C",
    measured_unit="°C",
    poly_degree=1,
)


class TestDecisionRules:
    def test_simple_acceptance_is_default_and_ignores_uncertainty(self) -> None:
        result = run_analysis(
            **_OUTLIER_LINEAR, channel_accuracy_value=0.1, channel_accuracy_type="absolute",
        )
        assert result.conformity_statement["decision_rule"] == "simple_acceptance"
        assert result.conformity_statement["expanded_uncertainty_applied"] is None
        assert result.conformity_statement["passed"] == result.passed

    def test_conformity_statement_passed_matches_top_level_passed(self) -> None:
        for rule in ("simple_acceptance", "guard_band_w_uncertainty", "shared_risk"):
            result = run_analysis(
                **_OUTLIER_LINEAR, channel_accuracy_value=0.1, channel_accuracy_type="absolute",
                decision_rule=rule,
            )
            assert result.conformity_statement["passed"] == result.passed

    def test_guard_band_can_fail_where_simple_acceptance_passes(self) -> None:
        # Find a tolerance strictly between max_error and max_error + U: simple
        # acceptance passes (error alone is within tolerance) but guard-banding
        # (which shrinks the acceptance zone by U) fails.
        baseline = run_analysis(**_OUTLIER_LINEAR, channel_accuracy_value=1000.0, channel_accuracy_type="absolute")
        tolerance = baseline.max_error + baseline.expanded_uncertainty / 2
        assert tolerance > 0

        simple = run_analysis(
            **_OUTLIER_LINEAR, channel_accuracy_value=tolerance, channel_accuracy_type="absolute",
            decision_rule="simple_acceptance",
        )
        guarded = run_analysis(
            **_OUTLIER_LINEAR, channel_accuracy_value=tolerance, channel_accuracy_type="absolute",
            decision_rule="guard_band_w_uncertainty",
        )
        assert simple.passed is True
        assert guarded.passed is False

    def test_shared_risk_can_pass_where_simple_acceptance_fails(self) -> None:
        # Find a tolerance strictly between max_error - U and max_error: simple
        # acceptance fails, but shared-risk (which expands the acceptance zone
        # outward by U) passes.
        baseline = run_analysis(**_OUTLIER_LINEAR, channel_accuracy_value=1000.0, channel_accuracy_type="absolute")
        tolerance = baseline.max_error - baseline.expanded_uncertainty / 2
        assert tolerance > 0, "test precondition: max_error must exceed U/2 for this dataset"

        simple = run_analysis(
            **_OUTLIER_LINEAR, channel_accuracy_value=tolerance, channel_accuracy_type="absolute",
            decision_rule="simple_acceptance",
        )
        shared = run_analysis(
            **_OUTLIER_LINEAR, channel_accuracy_value=tolerance, channel_accuracy_type="absolute",
            decision_rule="shared_risk",
        )
        assert simple.passed is False
        assert shared.passed is True

    def test_conformity_statement_reason_set_when_no_spec(self) -> None:
        result = run_analysis(**PERFECT_LINEAR)
        assert result.conformity_statement["specification"] is None
        assert result.conformity_statement["reason"] is not None

    def test_specification_describes_accuracy_type(self) -> None:
        result = run_analysis(
            **PERFECT_LINEAR, channel_accuracy_value=2.0, channel_accuracy_type="percent_of_full_scale",
        )
        assert "2.0" in result.conformity_statement["specification"]
        assert "full scale" in result.conformity_statement["specification"].lower()


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
# run_analysis — uncertainty budget (Type A + Type B combination, GUM §4-§6)
# ---------------------------------------------------------------------------

# Data with genuine residual scatter a degree-1 fit cannot fully absorb, so
# the Type A (fit-residual) contribution is non-zero and the RSS math below
# has two non-trivial terms to combine.
SCATTERED_LINEAR = {
    "reference_values": [0.0, 10.0, 20.0, 30.0, 40.0, 50.0],
    "measured_values":  [0.02, 10.08, 19.91, 30.12, 39.95, 50.09],
    "reference_unit": "°C",
    "measured_unit": "°C",
    "poly_degree": 1,
}


class TestUncertaintyBudget:
    def test_default_budget_has_only_fit_residuals_row(self) -> None:
        result = run_analysis(**SCATTERED_LINEAR)
        sources = [c["source"] for c in result.uncertainty_budget]
        assert sources == ["fit_residuals"]
        # combined_uncertainty is rounded to 8 decimals in the result; the raw
        # budget row value is not, so allow for that rounding.
        assert result.combined_uncertainty == pytest.approx(
            result.uncertainty_budget[0]["standard_uncertainty"], abs=1e-7
        )

    def test_reference_standard_uncertainty_adds_type_b_row(self) -> None:
        result = run_analysis(**SCATTERED_LINEAR, reference_standard_uncertainty=0.02, reference_standard_coverage_factor=2.0)
        sources = [c["source"] for c in result.uncertainty_budget]
        assert "reference_standard" in sources
        row = next(c for c in result.uncertainty_budget if c["source"] == "reference_standard")
        assert row["standard_uncertainty"] == pytest.approx(0.02 / 2.0)
        assert row["degrees_of_freedom"] is None

    def test_type_b_contribution_increases_combined_uncertainty(self) -> None:
        baseline = run_analysis(**SCATTERED_LINEAR)
        with_type_b = run_analysis(**SCATTERED_LINEAR, reference_standard_uncertainty=0.05, reference_standard_coverage_factor=2.0)
        assert with_type_b.combined_uncertainty > baseline.combined_uncertainty

    def test_combined_uncertainty_is_root_sum_square_of_budget_rows(self) -> None:
        result = run_analysis(
            **SCATTERED_LINEAR,
            reference_standard_uncertainty=0.05,
            reference_standard_coverage_factor=2.0,
            resolution=0.01,
        )
        expected = math.sqrt(sum(c["standard_uncertainty"] ** 2 for c in result.uncertainty_budget))
        # combined_uncertainty is rounded to 8 decimals in the result.
        assert result.combined_uncertainty == pytest.approx(expected, abs=1e-7)

    def test_resolution_adds_rectangular_type_b_row(self) -> None:
        result = run_analysis(**SCATTERED_LINEAR, resolution=0.01)
        row = next(c for c in result.uncertainty_budget if c["source"] == "resolution")
        assert row["distribution"] == "rectangular"
        # GUM §4.3.7: u = a/sqrt(3) with a = resolution/2, i.e. u = resolution/sqrt(12)
        assert row["standard_uncertainty"] == pytest.approx(0.01 / math.sqrt(12))

    def test_sensor_nominal_uncertainty_excluded_by_default(self) -> None:
        result = run_analysis(**SCATTERED_LINEAR, sensor_nominal_uncertainty=0.1)
        sources = [c["source"] for c in result.uncertainty_budget]
        assert "sensor_nominal_accuracy" not in sources

    def test_sensor_nominal_uncertainty_included_when_opted_in(self) -> None:
        result = run_analysis(
            **SCATTERED_LINEAR,
            sensor_nominal_uncertainty=0.1,
            sensor_nominal_coverage_factor=2.0,
            include_sensor_nominal_uncertainty=True,
        )
        sources = [c["source"] for c in result.uncertainty_budget]
        assert "sensor_nominal_accuracy" in sources

    def test_effective_dof_matches_welch_satterthwaite(self) -> None:
        result = run_analysis(**SCATTERED_LINEAR, reference_standard_uncertainty=0.05, reference_standard_coverage_factor=2.0)
        # Only the fit_residuals row has finite degrees of freedom; the Type B
        # row's degrees_of_freedom=None drops out of the Welch-Satterthwaite sum.
        type_a = next(c for c in result.uncertainty_budget if c["source"] == "fit_residuals")
        expected_dof = result.combined_uncertainty ** 4 / (
            type_a["standard_uncertainty"] ** 4 / type_a["degrees_of_freedom"]
        )
        # combined_uncertainty is rounded to 8 decimals, amplified by the ^4 term.
        assert result.effective_degrees_of_freedom == pytest.approx(expected_dof, rel=1e-5)

    def test_effective_dof_none_when_all_contributions_exactly_known(self) -> None:
        # With only 2 points fitted to a degree-1 (2-parameter) model, the fit
        # has zero residual degrees of freedom (n <= k), so its row's
        # degrees_of_freedom is None too -- only exactly-known (dof=None) rows
        # remain, and Welch-Satterthwaite has nothing finite to divide by.
        result = run_analysis(
            reference_values=[0.0, 50.0],
            measured_values=[0.5, 50.5],
            reference_unit="°C",
            measured_unit="°C",
            poly_degree=1,
            reference_standard_uncertainty=0.05,
        )
        assert result.effective_degrees_of_freedom is None


# ---------------------------------------------------------------------------
# Coefficient covariance (GUM Annex H.3 / GUM-6 §8.1.6)
# ---------------------------------------------------------------------------

class TestCoefficientCovariance:
    def test_covariance_present_when_points_exceed_parameters(self) -> None:
        result = run_analysis(**SCATTERED_LINEAR)  # 6 points, degree 1 -> 2 params
        cov = result.poly_coefficients_covariance
        assert cov is not None
        assert len(cov) == 2 and len(cov[0]) == 2
        # Covariance matrix must be symmetric.
        assert cov[0][1] == pytest.approx(cov[1][0])

    def test_covariance_none_when_points_equal_parameters(self) -> None:
        # 2 points, degree 1 -> 2 params -> zero residual dof -> no covariance estimate.
        result = run_analysis(
            reference_values=[0.0, 50.0],
            measured_values=[0.5, 50.5],
            reference_unit="°C",
            measured_unit="°C",
            poly_degree=1,
        )
        assert result.poly_coefficients_covariance is None


class TestPredictWithUncertainty:
    def test_point_estimate_matches_polynomial_evaluation(self) -> None:
        y, _ = predict_with_uncertainty([2.0, 1.0], [[0.01, 0.0], [0.0, 0.005]], x=3.0)
        assert y == pytest.approx(2.0 * 3.0 + 1.0)

    def test_returns_none_uncertainty_when_covariance_missing(self) -> None:
        y, u = predict_with_uncertainty([2.0, 1.0], None, x=3.0)
        assert y == pytest.approx(7.0)
        assert u is None

    def test_propagation_matches_manual_gum_eq_h15_calculation(self) -> None:
        coefficients = [2.0, 1.0]  # y = 2x + 1
        covariance = [[0.01, 0.002], [0.002, 0.005]]
        x = 3.0
        _, u = predict_with_uncertainty(coefficients, covariance, x)
        # GUM Eq. H.15 generalized: Var(y) = sum_i sum_j g_i g_j Cov_ij, g_i = x^(degree-i)
        g = [x, 1.0]
        expected_var = sum(
            g[i] * g[j] * covariance[i][j] for i in range(2) for j in range(2)
        )
        assert u == pytest.approx(math.sqrt(expected_var))

    def test_uncertainty_grows_away_from_fit_centroid(self) -> None:
        # Same covariance structure as a real fit: more uncertain far from where
        # the calibration data was centered (GUM Annex H.3 thermometer example).
        coefficients = [1.0, 0.0]
        covariance = [[0.001, 0.0], [0.0, 0.05]]
        _, u_near = predict_with_uncertainty(coefficients, covariance, x=1.0)
        _, u_far = predict_with_uncertainty(coefficients, covariance, x=100.0)
        assert u_far > u_near


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
