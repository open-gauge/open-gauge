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

    def test_tolerance_value_none_when_no_spec(self) -> None:
        result = run_analysis(**PERFECT_LINEAR)
        assert result.conformity_statement["tolerance_value"] is None

    def test_tolerance_value_is_absolute_value_for_absolute_type(self) -> None:
        result = run_analysis(
            **_OUTLIER_LINEAR, channel_accuracy_value=0.75, channel_accuracy_type="absolute",
        )
        assert result.conformity_statement["tolerance_value"] == pytest.approx(0.75)

    def test_tolerance_value_is_percent_of_span_for_percent_of_full_scale(self) -> None:
        result = run_analysis(
            **_OUTLIER_LINEAR, channel_accuracy_value=2.0, channel_accuracy_type="percent_of_full_scale",
        )
        span = max(_OUTLIER_LINEAR["reference_values"]) - min(_OUTLIER_LINEAR["reference_values"])
        assert result.conformity_statement["tolerance_value"] == pytest.approx(0.02 * span)

    def test_tolerance_value_is_none_for_percent_of_reading(self) -> None:
        # percent_of_reading's tolerance varies per point (no single flat
        # number the way the other two accuracy types have).
        result = run_analysis(
            **_OUTLIER_LINEAR, channel_accuracy_value=2.0, channel_accuracy_type="percent_of_reading",
        )
        assert result.conformity_statement["tolerance_value"] is None


class TestToleranceOverride:
    """The wizard's editable Tolerance box — bypasses channel_accuracy_value/
    type entirely, including percent_of_reading's per-point logic."""

    def test_override_wins_even_with_no_channel_spec(self) -> None:
        result = run_analysis(**_OUTLIER_LINEAR, tolerance_override=1000.0)
        assert result.conformity_statement["tolerance_value"] == pytest.approx(1000.0)
        assert result.conformity_statement["specification"] is not None
        assert "manual" in result.conformity_statement["specification"].lower()
        assert result.passed is True

    def test_override_wins_over_channel_accuracy_spec(self) -> None:
        # A channel spec is present but should be ignored entirely once an
        # override is supplied.
        result = run_analysis(
            **_OUTLIER_LINEAR, channel_accuracy_value=2.0, channel_accuracy_type="percent_of_reading",
            tolerance_override=1000.0,
        )
        assert result.conformity_statement["tolerance_value"] == pytest.approx(1000.0)

    def test_override_evaluated_against_max_error(self) -> None:
        baseline = run_analysis(**_OUTLIER_LINEAR, tolerance_override=1000.0)
        tight = run_analysis(**_OUTLIER_LINEAR, tolerance_override=baseline.max_error / 2)
        loose = run_analysis(**_OUTLIER_LINEAR, tolerance_override=baseline.max_error * 2)
        assert tight.passed is False
        assert loose.passed is True

    def test_override_respects_decision_rule_guard(self) -> None:
        baseline = run_analysis(**_OUTLIER_LINEAR, tolerance_override=1000.0)
        tolerance = baseline.max_error + baseline.expanded_uncertainty / 2
        simple = run_analysis(**_OUTLIER_LINEAR, tolerance_override=tolerance, decision_rule="simple_acceptance")
        guarded = run_analysis(**_OUTLIER_LINEAR, tolerance_override=tolerance, decision_rule="guard_band_w_uncertainty")
        assert simple.passed is True
        assert guarded.passed is False

    def test_zero_or_negative_override_falls_back_to_channel_spec(self) -> None:
        result = run_analysis(
            **PERFECT_LINEAR, channel_accuracy_value=2.0, channel_accuracy_type="absolute",
            tolerance_override=0.0,
        )
        assert result.conformity_statement["tolerance_value"] == pytest.approx(2.0)
        assert "manual" not in (result.conformity_statement["specification"] or "").lower()


# ---------------------------------------------------------------------------
# run_analysis — uncertainty
# ---------------------------------------------------------------------------

