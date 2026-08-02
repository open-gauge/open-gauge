"""
Unit tests for the custom-formula calibration model evaluator.

Pure-Python — no database or HTTP client needed. Covers the arithmetic/
function whitelist, rejection of disallowed expressions, and the array/
validate wrappers.
"""
import math

import pytest

from app.services.formula_eval import evaluate_formula, evaluate_formula_array, validate_formula


class TestEvaluateFormula:
    def test_linear_formula(self) -> None:
        assert evaluate_formula("2.5 * x + 1.2", 4.0) == pytest.approx(2.5 * 4.0 + 1.2)

    def test_power_operator(self) -> None:
        assert evaluate_formula("x^2", 3.0) == pytest.approx(9.0)

    def test_allowed_functions(self) -> None:
        assert evaluate_formula("sqrt(x)", 16.0) == pytest.approx(4.0)
        assert evaluate_formula("exp(x)", 0.0) == pytest.approx(1.0)
        assert evaluate_formula("log(x)", math.e) == pytest.approx(1.0)
        assert evaluate_formula("ln(x)", math.e) == pytest.approx(1.0)
        assert evaluate_formula("sin(x)", 0.0) == pytest.approx(0.0)
        assert evaluate_formula("cos(x)", 0.0) == pytest.approx(1.0)
        assert evaluate_formula("tan(x)", 0.0) == pytest.approx(0.0)
        assert evaluate_formula("abs(x)", -5.0) == pytest.approx(5.0)
        assert evaluate_formula("pow(x, 3)", 2.0) == pytest.approx(8.0)

    def test_nested_expression(self) -> None:
        assert evaluate_formula("sqrt(x^2 + 1) - abs(x)", 3.0) == pytest.approx(math.sqrt(10) - 3.0)

    def test_constant_formula_ignores_x(self) -> None:
        assert evaluate_formula("42", 999.0) == pytest.approx(42.0)

    def test_empty_formula_raises(self) -> None:
        with pytest.raises(ValueError, match="empty"):
            evaluate_formula("", 1.0)

    def test_whitespace_only_formula_raises(self) -> None:
        with pytest.raises(ValueError, match="empty"):
            evaluate_formula("   ", 1.0)

    def test_disallowed_name_raises(self) -> None:
        with pytest.raises(ValueError):
            evaluate_formula("y + 1", 1.0)

    def test_disallowed_function_raises(self) -> None:
        with pytest.raises(ValueError):
            evaluate_formula("__import__('os').system('echo hi')", 1.0)

    def test_attribute_access_raises(self) -> None:
        with pytest.raises(ValueError):
            evaluate_formula("x.__class__", 1.0)

    def test_syntax_error_raises(self) -> None:
        with pytest.raises(ValueError):
            evaluate_formula("2 * * x", 1.0)


class TestEvaluateFormulaArray:
    def test_evaluates_each_point(self) -> None:
        result = evaluate_formula_array("x^2", [1.0, 2.0, 3.0])
        assert result == pytest.approx([1.0, 4.0, 9.0])

    def test_propagates_invalid_formula(self) -> None:
        with pytest.raises(ValueError):
            evaluate_formula_array("y + 1", [1.0, 2.0])


class TestValidateFormula:
    def test_valid_formula_does_not_raise(self) -> None:
        validate_formula("2.5 * x + 1.2")

    def test_invalid_formula_raises(self) -> None:
        with pytest.raises(ValueError):
            validate_formula("not_a_function(x)")
