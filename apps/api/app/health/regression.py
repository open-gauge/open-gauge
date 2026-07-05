"""Linear regression and polynomial evaluation utilities.

Two distinct uses share this module: (a) fitting a trend line over
time-series health metrics (drift evolution, prediction), and (b)
re-evaluating a calibration's *stored* fitted polynomial for curve
comparison. Both are thin, well-tested wrappers over numpy so every other
health module can stay pure and trivially testable.
"""
from dataclasses import dataclass

import numpy as np


@dataclass
class LinearFit:
    slope: float
    intercept: float
    r_squared: float


def fit_linear(x: list[float], y: list[float]) -> LinearFit:
    """OLS fit of y = slope*x + intercept.

    Raises ValueError if there are fewer than 2 points.
    """
    if len(x) < 2 or len(y) < 2:
        raise ValueError("At least 2 points are required for a linear fit")
    if len(x) != len(y):
        raise ValueError("x and y must have the same length")

    x_arr = np.asarray(x, dtype=float)
    y_arr = np.asarray(y, dtype=float)

    if float(x_arr.max()) == float(x_arr.min()):
        # All points share the same x (e.g. multiple calibrations logged on
        # the same date) — np.polyfit's least-squares solve is singular in
        # this case. There is no time axis to infer a slope from, so treat
        # it as a flat line through the mean.
        y_mean = float(np.mean(y_arr))
        ss_tot = float(np.sum((y_arr - y_mean) ** 2))
        return LinearFit(slope=0.0, intercept=y_mean, r_squared=1.0 if ss_tot == 0 else 0.0)

    slope, intercept = np.polyfit(x_arr, y_arr, 1)

    y_pred = slope * x_arr + intercept
    ss_res = float(np.sum((y_arr - y_pred) ** 2))
    ss_tot = float(np.sum((y_arr - np.mean(y_arr)) ** 2))
    r_squared = 1.0 if ss_tot == 0 else max(0.0, 1.0 - ss_res / ss_tot)

    return LinearFit(slope=float(slope), intercept=float(intercept), r_squared=r_squared)


def predict_linear(fit: LinearFit, x: float) -> float:
    return fit.slope * x + fit.intercept


def evaluate_polynomial(coefficients: list[float], x_values: list[float]) -> list[float]:
    """Evaluate a polynomial at the given x values.

    `coefficients` follow the numpy.polyfit convention (highest degree
    first), matching how `Calibration.poly_coefficients` is stored.
    """
    return list(np.polyval(np.asarray(coefficients, dtype=float), np.asarray(x_values, dtype=float)))


def generate_x_range(x_min: float, x_max: float, n_points: int = 200) -> list[float]:
    """Evenly spaced points across [x_min, x_max].

    Called lazily by the service layer only when a curve-comparison
    request actually needs evaluated points — never precomputed.
    """
    if n_points < 2:
        raise ValueError("n_points must be at least 2")
    if x_max < x_min:
        raise ValueError("x_max must be >= x_min")
    return list(np.linspace(x_min, x_max, n_points))