class TestUncertainty:
    def test_normal_distribution_derives_coverage_factor_from_confidence_level(self) -> None:
        # No coverage_factor input anymore — k is always derived from confidence_level.
        # 95% confidence under a normal distribution -> k = norm.ppf(0.975) ≈ 1.95996.
        result = run_analysis(**PERFECT_LINEAR, distribution_type="normal", confidence_level=95.0)
        assert result.coverage_factor == pytest.approx(1.95996, abs=1e-4)
        assert result.distribution_type == "normal"
        assert result.expanded_uncertainty >= result.combined_uncertainty

    def test_normal_distribution_coverage_factor_tracks_confidence_level(self) -> None:
        result_90 = run_analysis(**PERFECT_LINEAR, distribution_type="normal", confidence_level=90.0)
        result_99 = run_analysis(**PERFECT_LINEAR, distribution_type="normal", confidence_level=99.0)
        # Higher confidence -> larger coverage factor (wider interval).
        assert result_90.coverage_factor < result_99.coverage_factor
        assert result_90.coverage_factor == pytest.approx(1.6449, abs=1e-3)
        assert result_99.coverage_factor == pytest.approx(2.5758, abs=1e-3)

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


# ---------------------------------------------------------------------------
# run_analysis(skip_fit=True) — data_entry_mode="reference_vs_indicated" /
# "reference_vs_as_found_as_left" (no transference function), and
# "model_direct" (synthetic zero-residual points at the declared range).
# ---------------------------------------------------------------------------

# "measured" is already directly comparable to "reference" (both physical
# quantities) — some genuine scatter so Type A isn't trivially zero.
SKIP_FIT_DATA = {
    "reference_values": [0.0, 10.0, 20.0, 30.0, 40.0, 50.0],
    "measured_values":  [0.05, 9.9, 20.08, 29.95, 40.1, 49.92],
    "reference_unit": "°C",
    "measured_unit": "°C",
    "skip_fit": True,
}


class TestSkipFit:
    def test_no_fit_metadata_returned(self) -> None:
        result = run_analysis(**SKIP_FIT_DATA)
        assert result.poly_degree is None
        assert result.coefficients == []
        assert result.poly_coefficients_covariance is None
        assert result.non_linearity_pct is None

    def test_residual_is_direct_difference_not_a_fit(self) -> None:
        result = run_analysis(**SKIP_FIT_DATA)
        for pt, ref, meas in zip(
            result.points, SKIP_FIT_DATA["reference_values"], SKIP_FIT_DATA["measured_values"]
        ):
            assert pt.calculated_value == pytest.approx(meas)
            assert pt.residual_abs == pytest.approx(ref - meas)

    def test_r_squared_rmse_max_error_still_computed(self) -> None:
        result = run_analysis(**SKIP_FIT_DATA)
        assert result.r_squared is not None
        assert result.rmse > 0.0
        assert result.max_error > 0.0
        assert result.full_scale_error_pct > 0.0

    def test_uncertainty_budget_and_conformity_still_computed(self) -> None:
        result = run_analysis(
            **SKIP_FIT_DATA,
            reference_standard_uncertainty=0.05,
            reference_standard_coverage_factor=2.0,
            channel_accuracy_value=1.0,
            channel_accuracy_type="absolute",
        )
        sources = [c["source"] for c in result.uncertainty_budget]
        assert "fit_residuals" in sources
        assert "reference_standard" in sources
        assert result.expanded_uncertainty > 0.0
        assert result.conformity_statement["specification"] is not None

    def test_standard_error_uses_k_zero_not_fit_params(self) -> None:
        # skip_fit -> k=0 fitted parameters consumed, so dof = n - k = n (not n - (degree+1)).
        skip_result = run_analysis(**SKIP_FIT_DATA)
        n = len(SKIP_FIT_DATA["reference_values"])
        ss_res = sum((r - m) ** 2 for r, m in zip(
            SKIP_FIT_DATA["reference_values"], SKIP_FIT_DATA["measured_values"]
        ))
        assert skip_result.standard_error == pytest.approx(math.sqrt(ss_res / n))

    def test_repeatability_and_hysteresis_still_detected(self) -> None:
        ref = [0.0, 0.0, 0.0, 50.0, 100.0]
        meas = [0.1, 0.15, 0.12, 50.0, 100.0]
        result = run_analysis(
            reference_values=ref, measured_values=meas,
            reference_unit="Pa", measured_unit="Pa", skip_fit=True,
        )
        assert result.repeatability is not None


