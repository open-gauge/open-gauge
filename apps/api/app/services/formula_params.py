"""
Free-parameter extraction and substitution for "custom formula" calibration
models (Calibration.model_type == "custom_formula") that contain unresolved
symbols besides `x` — e.g. "a*x*sin(x) + b" with free parameters a, b.

Used two ways (see calibration_analysis.py's calibration_method="custom_formula"
and the API layer's skip_fit + custom_formula_template path):
  - declared: the user supplies a value for each parameter directly (no raw
    data to fit against — data_entry_mode=model_direct).
  - fitted: scipy.optimize.curve_fit determines the parameter values from
    raw calibration data (data_entry_mode=raw_data, calibration_method=
    custom_formula).

Either way, the final stored/evaluated Calibration.custom_formula is always a
fully-resolved, x-only expression — these functions are only used at
create/analyze time to get there, never at evaluation time (see
formula_eval.py for that).
"""
from __future__ import annotations

import ast

# Must match formula_eval.ALLOWED_FUNCTIONS' keys — a function name used as a
# Call target (e.g. "sin" in "sin(x)") is never itself a free parameter.
from .formula_eval import ALLOWED_FUNCTIONS


def extract_formula_parameters(formula: str) -> list[str]:
    """Return the free parameter names in `formula` — every bare identifier
    besides `x` and the whitelisted function names, sorted for determinism.

    Raises ValueError if `formula` doesn't parse as a valid expression.
    """
    try:
        tree = ast.parse(formula, mode="eval")
    except SyntaxError as e:
        raise ValueError(f"Invalid formula: {e}") from e

    all_names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
    call_func_names = {
        node.func.id for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    }
    params = all_names - call_func_names - set(ALLOWED_FUNCTIONS) - {"x"}
    return sorted(params)


def substitute_formula_parameters(formula: str, values: dict[str, float]) -> str:
    """Replace every free-parameter Name node in `formula` with its numeric
    value from `values` and return the resolved expression as text.

    Uses an AST transform (not string replace) so a parameter name that's a
    substring of another token (e.g. "a" inside "abs") is never mismatched,
    and the output is always re-parseable Python/simpleeval syntax — unlike
    naive string substitution or expr-eval's own Expression.toString() (which
    emits unparenthesized function calls like "sin x" that simpleeval
    rejects; verified separately on the frontend side).

    Raises ValueError if `formula` doesn't parse, or if a required parameter
    has no value in `values`.
    """
    try:
        tree = ast.parse(formula, mode="eval")
    except SyntaxError as e:
        raise ValueError(f"Invalid formula: {e}") from e

    required = extract_formula_parameters(formula)
    missing = [p for p in required if p not in values]
    if missing:
        raise ValueError(f"Missing value(s) for parameter(s): {', '.join(missing)}")

    class _Substituter(ast.NodeTransformer):
        def visit_Name(self, node: ast.Name) -> ast.expr:
            if node.id in values:
                return ast.copy_location(ast.Constant(value=float(values[node.id])), node)
            return node

    resolved_tree = _Substituter().visit(tree)
    ast.fix_missing_locations(resolved_tree)
    return ast.unparse(resolved_tree)
