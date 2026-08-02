"""
Unit tests for free-parameter extraction/substitution in "custom formula"
calibration models (apps/api/app/services/formula_params.py).

Pure-Python — no database or HTTP client needed.
"""
import pytest

from app.services.formula_params import extract_formula_parameters, substitute_formula_parameters


class TestExtractFormulaParameters:
    def test_simple_linear(self) -> None:
        assert extract_formula_parameters("a*x + b") == ["a", "b"]

    def test_function_call_name_not_treated_as_parameter(self) -> None:
        # "sin" is a function name, not a free parameter, even though it's a
        # bare identifier syntactically.
        assert extract_formula_parameters("a*x*sin(x) + b") == ["a", "b"]

    def test_no_parameters_when_formula_is_x_only(self) -> None:
        assert extract_formula_parameters("x^2 + 1") == []

    def test_sorted_deterministic_order(self) -> None:
        assert extract_formula_parameters("c + b*x + a*x^2") == ["a", "b", "c"]

    def test_duplicate_parameter_appears_once(self) -> None:
        assert extract_formula_parameters("a*x + a") == ["a"]

    def test_multi_character_parameter_names(self) -> None:
        assert extract_formula_parameters("k1*x + k2") == ["k1", "k2"]

    def test_nested_function_calls(self) -> None:
        assert extract_formula_parameters("a*sqrt(exp(b*x))") == ["a", "b"]

    def test_invalid_syntax_raises(self) -> None:
        with pytest.raises(ValueError):
            extract_formula_parameters("a * * x")


class TestSubstituteFormulaParameters:
    def test_substitutes_all_parameters(self) -> None:
        resolved = substitute_formula_parameters("a*x + b", {"a": 2.5, "b": 1.2})
        assert resolved == "2.5 * x + 1.2"

    def test_resolved_formula_is_valid_python_syntax(self) -> None:
        # This is the whole point of doing substitution via ast.unparse
        # instead of naive string replace or expr-eval's own toString() —
        # the result must always be re-parseable by simpleeval.
        from app.services.formula_eval import evaluate_formula
        resolved = substitute_formula_parameters("a*x*sin(x) + b", {"a": 2.5, "b": 1.2})
        assert evaluate_formula(resolved, 3.0) == pytest.approx(2.5 * 3.0 * __import__("math").sin(3.0) + 1.2)

    def test_parameter_name_is_not_confused_with_substring_of_function_name(self) -> None:
        # "a" must not accidentally match inside "abs".
        resolved = substitute_formula_parameters("abs(x) + a", {"a": 5.0})
        assert resolved == "abs(x) + 5.0"

    def test_missing_parameter_value_raises(self) -> None:
        with pytest.raises(ValueError, match="a"):
            substitute_formula_parameters("a*x + b", {"b": 1.2})

    def test_extra_unused_values_are_ignored(self) -> None:
        resolved = substitute_formula_parameters("a*x", {"a": 2.0, "unused": 99.0})
        assert resolved == "2.0 * x"

    def test_invalid_syntax_raises(self) -> None:
        with pytest.raises(ValueError):
            substitute_formula_parameters("a * * x", {"a": 1.0})
