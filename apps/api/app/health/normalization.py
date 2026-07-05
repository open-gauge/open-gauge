"""Pure 0-100 scaling helpers.

No calibration domain knowledge lives here — just number-in, score-out
utilities shared by scoring.py and the radar chart. Kept separate from
calculations.py so the "what does a good value look like" mapping can be
tuned independently of "how do we compute the raw value".
"""


def clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def normalize_inverse(value: float, good: float, bad: float) -> float:
    """Map a 'lower is better' metric to a 0-100 score.

    100 = at or better than `good`, 0 = at or worse than `bad`.
    Used for metrics like drift, RMSE, uncertainty, hysteresis where a
    smaller magnitude is healthier. `value` is compared by absolute value
    since drift/error metrics are meaningful regardless of sign.
    """
    if bad == good:
        raise ValueError("`bad` and `good` thresholds must differ")
    v = abs(value)
    span = bad - good
    score = 100.0 * (bad - v) / span
    return clamp(score)


def normalize_direct(value: float, bad: float, good: float) -> float:
    """Map a 'higher is better' metric to a 0-100 score (e.g. R^2).

    100 = at or better than `good`, 0 = at or worse than `bad`.
    """
    if bad == good:
        raise ValueError("`bad` and `good` thresholds must differ")
    span = good - bad
    score = 100.0 * (value - bad) / span
    return clamp(score)
