"""Unit tests for app.health.regression — pure functions, no DB."""
import pytest

from app.health import regression


class TestFitLinear:
    def test_recovers_known_slope_and_intercept(self) -> None:
        x = [0.0, 1.0, 2.0, 3.0, 4.0]
        y = [3.0 + 2.0 * xi for xi in x]  # y = 2x + 3, noiseless
        fit = regression.fit_linear(x, y)
        assert fit.slope == pytest.approx(2.0, abs=1e-9)
        assert fit.intercept == pytest.approx(3.0, abs=1e-9)
        assert fit.r_squared == pytest.approx(1.0, abs=1e-9)

    def test_flat_line_has_zero_slope(self) -> None:
        fit = regression.fit_linear([0.0, 1.0, 2.0], [5.0, 5.0, 5.0])
        assert fit.slope == pytest.approx(0.0, abs=1e-9)
        assert fit.r_squared == pytest.approx(1.0, abs=1e-9)

    def test_raises_with_fewer_than_two_points(self) -> None:
        with pytest.raises(ValueError):
            regression.fit_linear([1.0], [1.0])

    def test_raises_on_mismatched_lengths(self) -> None:
        with pytest.raises(ValueError):
            regression.fit_linear([1.0, 2.0], [1.0])

    def test_identical_x_values_does_not_crash(self) -> None:
        # Regression test: two calibrations logged on the same date produce
        # identical x (days-since-first = 0), which made numpy.polyfit's
        # least-squares solve singular (LinAlgError: SVD did not converge)
        # and crashed the /health endpoint with a 500.
        fit = regression.fit_linear([0.0, 0.0], [3.0, 5.0])
        assert fit.slope == pytest.approx(0.0)
        assert fit.intercept == pytest.approx(4.0)
        assert fit.r_squared == pytest.approx(0.0)

    def test_identical_x_and_y_values_is_perfect_fit(self) -> None:
        fit = regression.fit_linear([2.0, 2.0, 2.0], [7.0, 7.0, 7.0])
        assert fit.slope == pytest.approx(0.0)
        assert fit.intercept == pytest.approx(7.0)
        assert fit.r_squared == pytest.approx(1.0)


class TestPredictLinear:
    def test_predicts_along_the_fitted_line(self) -> None:
        fit = regression.fit_linear([0.0, 1.0, 2.0], [1.0, 3.0, 5.0])  # y = 2x + 1
        assert regression.predict_linear(fit, 10.0) == pytest.approx(21.0, abs=1e-9)


class TestEvaluatePolynomial:
    def test_evaluates_linear_polynomial(self) -> None:
        # y = 2x + 1, numpy convention: highest degree first
        result = regression.evaluate_polynomial([2.0, 1.0], [0.0, 1.0, 2.0])
        assert result == pytest.approx([1.0, 3.0, 5.0])

    def test_evaluates_quadratic_polynomial(self) -> None:
        # y = x^2
        result = regression.evaluate_polynomial([1.0, 0.0, 0.0], [0.0, 2.0, 3.0])
        assert result == pytest.approx([0.0, 4.0, 9.0])


class TestGenerateXRange:
    def test_returns_requested_number_of_points(self) -> None:
        xs = regression.generate_x_range(0.0, 10.0, 200)
        assert len(xs) == 200
        assert xs[0] == pytest.approx(0.0)
        assert xs[-1] == pytest.approx(10.0)

    def test_raises_when_max_below_min(self) -> None:
        with pytest.raises(ValueError):
            regression.generate_x_range(10.0, 0.0)

    def test_raises_with_too_few_points(self) -> None:
        with pytest.raises(ValueError):
            regression.generate_x_range(0.0, 1.0, 1)
