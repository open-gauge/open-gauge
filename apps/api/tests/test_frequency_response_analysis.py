"""
Unit tests for the frequency-response sensitivity service.

Pure-Python — no database or HTTP client needed. Covers the sensitivity/
deviation math and the error cases (<2 points, invalid baseline index,
zero reference/gain).
"""
import pytest

from app.services.frequency_response_analysis import compute_sensitivity_sweep


class TestComputeSensitivitySweep:
    def test_baseline_deviation_is_exactly_zero(self) -> None:
        result = compute_sensitivity_sweep(
            sweep_indices=[0, 1, 2],
            frequency_values=[10.0, 100.0, 1000.0],
            reference_values=[1.0, 1.0, 1.0],
            measured_values=[10.0, 12.0, 8.0],
            baseline_sweep_index=1,
        )
        baseline_point = next(p for p in result.points if p.sweep_index == 1)
        assert baseline_point.deviation_pct == 0.0

    def test_hand_computed_ratios_and_deviation(self) -> None:
        # baseline sensitivity = 12/1 = 12 (the gain); point 0's sensitivity
        # = 10/1 = 10, deviation = (10 - 12) / 12 * 100 = -16.666...%
        result = compute_sensitivity_sweep(
            sweep_indices=[0, 1],
            frequency_values=[10.0, 100.0],
            reference_values=[1.0, 1.0],
            measured_values=[10.0, 12.0],
            baseline_sweep_index=1,
        )
        assert result.gain == pytest.approx(12.0)
        assert result.poly_coefficients == [pytest.approx(12.0), 0.0]
        point0 = next(p for p in result.points if p.sweep_index == 0)
        assert point0.sensitivity_value == pytest.approx(10.0)
        assert point0.deviation_pct == pytest.approx(-100 / 6)

    def test_range_min_max_from_reference_values(self) -> None:
        result = compute_sensitivity_sweep(
            sweep_indices=[0, 1, 2],
            frequency_values=[10.0, 100.0, 1000.0],
            reference_values=[2.0, 5.0, 1.0],
            measured_values=[4.0, 10.0, 2.0],
            baseline_sweep_index=0,
        )
        assert result.range_min == 1.0
        assert result.range_max == 5.0

    def test_fewer_than_two_points_raises(self) -> None:
        with pytest.raises(ValueError, match="at least 2 points"):
            compute_sensitivity_sweep(
                sweep_indices=[0],
                frequency_values=[10.0],
                reference_values=[1.0],
                measured_values=[10.0],
                baseline_sweep_index=0,
            )

    def test_invalid_baseline_index_raises(self) -> None:
        with pytest.raises(ValueError, match="not among the sweep"):
            compute_sensitivity_sweep(
                sweep_indices=[0, 1],
                frequency_values=[10.0, 100.0],
                reference_values=[1.0, 1.0],
                measured_values=[10.0, 12.0],
                baseline_sweep_index=5,
            )

    def test_zero_reference_value_raises(self) -> None:
        with pytest.raises(ValueError, match="reference_value cannot be zero"):
            compute_sensitivity_sweep(
                sweep_indices=[0, 1],
                frequency_values=[10.0, 100.0],
                reference_values=[0.0, 1.0],
                measured_values=[10.0, 12.0],
                baseline_sweep_index=1,
            )

    def test_zero_baseline_gain_raises(self) -> None:
        with pytest.raises(ValueError, match="Baseline sensitivity is zero"):
            compute_sensitivity_sweep(
                sweep_indices=[0, 1],
                frequency_values=[10.0, 100.0],
                reference_values=[1.0, 1.0],
                measured_values=[0.0, 12.0],
                baseline_sweep_index=0,
            )

    def test_mismatched_list_lengths_raises(self) -> None:
        with pytest.raises(ValueError, match="same length"):
            compute_sensitivity_sweep(
                sweep_indices=[0, 1],
                frequency_values=[10.0, 100.0, 1000.0],
                reference_values=[1.0, 1.0],
                measured_values=[10.0, 12.0],
                baseline_sweep_index=0,
            )
