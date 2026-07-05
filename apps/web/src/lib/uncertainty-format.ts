/**
 * Reporting-rule helper for measurement uncertainty, per JCGM 100:2008 (GUM) §7.2.6:
 * quote a combined/expanded standard uncertainty to at most two significant figures.
 * Mirrors `apps/api/app/utils/uncertainty_format.py::round_to_sig_figs`.
 */
export function roundToSigFigs(value: number, sigFigs = 2): number {
  if (value === 0 || !Number.isFinite(value)) return value;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = Math.pow(10, sigFigs - 1 - magnitude);
  return Math.round(value * factor) / factor;
}
