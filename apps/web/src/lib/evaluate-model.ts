import { Parser } from "expr-eval";
import type { ModelType } from "@/types/calibration";

/**
 * Evaluates a calibration's model (polynomial, custom formula, or a lookup
 * table's own points) at x.
 *
 * `expr-eval`'s default Parser already restricts the grammar to arithmetic +
 * a fixed function set (no assignment, no member/array access, no way to
 * reach anything outside the expression) — the same restriction the backend
 * applies via simpleeval (apps/api/app/services/formula_eval.py). Keep the
 * function whitelist implied here in sync with that module's
 * ALLOWED_FUNCTIONS: sqrt, exp, log, ln, sin, cos, tan, abs, pow — both sides
 * must agree on what a stored formula string is allowed to use, since it's
 * evaluated independently by each.
 */
const parser = new Parser();

/** `coefficients` follow the numpy.polyfit convention (highest degree first),
 * matching how Calibration.poly_coefficients is stored. */
export function evalPolynomial(coefficients: number[], x: number): number {
  let y = 0;
  const deg = coefficients.length - 1;
  for (let j = 0; j <= deg; j++) y += coefficients[j] * Math.pow(x, deg - j);
  return y;
}

export function evalCustomFormula(formula: string, x: number): number {
  return parser.parse(formula).evaluate({ x });
}

/** data_entry_mode=raw_data's "Lookup Table" calibration method — the model
 * *is* the calibration's own primary points, linearly interpolated (matches
 * calibration_analysis.py's np.interp on the backend). Points outside the
 * range clamp to the nearest endpoint's y value. */
