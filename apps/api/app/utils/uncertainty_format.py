"""
Reporting-rule helpers for measurement uncertainty, per JCGM 100:2008 (GUM) §7.2.

GUM recommends quoting a combined/expanded standard uncertainty to at most two
significant figures, and, where a single result value is being reported
alongside it, rounding that value to the same last significant digit as its
uncertainty. See ``references/References.md`` §7.
"""
from __future__ import annotations

import math


def round_to_sig_figs(value: float, sig_figs: int = 2) -> float:
    """Round `value` to `sig_figs` significant figures (GUM §7.2.6)."""
    if value == 0 or not math.isfinite(value):
        return value
    magnitude = math.floor(math.log10(abs(value)))
    factor = 10 ** (sig_figs - 1 - magnitude)
    return round(value * factor) / factor


def format_expanded_uncertainty_statement(
    combined_uncertainty: float | None,
    expanded_uncertainty: float | None,
    coverage_factor: float | None,
    confidence_level: float | None,
    unit: str,
    effective_degrees_of_freedom: float | None = None,
    range_min: float | None = None,
    range_max: float | None = None,
) -> str | None:
    """
    Build the GUM §7.2.4-style full-sentence expanded-uncertainty statement,
    adapted for a calibration *function* (a fitted curve, not a single
    measurement result) rather than a single "y = value ± U" report: Open Gauge
    certifies a calibration function's uncertainty over its valid range, not
    one measured value.
    """
    if expanded_uncertainty is None or combined_uncertainty is None:
        return None

    u_rounded = round_to_sig_figs(expanded_uncertainty, 2)
    uc_rounded = round_to_sig_figs(combined_uncertainty, 2)

    k_str = f"a coverage factor k = {round_to_sig_figs(coverage_factor, 3):g}" if coverage_factor else "an unspecified coverage factor"
    cl_str = f"{confidence_level:.4g}%" if confidence_level else "an unspecified"
    basis = (
        f"the t-distribution for ν = {effective_degrees_of_freedom:.1f} effective degrees of freedom"
        if effective_degrees_of_freedom is not None
        else "an assumed normal distribution"
    )

    sentence = (
        f"The expanded uncertainty of this calibration is U = {u_rounded:g} {unit} "
        f"(rounded to two significant figures per JCGM 100:2008 §7.2.6), where "
        f"U = k·u_c with combined standard uncertainty u_c = {uc_rounded:g} {unit} and "
        f"{k_str}, based on {basis}, defining an interval estimated to have a level of "
        f"confidence of {cl_str}."
    )
    if range_min is not None and range_max is not None:
        sentence += f" This applies to results obtained from the fitted calibration function over the range {range_min:g} to {range_max:g} {unit}."
    return sentence