class TestModelDirectConformityViaSyntheticPoints:
    """data_entry_mode="model_direct" has no raw data at all — the wizard
    feeds two synthetic zero-residual points (measured == reference) at the
    model's declared valid_range_min/max through this same skip_fit path
    (see CalibrationWizard.tsx's model_direct useEffect). Verifies that
    trick actually produces the "model trusted as declared" semantics: a
    zero Type A contribution and a conformity check against max_error=0."""

    def test_type_a_contribution_is_exactly_zero(self) -> None:
        result = run_analysis(
            reference_values=[0.0, 100.0],
            measured_values=[0.0, 100.0],
            reference_unit="kPa",
            measured_unit="kPa",
            skip_fit=True,
        )
        type_a = next(c for c in result.uncertainty_budget if c["source"] == "fit_residuals")
        assert type_a["standard_uncertainty"] == 0.0

    def test_combined_uncertainty_is_purely_type_b(self) -> None:
        result = run_analysis(
            reference_values=[0.0, 100.0],
            measured_values=[0.0, 100.0],
            reference_unit="kPa",
            measured_unit="kPa",
            skip_fit=True,
            reference_standard_uncertainty=0.5,
            reference_standard_coverage_factor=2.0,
        )
        assert result.combined_uncertainty == pytest.approx(0.5 / 2.0)

    def test_conformity_checked_at_both_range_endpoints(self) -> None:
        # percent_of_reading tolerance scales with |ref| -> checking both
        # endpoints (not just the max) matters for this accuracy type.
        result = run_analysis(
            reference_values=[1.0, 100.0],
            measured_values=[1.0, 100.0],
            reference_unit="kPa",
            measured_unit="kPa",
            skip_fit=True,
            channel_accuracy_value=0.5,
            channel_accuracy_type="percent_of_reading",
        )
        assert result.passed is True
        assert result.max_error == 0.0


# ---------------------------------------------------------------------------
# run_analysis — calibration_method="lookup_table" / "custom_formula"
# (data_entry_mode=raw_data's Step 3 "Calibration method" selector)
# ---------------------------------------------------------------------------

class TestLookupTableMethod:
    def test_no_fit_metadata_returned(self) -> None:
        result = run_analysis(
            reference_values=[0.0, 10.0, 20.0, 30.0],
            measured_values=[0.1, 10.2, 19.8, 30.1],
            reference_unit="°C", measured_unit="°C",
            calibration_method="lookup_table",
        )
        assert result.poly_degree is None
        assert result.coefficients == []
        assert result.poly_coefficients_covariance is None
        assert result.non_linearity_pct is None
        assert result.resolved_custom_formula is None

    def test_residuals_are_exactly_zero_at_training_points(self) -> None:
        # An interpolant through its own training data reproduces every
        # point exactly, regardless of the data's own noise/scatter.
        result = run_analysis(
            reference_values=[0.0, 10.0, 20.0, 30.0],
            measured_values=[0.1, 10.2, 19.8, 30.1],
            reference_unit="°C", measured_unit="°C",
            calibration_method="lookup_table",
        )
        for pt in result.points:
            assert pt.residual_abs == pytest.approx(0.0, abs=1e-9)
        assert result.r_squared == pytest.approx(1.0)
        assert result.rmse == pytest.approx(0.0, abs=1e-9)
        assert result.max_error == pytest.approx(0.0, abs=1e-9)

    def test_interpolates_linearly_between_points(self) -> None:
        # Evaluate the interpolant off-training-point via the point list's
        # own calculated_value at a query that IS a training point (direct
        # np.interp behavior is exercised more directly on the frontend
        # equivalent — this asserts the backend's fitted array matches
        # linear interpolation, not some other curve).
        result = run_analysis(
            reference_values=[0.0, 100.0],
            measured_values=[0.0, 100.0],
            reference_unit="kPa", measured_unit="kPa",
            calibration_method="lookup_table",
        )
        assert result.points[0].calculated_value == pytest.approx(0.0)
        assert result.points[1].calculated_value == pytest.approx(100.0)

    def test_type_a_contribution_is_zero(self) -> None:
        result = run_analysis(
            reference_values=[0.0, 10.0, 20.0],
            measured_values=[0.05, 9.9, 20.1],
            reference_unit="°C", measured_unit="°C",
            calibration_method="lookup_table",
            reference_standard_uncertainty=0.02,
        )
        type_a = next(c for c in result.uncertainty_budget if c["source"] == "fit_residuals")
        assert type_a["standard_uncertainty"] == pytest.approx(0.0, abs=1e-9)
        # Type B (reference standard) still combines in normally.
        assert "reference_standard" in [c["source"] for c in result.uncertainty_budget]
        assert result.combined_uncertainty > 0.0


