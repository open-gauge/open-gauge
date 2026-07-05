"""Configurable-weights Health Score utility.

Weights are a dataclass (not module constants) so a future settings/UI
layer can supply a custom `HealthScoreWeights` without changing this
module — this is the "utility function so weights can later become
configurable" requirement.
"""
from dataclasses import dataclass

from .normalization import clamp

_WEIGHT_SUM_TOLERANCE = 1e-6

EXCELLENT_THRESHOLD = 90.0
GOOD_THRESHOLD = 75.0
FAIR_THRESHOLD = 50.0

MIN_INTERVAL_MONTHS = 1
MAX_INTERVAL_MONTHS = 60
STABLE_EXTENSION_FACTOR = 1.5
DRIFTING_SHRINK_FACTOR = 0.75
UNSTABLE_SHRINK_FACTOR = 0.5
DEFAULT_BASE_INTERVAL_MONTHS = 12.0


@dataclass
class HealthScoreWeights:
    max_drift: float = 0.30
    rms_drift: float = 0.20
    rmse: float = 0.15
    uncertainty: float = 0.10
    hysteresis: float = 0.10
    linearity: float = 0.10
    trend: float = 0.05

    def validate(self) -> None:
        total = (
            self.max_drift + self.rms_drift + self.rmse + self.uncertainty
            + self.hysteresis + self.linearity + self.trend
        )
        if abs(total - 1.0) > _WEIGHT_SUM_TOLERANCE:
            raise ValueError(f"HealthScoreWeights must sum to 1.0, got {total}")


DEFAULT_WEIGHTS = HealthScoreWeights()


@dataclass
class HealthScoreInputs:
    """Each field is an already-normalized 0-100 sub-score (see
    normalization.py) — this module only computes the weighted sum, keeping
    "what does a good value look like" separate from "how do we combine
    scores".
    """
    max_drift_score: float
    rms_drift_score: float
    rmse_score: float
    uncertainty_score: float
    hysteresis_score: float
    linearity_score: float
    trend_score: float


def compute_health_score(
    inputs: HealthScoreInputs, weights: HealthScoreWeights = DEFAULT_WEIGHTS
) -> float:
    """Returns a 0-100 weighted composite health score."""
    weights.validate()
    total = (
        inputs.max_drift_score * weights.max_drift
        + inputs.rms_drift_score * weights.rms_drift
        + inputs.rmse_score * weights.rmse
        + inputs.uncertainty_score * weights.uncertainty
        + inputs.hysteresis_score * weights.hysteresis
        + inputs.linearity_score * weights.linearity
        + inputs.trend_score * weights.trend
    )
    return clamp(total)


def health_label(score: float) -> str:
    if score >= EXCELLENT_THRESHOLD:
        return "Excellent"
    if score >= GOOD_THRESHOLD:
        return "Good"
    if score >= FAIR_THRESHOLD:
        return "Fair"
    return "Poor"


def recommended_interval_months(
    current_interval_days: int | None, stability: str, drift_rate: float
) -> int:
    """Heuristic calibration interval recommendation (not a statistical
    guarantee). Starts from the currently configured interval (converted to
    months), or a 12-month default if none is set, then scales it by
    stability:

      - stable:   extend by STABLE_EXTENSION_FACTOR
      - drifting: shrink by DRIFTING_SHRINK_FACTOR
      - unstable: shrink by UNSTABLE_SHRINK_FACTOR

    Result is clamped to [MIN_INTERVAL_MONTHS, MAX_INTERVAL_MONTHS].
    `drift_rate` is accepted for future refinement (e.g. tolerance-based
    sizing) but the current heuristic only uses the stability class.
    """
    base_months = (current_interval_days / 30.0) if current_interval_days else DEFAULT_BASE_INTERVAL_MONTHS
    factor = {
        "stable": STABLE_EXTENSION_FACTOR,
        "drifting": DRIFTING_SHRINK_FACTOR,
        "unstable": UNSTABLE_SHRINK_FACTOR,
    }.get(stability, 1.0)
    months = clamp(base_months * factor, MIN_INTERVAL_MONTHS, MAX_INTERVAL_MONTHS)
    return int(round(months))
