"""
Sensitivity analysis for data_entry_mode=frequency_response calibrations.

A frequency-response sweep has no transference function to fit — at each
frequency the platform is tuned to a reference amplitude and the sensor's
measured output is recorded, so the calibration result is simply the ratio
between the two (the sensor's sensitivity) at a user-chosen baseline
frequency, with every other point's ratio expressed as a % deviation from
that baseline. Internally this is represented as a polynomial-order-1,
no-offset (gain-only) model — poly_coefficients = [gain, 0.0], highest degree
first (np.polyfit convention) — on the same poly_order/poly_coefficients
columns every other calibration mode uses, even though no regression is
actually run.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FrequencyResponsePointResult:
    sweep_index: int
    frequency_value: float
    reference_value: float
    measured_value: float
    sensitivity_value: float
    deviation_pct: float


@dataclass
class FrequencyResponseResult:
    gain: float
    poly_coefficients: list[float]  # [gain, 0.0] — highest degree first
    range_min: float
    range_max: float
    points: list[FrequencyResponsePointResult] = field(default_factory=list)


def compute_sensitivity_sweep(
    sweep_indices: list[int],
    frequency_values: list[float],
    reference_values: list[float],
    measured_values: list[float],
    baseline_sweep_index: int,
) -> FrequencyResponseResult:
    """Compute per-point sensitivity/deviation and the overall gain for a
    frequency-response sweep.

    sensitivity_i = measured_i / reference_i for every point; gain is the
    baseline point's own sensitivity (its deviation_pct is exactly 0 by
    construction). range_min/range_max are the sweep's reference-value
    extremes, matching every other mode's range_min/range_max semantics
    (the domain the fitted/declared model is valid over).
    """
    n = len(sweep_indices)
    if n < 2:
        raise ValueError("A frequency response sweep needs at least 2 points")
    if not (len(frequency_values) == len(reference_values) == len(measured_values) == n):
        raise ValueError("sweep_indices/frequency_values/reference_values/measured_values must be the same length")
    if any(r == 0 for r in reference_values):
        raise ValueError("reference_value cannot be zero — sensitivity is measured/reference")
    if baseline_sweep_index not in sweep_indices:
        raise ValueError(f"baseline_sweep_index {baseline_sweep_index} is not among the sweep's points")

    sensitivities = [m / r for m, r in zip(measured_values, reference_values)]
    gain = sensitivities[sweep_indices.index(baseline_sweep_index)]
    if gain == 0:
        raise ValueError("Baseline sensitivity is zero — cannot express other points as a % deviation from it")

    points = [
        FrequencyResponsePointResult(
            sweep_index=sweep_indices[i],
            frequency_value=frequency_values[i],
            reference_value=reference_values[i],
            measured_value=measured_values[i],
            sensitivity_value=sensitivities[i],
            deviation_pct=(sensitivities[i] - gain) / gain * 100,
        )
        for i in range(n)
    ]

    return FrequencyResponseResult(
        gain=gain,
        poly_coefficients=[gain, 0.0],
        range_min=min(reference_values),
        range_max=max(reference_values),
        points=points,
    )