export function evalLookupTable(points: { x: number; y: number }[], x: number): number {
  if (points.length === 0) return NaN;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (x <= sorted[0].x) return sorted[0].y;
  const last = sorted[sorted.length - 1];
  if (x >= last.x) return last.y;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (x >= a.x && x <= b.x) {
      if (b.x === a.x) return a.y;
      const t = (x - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return last.y;
}

export function evaluateModel(
  modelType: ModelType,
  coefficients: number[] | null,
  customFormula: string | null,
  x: number,
  lookupPoints?: { x: number; y: number }[]
): number {
  if (modelType === "lookup_table" && lookupPoints) {
    return evalLookupTable(lookupPoints, x);
  }
  if (modelType === "custom_formula" && customFormula) {
    return evalCustomFormula(customFormula, x);
  }
  return evalPolynomial(coefficients ?? [], x);
}

/** Throws if `formula` doesn't parse/evaluate at a test point — used for
 * inline validation before the wizard lets a custom formula be saved. Only
 * valid for a fully-resolved (x-only) formula; a template with unresolved
 * free parameters use validateFormulaTemplate below instead, since it can't
 * evaluate with only `x` bound. */
export function validateCustomFormula(formula: string): void {
  evalCustomFormula(formula, 1);
}

/** Throws if `formula` doesn't *parse* as a valid expression — unlike
 * validateCustomFormula, doesn't attempt to evaluate it, since a template
 * (e.g. "a*x + b") has free parameters beyond `x` that aren't bound yet.
 * Used for the wizard's live formula-template inputs (model_direct's
 * declare flow and raw_data's Step 3 "Custom Formula" method) — the
 * authoritative check still happens server-side at analyze/save time. */
export function validateFormulaTemplate(formula: string): void {
  parser.parse(formula);
}

/** Free parameter names in a custom-formula *template* — everything besides
 * `x` (function names like `sin` are automatically excluded by expr-eval's
 * own variables() vs. symbols() distinction — verified: "a*x*sin(x)+b" ->
 * ["a","x","b"], never includes "sin"). Used for live UI only (how many
 * parameter inputs to render, or a "detected: a, b" hint) — the final
 * resolved formula is always computed server-side (see formula_params.py's
 * module docstring for why: expr-eval's own substitute().toString() emits
 * syntax simpleeval can't parse). Throws if the template doesn't parse. */
export function extractFormulaParameters(formula: string): string[] {
  return parser.parse(formula).variables().filter((v) => v !== "x");
}

const SUPERS: Record<number, string> = { 2: "²", 3: "³", 4: "⁴", 5: "⁵" };
/** a, b, c, … up to f — matches the max polynomial degree (5, i.e. 6 coefficients). */
export const POLY_LETTERS = ["a", "b", "c", "d", "e", "f"];

/** The Model panel's "general form" — a polynomial's shape with letter
 * placeholders instead of its fitted numeric coefficients, e.g. degree 2 ->
 * "f(x) = a·x² + b·x + c". Coefficient order matches
 * poly_coefficients (highest degree first), so POLY_LETTERS[i] always pairs
 * with coefficients[i] one-to-one. */
export function polynomialGeneralForm(degree: number): string {
  const parts: string[] = [];
  for (let exp = degree; exp >= 0; exp--) {
    const letter = POLY_LETTERS[degree - exp] ?? "?";
    if (exp === 0) parts.push(letter);
    else if (exp === 1) parts.push(`${letter}·x`);
    else parts.push(`${letter}·x${SUPERS[exp] ?? `^${exp}`}`);
  }
  return "f(x) = " + parts.join(" + ");
}

/** LaTeX form of polynomialGeneralForm, for KaTeX rendering. */
export function polynomialGeneralFormLatex(degree: number): string {
  const parts: string[] = [];
  for (let exp = degree; exp >= 0; exp--) {
    const letter = POLY_LETTERS[degree - exp] ?? "?";
    if (exp === 0) parts.push(letter);
    else if (exp === 1) parts.push(`${letter} x`);
    else parts.push(`${letter} x^{${exp}}`);
  }
  return "f(x) = " + parts.join(" + ");
}

/** Best-effort conversion of a formula-template string (the JS/Python-ish
 * expression syntax this app stores — see formula_eval.py's
 * ALLOWED_FUNCTIONS) into a KaTeX-renderable LaTeX string, for the Model
 * panel's "general form" display of a custom formula. Not a full parser —
 * just enough regex substitution to make the common documented shapes
 * (custom-formulas.mdx's examples) render nicely. Callers must treat KaTeX
 * rendering as fallible (wrap in try/catch, fall back to the plain-text
 * formula) since arbitrary user input can still produce something KaTeX
 * rejects. */
export function formulaToLatex(formula: string): string {
  let s = formula;
  // sqrt(...) -> \sqrt{...} and abs(...) -> \left|...\right| need brace/
  // delimiter substitution, not just a backslash prefix.
  s = s.replace(/sqrt\(([^()]*)\)/g, "\\sqrt{$1}");
  s = s.replace(/abs\(([^()]*)\)/g, "\\left|$1\\right|");
  // Function names that render fine as "\name(" followed by plain parens.
  // "pow" is deliberately excluded — it has no KaTeX macro, and "\pow"
  // would throw (falling back to plain text for the *whole* formula); left
  // unprefixed it just renders as italicized letters, which is ugly but
  // harmless and doesn't sacrifice the rest of the formula's rendering.
  s = s.replace(/\b(exp|log|ln|sin|cos|tan)\(/g, "\\$1(");
  // x^10, x^(n+1) -> x^{10}, x^{n+1} (KaTeX requires braces for multi-char exponents).
  s = s.replace(/\^\(([^()]+)\)/g, "^{$1}");
  s = s.replace(/\^(\w+)/g, "^{$1}");
  // Implicit multiplication reads more naturally in math typesetting.
  s = s.replace(/\*/g, " \\cdot ");
  return "f(x) = " + s;
}

/** Escapes LaTeX special characters for safe use inside a \text{...} macro —
 * needed since unit strings (e.g. from a channel's freely-typed unit field)
 * are arbitrary text, and an un-escaped "%" in particular would be read as
 * a LaTeX comment, silently truncating the rest of the line. */
export function escapeLatexText(s: string): string {
  return s.replace(/[\\{}%$&#_^~]/g, (ch) => {
    if (ch === "\\") return "\\textbackslash{}";
    if (ch === "^") return "\\textasciicircum{}";
    if (ch === "~") return "\\textasciitilde{}";
    return "\\" + ch;
  });
}

/** Ordinary least-squares fit of a straight line y = slope·x + intercept
 * through `points`. Falls back to a horizontal line at the mean y if all
 * x values coincide (degenerate — avoids a divide-by-zero). */
export function fitStraightLine(points: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export interface LinearityDeviationPoint {
  x: number;
  deviationAbs: number;
  deviationPct: number;
}

/** A Lookup Table's linearity deviation — how far the piecewise-linear
 * interpolation between the calibration's own points strays from an ideal
 * straight-line reference fit through those same points, sampled densely
 * across the measured range (not just at the entered points, since that's
 * exactly where a linear interpolant and a straight-line fit are most
 * likely to coincide — the real risk is *between* points). `deviationPct`
 * is expressed as a percentage of the reference value span (%FS), matching
 * this app's other relative metrics (full_scale_error_pct, non_linearity_pct). */
export function computeLinearityDeviation(
  points: { x: number; y: number }[],
  sampleCount = 81
): LinearityDeviationPoint[] {
  if (points.length < 2) return [];
  const { slope, intercept } = fitStraightLine(points);
  const xs = points.map((p) => p.x);
  const mn = Math.min(...xs), mx = Math.max(...xs);
  const ys = points.map((p) => p.y);
  const span = Math.max(...ys) - Math.min(...ys) || 1;
  const result: LinearityDeviationPoint[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const x = mn + (i * (mx - mn)) / (sampleCount - 1);
    const deviationAbs = evalLookupTable(points, x) - (slope * x + intercept);
    result.push({ x, deviationAbs, deviationPct: (deviationAbs / span) * 100 });
  }
  return result;
}

/** Linearity deviation evaluated exactly at the calibration's own entered
 * points (rather than densely sampled) — for marking where the real data
 * points sit on the linearity deviation chart, connected by the smooth
 * curve from computeLinearityDeviation. Since a lookup table reproduces
 * each entered point exactly, no interpolation is needed here: deviation at
 * point i is simply that point's own y minus the reference line at its x. */
export function computeLinearityDeviationAtPoints(points: { x: number; y: number }[]): LinearityDeviationPoint[] {
  if (points.length < 2) return [];
  const { slope, intercept } = fitStraightLine(points);
  const ys = points.map((p) => p.y);
  const span = Math.max(...ys) - Math.min(...ys) || 1;
  return points.map((p) => {
    const deviationAbs = p.y - (slope * p.x + intercept);
    return { x: p.x, deviationAbs, deviationPct: (deviationAbs / span) * 100 };
  });
}
