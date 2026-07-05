"""Unit tests for app.health.normalization — pure functions, no DB."""
import pytest

from app.health import normalization


class TestClamp:
    def test_within_range_unchanged(self) -> None:
        assert normalization.clamp(50.0) == 50.0

    def test_clamps_above_hi(self) -> None:
        assert normalization.clamp(150.0) == 100.0

    def test_clamps_below_lo(self) -> None:
        assert normalization.clamp(-10.0) == 0.0

    def test_custom_bounds(self) -> None:
        assert normalization.clamp(70.0, lo=1.0, hi=60.0) == 60.0


class TestNormalizeInverse:
    def test_at_good_is_100(self) -> None:
        assert normalization.normalize_inverse(0.5, good=0.5, bad=5.0) == pytest.approx(100.0)

    def test_at_bad_is_0(self) -> None:
        assert normalization.normalize_inverse(5.0, good=0.5, bad=5.0) == pytest.approx(0.0)

    def test_beyond_bad_clamps_to_0(self) -> None:
        assert normalization.normalize_inverse(50.0, good=0.5, bad=5.0) == pytest.approx(0.0)

    def test_beyond_good_clamps_to_100(self) -> None:
        assert normalization.normalize_inverse(0.0, good=0.5, bad=5.0) == pytest.approx(100.0)

    def test_uses_absolute_value(self) -> None:
        assert normalization.normalize_inverse(-0.5, good=0.5, bad=5.0) == pytest.approx(100.0)

    def test_midpoint_is_50(self) -> None:
        assert normalization.normalize_inverse(2.75, good=0.5, bad=5.0) == pytest.approx(50.0)

    def test_raises_when_thresholds_equal(self) -> None:
        with pytest.raises(ValueError):
            normalization.normalize_inverse(1.0, good=1.0, bad=1.0)


class TestNormalizeDirect:
    def test_at_good_is_100(self) -> None:
        assert normalization.normalize_direct(0.99, bad=0.0, good=0.99) == pytest.approx(100.0)

    def test_at_bad_is_0(self) -> None:
        assert normalization.normalize_direct(0.0, bad=0.0, good=0.99) == pytest.approx(0.0)

    def test_raises_when_thresholds_equal(self) -> None:
        with pytest.raises(ValueError):
            normalization.normalize_direct(1.0, bad=1.0, good=1.0)
