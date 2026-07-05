"""Unit tests for app.health.scoring — pure functions, no DB."""
import pytest

from app.health import scoring


class TestHealthScoreWeights:
    def test_default_weights_sum_to_one(self) -> None:
        scoring.DEFAULT_WEIGHTS.validate()  # should not raise

    def test_validate_rejects_bad_sum(self) -> None:
        weights = scoring.HealthScoreWeights(
            max_drift=0.5, rms_drift=0.5, rmse=0.5, uncertainty=0.0,
            hysteresis=0.0, linearity=0.0, trend=0.0,
        )
        with pytest.raises(ValueError):
            weights.validate()


class TestComputeHealthScore:
    def test_all_100_scores_100(self) -> None:
        inputs = scoring.HealthScoreInputs(
            max_drift_score=100.0, rms_drift_score=100.0, rmse_score=100.0,
            uncertainty_score=100.0, hysteresis_score=100.0, linearity_score=100.0,
            trend_score=100.0,
        )
        assert scoring.compute_health_score(inputs) == pytest.approx(100.0)

    def test_all_0_scores_0(self) -> None:
        inputs = scoring.HealthScoreInputs(
            max_drift_score=0.0, rms_drift_score=0.0, rmse_score=0.0,
            uncertainty_score=0.0, hysteresis_score=0.0, linearity_score=0.0,
            trend_score=0.0,
        )
        assert scoring.compute_health_score(inputs) == pytest.approx(0.0)

    def test_known_weighted_mix(self) -> None:
        # Only max_drift (30%) is bad (0), everything else perfect (100).
        inputs = scoring.HealthScoreInputs(
            max_drift_score=0.0, rms_drift_score=100.0, rmse_score=100.0,
            uncertainty_score=100.0, hysteresis_score=100.0, linearity_score=100.0,
            trend_score=100.0,
        )
        # 100 - 30 (the missing max_drift contribution) = 70
        assert scoring.compute_health_score(inputs) == pytest.approx(70.0)

    def test_raises_with_invalid_weights(self) -> None:
        inputs = scoring.HealthScoreInputs(
            max_drift_score=100.0, rms_drift_score=100.0, rmse_score=100.0,
            uncertainty_score=100.0, hysteresis_score=100.0, linearity_score=100.0,
            trend_score=100.0,
        )
        bad_weights = scoring.HealthScoreWeights(max_drift=1.0, rms_drift=1.0, rmse=0, uncertainty=0, hysteresis=0, linearity=0, trend=0)
        with pytest.raises(ValueError):
            scoring.compute_health_score(inputs, weights=bad_weights)


class TestHealthLabel:
    @pytest.mark.parametrize(
        "score,expected",
        [(100.0, "Excellent"), (90.0, "Excellent"), (89.9, "Good"), (75.0, "Good"),
         (74.9, "Fair"), (50.0, "Fair"), (49.9, "Poor"), (0.0, "Poor")],
    )
    def test_boundaries(self, score: float, expected: str) -> None:
        assert scoring.health_label(score) == expected


class TestRecommendedIntervalMonths:
    def test_stable_extends_interval(self) -> None:
        stable = scoring.recommended_interval_months(360, "stable", 0.0)
        baseline = scoring.recommended_interval_months(360, "drifting", 0.0)
        assert stable > baseline

    def test_unstable_shrinks_interval_more_than_drifting(self) -> None:
        unstable = scoring.recommended_interval_months(360, "unstable", 0.0)
        drifting = scoring.recommended_interval_months(360, "drifting", 0.0)
        assert unstable < drifting

    def test_defaults_to_12_months_when_no_interval_configured(self) -> None:
        months = scoring.recommended_interval_months(None, "drifting", 0.0)
        assert months == round(12 * scoring.DRIFTING_SHRINK_FACTOR)

    def test_clamped_to_minimum(self) -> None:
        months = scoring.recommended_interval_months(1, "unstable", 0.0)
        assert months >= scoring.MIN_INTERVAL_MONTHS

    def test_clamped_to_maximum(self) -> None:
        months = scoring.recommended_interval_months(3650, "stable", 0.0)
        assert months <= scoring.MAX_INTERVAL_MONTHS
