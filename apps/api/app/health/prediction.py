"""Abstracted drift-prediction engine.

`DriftPredictor` is a structural (Protocol) interface so future models
(polynomial regression, exponential degradation, random forest, Bayesian,
neural network) can be swapped in via `get_default_predictor()` without any
change to the API layer, the response schema, or the frontend — they all
return `PredictionResult`. Only `LinearDriftPredictor` is implemented now.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Protocol

from . import regression
from .normalization import clamp

DAYS_PER_YEAR = 365.25
MONTHS_PER_DAY = 12.0 / DAYS_PER_YEAR

# Below this many historical points, the confidence estimate is not
# considered reliable (spec: "enable confidence estimation" at >= 5).
MIN_SAMPLES_FOR_RELIABLE_CONFIDENCE = 5


@dataclass
class PredictionResult:
    projected_drift_1y: float
    projected_drift_2y: float
    projected_drift_3y: float
    projected_drift_5y: float
    projected_tolerance_exceeded_date: date | None
    remaining_useful_life_months: float | None
    confidence_pct: float
    confidence_reliable: bool


class DriftPredictor(Protocol):
    def predict(
        self,
        dates: list[date],
        drift_values: list[float],
        tolerance: float | None,
    ) -> PredictionResult: ...


class LinearDriftPredictor:
    """Fits a linear trend on (years since first calibration, drift) and
    projects it forward from today. The fit's R^2 becomes the confidence
    basis.
    """

    def predict(
        self,
        dates: list[date],
        drift_values: list[float],
        tolerance: float | None,
    ) -> PredictionResult:
        if len(dates) < 2:
            raise ValueError("At least 2 data points are required for prediction")

        first = dates[0]
        x_years = [(d - first).days / DAYS_PER_YEAR for d in dates]
        fit = regression.fit_linear(x_years, drift_values)

        x_today = (date.today() - first).days / DAYS_PER_YEAR

        def project(years_ahead: float) -> float:
            return regression.predict_linear(fit, x_today + years_ahead)

        projected_tolerance_exceeded_date: date | None = None
        remaining_useful_life_months: float | None = None
        if tolerance is not None and fit.slope > 0:
            # Solve slope * x + intercept = tolerance for x, only meaningful
            # if that point is still in the future.
            x_exceeded = (tolerance - fit.intercept) / fit.slope
            if x_exceeded > x_today:
                projected_tolerance_exceeded_date = first + timedelta(days=x_exceeded * DAYS_PER_YEAR)
                remaining_days = (projected_tolerance_exceeded_date - date.today()).days
                remaining_useful_life_months = remaining_days * MONTHS_PER_DAY

        confidence_pct = clamp(fit.r_squared * 100.0)

        return PredictionResult(
            projected_drift_1y=project(1),
            projected_drift_2y=project(2),
            projected_drift_3y=project(3),
            projected_drift_5y=project(5),
            projected_tolerance_exceeded_date=projected_tolerance_exceeded_date,
            remaining_useful_life_months=remaining_useful_life_months,
            confidence_pct=confidence_pct,
            confidence_reliable=len(dates) >= MIN_SAMPLES_FOR_RELIABLE_CONFIDENCE,
        )


def get_default_predictor() -> DriftPredictor:
    """Single seam the service layer calls through — swapping the default
    predictor later is a one-line change here."""
    return LinearDriftPredictor()
