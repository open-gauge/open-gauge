"""
Unit tests for the certificate LaTeX-context builder helpers.

These are pure functions (no DB/network access) that turn a Calibration-like
object into plain dicts/strings for the Jinja template, so they're tested
directly with a lightweight stand-in object rather than a full Calibration
row or a compiled PDF.
"""
import io
import uuid
from types import SimpleNamespace

from PIL import Image
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.user import User, UserRole
from app.services.certificate_service import (
    _build_coefficient_rows,
    _build_conformity,
    _build_conformity_derivation,
    _build_error_summary,
    _build_function_formula,
    _build_results_summary,
    _build_stat_rows,
    _build_uncertainty_budget_rows,
    _coefficient_name,
    _fmt,
    _fmt_accuracy,
    _normalize_to_png,
    build_random_preview_context,
    resolve_performer_user_id,
)


def _cal(**overrides) -> SimpleNamespace:
    base = dict(
        poly_coefficients=[1.0, 0.5],
        r_squared=0.999,
        rmse=0.01,
        max_error=0.02,
        standard_error=0.01,
        full_scale_error=0.1,
        non_linearity=0.05,
        repeatability=None,
        hysteresis=None,
        expanded_uncertainty=0.04,
        coverage_factor=2.0,
        confidence_level=95.0,
        combined_uncertainty=0.02,
        uncertainty_budget=None,
        effective_degrees_of_freedom=None,
        conformity_statement=None,
        range_min=0.0,
        range_max=100.0,
        valid_range_min=0.0,
        valid_range_max=100.0,
        notes=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class TestUncertaintyBudgetRows:
    def test_empty_when_budget_absent(self) -> None:
        assert _build_uncertainty_budget_rows(_cal(uncertainty_budget=None)) == []

    def test_rows_present_when_budget_supplied(self) -> None:
        budget = [
            {"source": "fit_residuals", "distribution": "normal", "standard_uncertainty": 0.02, "degrees_of_freedom": 4.0},
            {"source": "reference_standard", "distribution": "normal", "standard_uncertainty": 0.025, "degrees_of_freedom": None},
        ]
        rows = _build_uncertainty_budget_rows(_cal(uncertainty_budget=budget))
        assert len(rows) == 2
        assert rows[0]["source"] == "fit_residuals"
        assert rows[0]["standard_uncertainty"] == "0.02"
        assert rows[1]["dof"] == "—"


class TestConformity:
    def test_none_when_statement_absent(self) -> None:
        assert _build_conformity(_cal(conformity_statement=None)) is None

    def test_none_when_no_specification(self) -> None:
        statement = {
            "decision_rule": "simple_acceptance", "specification": None,
            "expanded_uncertainty_applied": None, "passed": True,
        }
        assert _build_conformity(_cal(conformity_statement=statement)) is None

    def test_conforms_statement(self) -> None:
        statement = {
            "decision_rule": "guard_band_w_uncertainty", "specification": "±0.5 (absolute)",
            "expanded_uncertainty_applied": 0.04, "passed": True,
        }
        result = _build_conformity(_cal(conformity_statement=statement))
        assert result is not None
        assert result["result_label"] == "CONFORMS"
        assert result["specification"] == "±0.5 (absolute)"
        assert "Guard-banded acceptance" in result["decision_rule_label"]
        assert result["expanded_uncertainty_line"] is not None

    def test_does_not_conform_statement(self) -> None:
        statement = {
            "decision_rule": "simple_acceptance", "specification": "±0.1 (absolute)",
            "expanded_uncertainty_applied": None, "passed": False,
        }
        result = _build_conformity(_cal(conformity_statement=statement))
        assert result is not None
        assert result["result_label"] == "DOES NOT CONFORM"
        assert result["expanded_uncertainty_line"] is None


class TestCoefficientRows:
    def test_empty_when_no_coefficients(self) -> None:
        rows, equation = _build_coefficient_rows(None)
        assert rows == []
        assert equation is None

    def test_linear_equation(self) -> None:
        rows, equation = _build_coefficient_rows([2.0, 1.0])  # highest-degree first: a1=2.0, a0=1.0
        assert len(rows) == 2
        assert rows[0]["coefficient"] == "a0"
        assert rows[1]["coefficient"] == "a1"
        assert equation == "y = 1 + 2*x"

    def test_quadratic_equation_mentions_x_squared(self) -> None:
        _, equation = _build_coefficient_rows([1.0, 2.0, 3.0])
        assert "x^2" in equation

    def test_rows_include_human_name_with_math_subscript(self) -> None:
        rows, _ = _build_coefficient_rows([2.0, 1.0])
        assert rows[0]["name"] == "Offset ($a_{0}$)"
        assert rows[1]["name"] == "Gain ($a_{1}$)"

    def test_higher_order_coefficient_falls_back_to_generic_name(self) -> None:
        assert _coefficient_name(4) == "a4 ($a_{4}$)"


class TestFunctionFormula:
    """The symbolic (non-numeric) calibration function shown next to the
    named coefficient table in example_tables.tex."""

    def test_degree_zero(self) -> None:
        assert _build_function_formula(0) == "f(x) = a_0"

    def test_degree_one_uses_plain_x(self) -> None:
        assert _build_function_formula(1) == "f(x) = a_0 + a_1 x"

    def test_degree_two_uses_caret_power(self) -> None:
        formula = _build_function_formula(2)
        assert formula == "f(x) = a_0 + a_1 x + a_{2} x^2"


class TestStatRows:
    def test_runs_without_error_when_no_regression_data(self) -> None:
        rows = _build_stat_rows(_cal(
            poly_coefficients=None, r_squared=None, rmse=None, max_error=None,
            standard_error=None, full_scale_error=None, non_linearity=None,
            expanded_uncertainty=None, combined_uncertainty=None,
        ))
        assert rows == []

    def test_includes_r_squared_and_rmse_pair(self) -> None:
        rows = _build_stat_rows(_cal())
        labels = [r["label"] for r in rows]
        assert "R²" in labels
        assert "RMSE" in labels


class TestResultsSummary:
    """Powers example_tables.tex's compact 'Error & Uncertainty Summary' table
    — max error, %FS error, expanded uncertainty only, distinct from the
    fuller breakdown in stat_rows."""

    def test_empty_when_no_data(self) -> None:
        rows = _build_results_summary(_cal(
            max_error=None, full_scale_error=None, expanded_uncertainty=None,
        ), "bar")
        assert rows == []

    def test_includes_all_three_metrics_with_unit(self) -> None:
        rows = _build_results_summary(_cal(), "bar")
        labels = [r["label"] for r in rows]
        assert labels == ["Max Error", "% Full-Scale Error", "Expanded Uncertainty (U)"]
        assert rows[0]["value"] == "0.02 bar"
        assert rows[1]["value"] == "0.1 %"
        assert "bar" in rows[2]["value"]

    def test_omits_individual_metrics_that_are_absent(self) -> None:
        rows = _build_results_summary(_cal(max_error=None), "bar")
        labels = [r["label"] for r in rows]
        assert "Max Error" not in labels
        assert "% Full-Scale Error" in labels


class TestErrorSummary:
    """The compact 3-column (Abs. Error / FS Error / Uncertainty) single-row
    table in example_tables.tex, each value signed with ±."""

    def test_none_when_no_data(self) -> None:
        assert _build_error_summary(_cal(
            max_error=None, full_scale_error=None, expanded_uncertainty=None,
        ), "bar") is None

    def test_all_three_values_signed_with_unit(self) -> None:
        summary = _build_error_summary(_cal(), "bar")
        assert summary == {"abs_error": "±0.02 bar", "fs_error": "±0.1 %", "uncertainty": "±0.04 bar"}

    def test_missing_individual_metric_shows_placeholder(self) -> None:
        summary = _build_error_summary(_cal(max_error=None), "bar")
        assert summary["abs_error"] == "—"
        assert summary["fs_error"] == "±0.1 %"


class TestConformityDerivation:
    """The results-section sentence narrating max-error + expanded-uncertainty
    against the specification, replacing the removed footer badge."""

    def test_none_when_no_conformity(self) -> None:
        assert _build_conformity_derivation(_cal(), None, "bar") is None

    def test_none_when_missing_error_data(self) -> None:
        conformity = {"result_label": "CONFORMS", "specification": "±0.5 (absolute)"}
        assert _build_conformity_derivation(
            _cal(max_error=None), conformity, "bar",
        ) is None

    def test_states_total_and_verdict(self) -> None:
        conformity = {"result_label": "CONFORMS", "specification": "±0.5 (absolute)"}
        text = _build_conformity_derivation(_cal(), conformity, "bar")
        assert text is not None
        assert "0.02 bar" in text  # max_error
        assert "0.04 bar" in text  # expanded_uncertainty
        assert "0.06 bar" in text  # totals
        assert "±0.5 (absolute)" in text
        assert "CONFORMS" in text


class TestFormatHelpers:
    def test_fmt_none_returns_placeholder(self) -> None:
        assert _fmt(None) == "—"

    def test_fmt_accuracy_maps_raw_type_to_human_label(self) -> None:
        sensor = SimpleNamespace(accuracy_value=0.8, accuracy_type="percent_of_reading", accuracy_unit="%RH")
        assert _fmt_accuracy(sensor) == "±0.8 %RH % of reading"

    def test_fmt_scientific_for_small_values(self) -> None:
        assert "e" in _fmt(0.0000001)

    def test_fmt_accuracy_includes_plus_minus(self) -> None:
        sensor = SimpleNamespace(accuracy_value=0.1, accuracy_type="of reading", accuracy_unit="%")
        assert _fmt_accuracy(sensor).startswith("±0.1")


class TestNormalizeToPng:
    """Regression test: org logos/profile pictures are only validated as
    'an image/* content type' at upload time, not a specific format — a
    browser will happily submit a .ico as content-type image/x-icon. LaTeX's
    \\includegraphics can only load PNG/JPEG/PDF, so every image handed to
    Tectonic must be normalized first, or certificate generation crashes on
    a stored file it doesn't control the format of."""

    def test_passes_through_a_real_png(self) -> None:
        img = Image.new("RGBA", (10, 10), (255, 0, 0, 255))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        result = _normalize_to_png(buf.getvalue())
        assert result is not None
        assert Image.open(io.BytesIO(result)).format == "PNG"

    def test_converts_a_non_png_format_like_ico(self) -> None:
        img = Image.new("RGBA", (32, 32), (0, 128, 255, 255))
        buf = io.BytesIO()
        img.save(buf, format="ICO")
        result = _normalize_to_png(buf.getvalue())
        assert result is not None
        assert Image.open(io.BytesIO(result)).format == "PNG"

    def test_returns_none_for_undecodable_bytes(self) -> None:
        assert _normalize_to_png(b"not an image at all") is None


class TestBuildRandomPreviewContext:
    """Powers the admin 'preview a template' feature — a freshly randomized
    sample dataset (default 10 rows) plus a matching chart, so an admin sees
    something close to a real certificate without needing a real calibration."""

    def test_default_row_count_is_ten(self) -> None:
        context, _ = build_random_preview_context()
        assert len(context["dataset_rows"]) == 10

    def test_custom_row_count(self) -> None:
        context, _ = build_random_preview_context(num_points=4)
        assert len(context["dataset_rows"]) == 4

    def test_dataset_rows_have_expected_keys(self) -> None:
        context, _ = build_random_preview_context(num_points=3)
        for row in context["dataset_rows"]:
            assert set(row.keys()) == {"index", "measured", "reference", "fit", "residual_abs", "residual_pct"}

    def test_includes_a_real_chart_image(self) -> None:
        _, images = build_random_preview_context()
        assert "chart.png" in images
        assert Image.open(io.BytesIO(images["chart.png"])).format == "PNG"

    def test_includes_coefficient_rows_and_equation(self) -> None:
        context, _ = build_random_preview_context()
        assert len(context["coefficient_rows"]) == 2
        assert context["equation"] is not None

    def test_new_context_fields_are_populated(self) -> None:
        context, _ = build_random_preview_context()
        assert context["calibration_id"]
        assert context["chapter"]
        assert context["generated_date"]

    def test_example_tables_context_fields_are_populated(self) -> None:
        context, _ = build_random_preview_context()
        assert context["calibration_location"]
        assert context["team_name"]
        assert len(context["results_summary"]) == 3
        assert context["conformity"]["result_label"] in ("CONFORMS", "DOES NOT CONFORM")
        assert context["function_formula"] == "f(x) = a_0 + a_1 x"
        assert set(context["error_summary"].keys()) == {"abs_error", "fs_error", "uncertainty"}
        assert context["conformity_derivation"] is not None

    def test_successive_calls_produce_different_data(self) -> None:
        first, _ = build_random_preview_context()
        second, _ = build_random_preview_context()
        assert first["dataset_rows"] != second["dataset_rows"]


class TestResolvePerformerUserId:
    """Regression tests for the signature-not-showing bug: a calibration
    without a linked performer (performed_by_user_id=None) — the case for
    every calibration recorded before that field was wired up, or entered as
    free text — must still resolve to a real user's account, and thus their
    signature, whenever the typed name exactly matches an active account."""

    def test_returns_linked_user_id_directly(self, db: Session) -> None:
        linked_id = uuid.uuid4()
        cal = _cal(performed_by_user_id=linked_id, performed_by_name="Someone Else")
        assert resolve_performer_user_id(db, cal) == linked_id

    def test_falls_back_to_exact_name_match_when_unlinked(self, db: Session) -> None:
        user = User(
            id=uuid.uuid4(),
            email=f"perf_{uuid.uuid4().hex[:8]}@opengauge.test",
            name="Jane Q. Performer",
            hashed_password=hash_password("Testpass123!"),
            role=UserRole.technician,
            is_active=True,
        )
        db.add(user)
        db.flush()
        cal = _cal(performed_by_user_id=None, performed_by_name="Jane Q. Performer")
        assert resolve_performer_user_id(db, cal) == user.id

    def test_no_match_returns_none(self, db: Session) -> None:
        cal = _cal(performed_by_user_id=None, performed_by_name="Nobody Registered XYZ")
        assert resolve_performer_user_id(db, cal) is None

    def test_ignores_inactive_user_with_matching_name(self, db: Session) -> None:
        user = User(
            id=uuid.uuid4(),
            email=f"inactive_{uuid.uuid4().hex[:8]}@opengauge.test",
            name="Deactivated Person",
            hashed_password=hash_password("Testpass123!"),
            role=UserRole.technician,
            is_active=False,
        )
        db.add(user)
        db.flush()
        cal = _cal(performed_by_user_id=None, performed_by_name="Deactivated Person")
        assert resolve_performer_user_id(db, cal) is None

    def test_no_name_returns_none(self, db: Session) -> None:
        cal = _cal(performed_by_user_id=None, performed_by_name=None)
        assert resolve_performer_user_id(db, cal) is None
