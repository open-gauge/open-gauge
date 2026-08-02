"""
Safe evaluation of user-supplied "custom formula" calibration models
(Calibration.model_type == "custom_formula") — a single-variable expression
in `x` (e.g. "1.0023*x + 0.0012*x^2 - 0.5"), evaluated wherever a polynomial's
poly_coefficients would otherwise be (the fitted-curve chart, Health tab drift
evolution, curve comparison).

Uses simpleeval rather than Python's eval()/exec() — it restricts the
evaluated grammar to arithmetic + a fixed function whitelist, with no
attribute access, no name resolution beyond `names`, and no way to reach
builtins. The exact same whitelist (operators + function names) must be
honored by the frontend evaluator (apps/web/src/lib/evaluate-model.ts,
using expr-eval) so a formula behaves identically on both sides.
"""
import math

from simpleeval import SimpleEval

# Keep this whitelist in sync with apps/web/src/lib/evaluate-model.ts's
# expr-eval function list — both sides must agree on exactly what a formula
# is allowed to use, since the stored formula string is the canonical truth
# evaluated independently by each side.
ALLOWED_FUNCTIONS = {
    "sqrt": math.sqrt,
    "exp": math.exp,
    "log": math.log,
    "ln": math.log,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "abs": abs,
    "pow": pow,
}


def evaluate_formula(formula: str, x: float, extra_names: dict[str, float] | None = None) -> float:
    """Evaluate `formula` (a single-variable expression in `x`) at one point.

    `extra_names` supplies additional bindings beyond `x` — used only while
    fitting a "custom formula" *template* that still has free parameters
    (e.g. evaluating "a*x + b" at trial values of a/b during
    scipy.optimize.curve_fit; see calibration_analysis.py's
    calibration_method="custom_formula"). A fully-resolved, stored
    Calibration.custom_formula never needs this — it's x-only by then.

    Raises ValueError for an empty/invalid formula or one that fails to
    evaluate (e.g. a disallowed name, division by zero, domain error).
    """
    if not formula or not formula.strip():
        raise ValueError("Formula must not be empty")
    names = {"x": x}
    if extra_names:
        names.update(extra_names)
    # The documented/user-facing formula syntax (and expr-eval on the
    # frontend) uses `^` for exponentiation, spreadsheet/calculator-style.
    # Python's own grammar gives `^` (bitwise XOR) a much *lower* precedence
    # than `+`/`-`/`*` — e.g. "x^2 + 1" would parse as "x ^ (2 + 1)" — so
    # remapping just the operator's evaluated function isn't enough; the
    # substitution has to happen before ast.parse ever sees it, so Python's
    # own (correct, tight-binding) `**` precedence is what actually applies.
    evaluator = SimpleEval(functions=ALLOWED_FUNCTIONS, names=names)
    try:
        result = evaluator.eval(formula.replace("^", "**"))
    except Exception as e:
        raise ValueError(f"Invalid formula: {e}") from e
    return float(result)


def evaluate_formula_array(formula: str, x_values: list[float]) -> list[float]:
    """Evaluate `formula` at each of `x_values`, same semantics as evaluate_formula."""
    return [evaluate_formula(formula, x) for x in x_values]


def validate_formula(formula: str) -> None:
    """Raise ValueError if `formula` doesn't parse/evaluate at a test point.

    Used at calibration-create time so an invalid custom formula is rejected
    (422) before it's stored, rather than failing later wherever it's
    evaluated (the chart, Health tab drift).
    """
    evaluate_formula(formula, x=1.0)
