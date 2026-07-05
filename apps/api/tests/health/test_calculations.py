"""Unit tests for app.health.calculations — pure functions, no DB."""
from datetime import date

import pytest

from app.health import calculations
from app.health.calculations import CalibrationSummary


_UNSET = object()


def _summary(
    id_: str = "c1",
    calibration_date: date = date(2024, 1, 1),
    poly_coefficients: object = _UNSET,
    valid_range_min: float | None = 0.0,
    valid_range_max: float | None = 100.0,
    r_squared: float | None = 0.999,
    rmse: float | None = 0.1,
    max_error: float | None = 0.2,
    expanded_uncertainty: float | None = 0.3,
    hysteresis: float | None = 0.05,
    non_linearity: float | None = 0.1,
    repeatability: float | None = 0.02,
    calibration_interval: int | None = 365,
) -> CalibrationSummary:
    return CalibrationSummary(
        id=id_,
        calibration_date=calibration_date,
        performed_by_name="Tester",
        poly_order=1,
        poly_coefficients=[1.0, 0.0] if poly_coefficients is _UNSET else poly_coefficients,  # default: y = x
        valid_range_min=valid_range_min,
        valid_range_max=valid_range_max,
        r_squared=r_squared,
        rmse=rmse,
        max_error=max_error,
        expanded_uncertainty=expanded_uncertainty,
        hysteresis=hysteresis,
        non_linearity=non_linearity,
        repeatability=repeatability,
        calibration_interval=calibration_interval,
    )


class TestMaxDriftSeries:
    def test_constant_offset_yields_that_offset_as_drift(self) -> None:
        baseline = _summary(poly_coefficients=[1.0, 0.0])  # y = x
        offset_cal = _summary(poly_coefficients=[1.0, 5.0])  # y = x + 5
        series = calculations.max_drift_series([baseline, offset_cal], baseline)
        assert series[0] == pytest.approx(0.0, abs=1e-6)
        assert series[1] == pytest.approx(5.0, abs=1e-6)

    def test_non_overlapping_range_yields_none(self) -> None:
        baseline = _summary(valid_range_min=0.0, valid_range_max=10.0)
        other = _summary(valid_range_min=20.0, valid_range_max=30.0)
        series = calculations.max_drift_series([other], baseline)
        assert series == [None]

    def test_missing_baseline_polynomial_yields_all_none(self) -> None:
        baseline = _summary(poly_coefficients=None)
        other = _summary()
        series = calculations.max_drift_series([other], baseline)
        assert series == [None]


class TestDriftRatePerYear:
    def test_linear_increase_recovers_rate(self) -> None:
        dates = [date(2020, 1, 1), date(2021, 1, 1), date(2022, 1, 1)]
        drift = [0.0, 1.0, 2.0]  # ~1 unit/year
        rate = calculations.drift_rate_per_year(dates, drift)
        assert rate == pytest.approx(1.0, abs=0.05)

    def test_raises_on_empty_dates(self) -> None:
        with pytest.raises(ValueError):
            calculations.drift_rate_per_year([], [])


class TestStabilityClassification:
    def test_low_drift_is_stable(self) -> None:
        assert calculations.stability_classification(0.1, 0.99) == "stable"

    def test_moderate_drift_is_drifting(self) -> None:
        assert calculations.stability_classification(1.0, 0.95) == "drifting"

    def test_high_drift_is_unstable(self) -> None:
        assert calculations.stability_classification(3.0, 0.95) == "unstable"

    def test_poor_fit_is_unstable_even_with_low_drift(self) -> None:
        assert calculations.stability_classification(0.1, 0.2) == "unstable"

    def test_unknown_span_defaults_to_stable(self) -> None:
        assert calculations.stability_classification(None, 0.99) == "stable"


class TestMovingAverage:
    def test_centered_average_of_constant_series(self) -> None:
        result = calculations.moving_average([1.0, 2.0, 3.0, 4.0, 5.0], window=3)
        assert result[0] is None
        assert result[1] == pytest.approx(2.0)
        assert result[2] == pytest.approx(3.0)
        assert result[3] == pytest.approx(4.0)
        assert result[4] is None

    def test_none_in_window_propagates_none(self) -> None:
        result = calculations.moving_average([1.0, None, 3.0], window=3)
        assert result == [None, None, None]

    def test_raises_on_zero_window(self) -> None:
        with pytest.raises(ValueError):
            calculations.moving_average([1.0], window=0)


class TestHistoricalDeltas:
    def test_deltas_and_trend_classification(self) -> None:
        prev = _summary(rmse=0.5, expanded_uncertainty=0.5, max_error=0.5, hysteresis=0.5)
        curr = _summary(rmse=0.6, expanded_uncertainty=0.4, max_error=0.5, hysteresis=0.5)
        result = calculations.historical_deltas([prev, curr])
        assert result["delta_rmse"] == pytest.approx(0.1)
        assert result["trend_rmse"] == "degrading"
        assert result["delta_uncertainty"] == pytest.approx(-0.1)
        assert result["trend_uncertainty"] == "improving"
        assert result["delta_max_error"] == pytest.approx(0.0)
        assert result["trend_max_error"] == "stable"

    def test_raises_with_fewer_than_two(self) -> None:
        with pytest.raises(ValueError):
            calculations.historical_deltas([_summary()])


class TestCurveComparison:
    def test_constant_offset_between_curves(self) -> None:
        reference = _summary(poly_coefficients=[1.0, 0.0], valid_range_min=0.0, valid_range_max=10.0)  # y = x
        current = _summary(poly_coefficients=[1.0, 2.0], valid_range_min=0.0, valid_range_max=10.0)  # y = x + 2
        result = calculations.curve_comparison(reference, current, n_points=50)
        assert len(result.x) == 50
        assert result.offset == pytest.approx(2.0, abs=1e-6)
        assert result.residual_drift == pytest.approx(0.0, abs=1e-6)
        assert result.gain == pytest.approx(0.0, abs=1e-6)
        assert result.max_drift == pytest.approx(2.0, abs=1e-6)
        assert result.mean_drift == pytest.approx(2.0, abs=1e-6)
        assert result.rms_drift == pytest.approx(2.0, abs=1e-6)

    def test_gain_drift_detected(self) -> None:
        reference = _summary(poly_coefficients=[1.0, 0.0], valid_range_min=0.0, valid_range_max=10.0)  # y = x
        current = _summary(poly_coefficients=[1.1, 0.0], valid_range_min=0.0, valid_range_max=10.0)  # y = 1.1x
        result = calculations.curve_comparison(reference, current, n_points=50)
        assert result.offset == pytest.approx(0.0, abs=1e-6)
        assert result.gain == pytest.approx(0.1, abs=1e-6)
        assert result.residual_drift == pytest.approx(1.0, abs=1e-6)

    def test_raises_on_non_overlapping_ranges(self) -> None:
        reference = _summary(valid_range_min=0.0, valid_range_max=10.0)
        current = _summary(valid_range_min=20.0, valid_range_max=30.0)
        with pytest.raises(ValueError):
            calculations.curve_comparison(reference, current)

    def test_raises_when_missing_polynomial(self) -> None:
        reference = _summary(poly_coefficients=None)
        current = _summary()
        with pytest.raises(ValueError):
            calculations.curve_comparison(reference, current)
