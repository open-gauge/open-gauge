import { Parser } from "expr-eval";

/**
 * Evaluates a calibration's model (polynomial or custom formula) at x.
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

export function evaluateModel(
  modelType: "polynomial" | "custom_formula",
  coefficients: number[] | null,
  customFormula: string | null,
  x: number
): number {
  if (modelType === "custom_formula" && customFormula) {
    return evalCustomFormula(customFormula, x);
  }
  return evalPolynomial(coefficients ?? [], x);
}

/** Throws if `formula` doesn't parse/evaluate at a test point — used for
 * inline validation before the wizard lets a custom formula be saved. */
export function validateCustomFormula(formula: string): void {
  evalCustomFormula(formula, 1);
}
