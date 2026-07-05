"""Unit tests for app.health.prediction — pure functions, no DB."""
from datetime import date, timedelta

import pytest

from app.health import prediction

_YEAR_DAYS = 365.25


def _years_ago(n: float) -> date:
    return date.today() - timedelta(days=int(n * _YEAR_DAYS))


class TestLinearDriftPredictor:
    def test_projects_along_known_linear_trend(self) -> None:
        # drift grows ~1 unit/year, most recent point "now".
        dates = [_years_ago(4), _years_ago(3), _years_ago(2), _years_ago(1), _years_ago(0)]
        values = [0.0, 1.0, 2.0, 3.0, 4.0]
        result = prediction.LinearDriftPredictor().predict(dates, values, tolerance=None)

        assert result.projected_drift_1y == pytest.approx(5.0, abs=0.2)
        assert result.projected_drift_2y == pytest.approx(6.0, abs=0.2)
        assert result.projected_drift_5y == pytest.approx(9.0, abs=0.2)
        assert result.confidence_pct == pytest.approx(100.0, abs=1.0)
        assert result.confidence_reliable is True  # 5 samples

    def test_confidence_unreliable_below_five_samples(self) -> None:
        dates = [_years_ago(2), _years_ago(1), _years_ago(0)]
        values = [0.0, 1.0, 2.0]
        result = prediction.LinearDriftPredictor().predict(dates, values, tolerance=None)
        assert result.confidence_reliable is False

    def test_tolerance_exceeded_date_in_the_future(self) -> None:
        dates = [_years_ago(4), _years_ago(3), _years_ago(2), _years_ago(1), _years_ago(0)]
        values = [0.0, 1.0, 2.0, 3.0, 4.0]  # slope ~1/year
        result = prediction.LinearDriftPredictor().predict(dates, values, tolerance=10.0)
        assert result.projected_tolerance_exceeded_date is not None
        assert result.projected_tolerance_exceeded_date > date.today()
        assert result.remaining_useful_life_months == pytest.approx(72.0, abs=6.0)

    def test_no_tolerance_exceeded_date_when_not_drifting_toward_tolerance(self) -> None:
        dates = [_years_ago(4), _years_ago(3), _years_ago(2), _years_ago(1), _years_ago(0)]
        values = [4.0, 4.0, 4.0, 4.0, 4.0]  # flat, zero slope
        result = prediction.LinearDriftPredictor().predict(dates, values, tolerance=10.0)
        assert result.projected_tolerance_exceeded_date is None
        assert result.remaining_useful_life_months is None

    def test_raises_with_fewer_than_two_points(self) -> None:
        with pytest.raises(ValueError):
            prediction.LinearDriftPredictor().predict([date.today()], [1.0], tolerance=None)


class TestGetDefaultPredictor:
    def test_returns_linear_predictor(self) -> None:
        predictor = prediction.get_default_predictor()
        assert isinstance(predictor, prediction.LinearDriftPredictor)