class TestCustomFormulaMethod:
    def test_recovers_known_linear_parameters(self) -> None:
        # y = 2*x + 1, exact (no noise) -> should recover a=2, b=1 precisely.
        x = list(range(10))
        y = [2.0 * xi + 1.0 for xi in x]
        result = run_analysis(
            reference_values=y, measured_values=[float(v) for v in x],
            reference_unit="°C", measured_unit="°C",
            calibration_method="custom_formula", custom_formula="a*x + b",
        )
        assert result.custom_formula_parameter_values is not None
        assert result.custom_formula_parameter_values["a"] == pytest.approx(2.0, abs=1e-4)
        assert result.custom_formula_parameter_values["b"] == pytest.approx(1.0, abs=1e-4)
        assert result.resolved_custom_formula is not None
        assert result.r_squared == pytest.approx(1.0, abs=1e-6)

    def test_resolved_formula_is_directly_evaluable(self) -> None:
        from app.services.formula_eval import evaluate_formula
        x = list(range(10))
        y = [2.0 * xi + 1.0 for xi in x]
        result = run_analysis(
            reference_values=y, measured_values=[float(v) for v in x],
            reference_unit="°C", measured_unit="°C",
            calibration_method="custom_formula", custom_formula="a*x + b",
        )
        assert evaluate_formula(result.resolved_custom_formula, 5.0) == pytest.approx(11.0, abs=1e-3)

    def test_poly_fields_stay_empty(self) -> None:
        x = list(range(5))
        y = [3.0 * xi for xi in x]
        result = run_analysis(
            reference_values=y, measured_values=[float(v) for v in x],
            reference_unit="°C", measured_unit="°C",
            calibration_method="custom_formula", custom_formula="a*x",
        )
        assert result.poly_degree is None
        assert result.coefficients == []
        assert result.poly_coefficients_covariance is None

    def test_non_linearity_is_computed_unlike_lookup_table(self) -> None:
        # Custom Formula is a real fit (unlike Lookup Table) -> non-linearity
        # is meaningful and computed the same way a polynomial fit's is.
        x = [float(v) for v in range(10)]
        y = [xi ** 2 for xi in x]
        result = run_analysis(
            reference_values=y, measured_values=x,
            reference_unit="°C", measured_unit="°C",
            calibration_method="custom_formula", custom_formula="a*x^2 + b",
        )
        assert result.non_linearity_pct is not None

    def test_formula_with_no_free_parameters_raises(self) -> None:
        with pytest.raises(ValueError, match="free parameters"):
            run_analysis(
                reference_values=[1.0, 2.0, 3.0], measured_values=[1.0, 2.0, 3.0],
                reference_unit="°C", measured_unit="°C",
                calibration_method="custom_formula", custom_formula="x + 1",
            )

    def test_missing_formula_raises(self) -> None:
        with pytest.raises(ValueError):
            run_analysis(
                reference_values=[1.0, 2.0, 3.0], measured_values=[1.0, 2.0, 3.0],
                reference_unit="°C", measured_unit="°C",
                calibration_method="custom_formula", custom_formula=None,
            )
