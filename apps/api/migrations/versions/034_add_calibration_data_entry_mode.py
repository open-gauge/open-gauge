"""Add data_entry_mode/model_type/custom_formula/as_found_summary to calibrations,
and point_role to calibration_data — the alternative calibration data-entry
mechanisms (model-directly, reference-vs-indicated, reference-vs-as-found/as-left).

Revision ID: 034
Revises: 033
Create Date: 2026-08-04
"""

from alembic import op

revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS data_entry_mode "
        "VARCHAR(30) NOT NULL DEFAULT 'raw_data'"
    )
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS model_type "
        "VARCHAR(20) NOT NULL DEFAULT 'polynomial'"
    )
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS custom_formula TEXT")
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS as_found_summary JSONB")
    op.execute(
        "ALTER TABLE calibration_data ADD COLUMN IF NOT EXISTS point_role "
        "VARCHAR(20) NOT NULL DEFAULT 'primary'"
    )
    # Backfill: existing "coefficients only" rows (a fit with zero linked points) were
    # the direct precedent of "model_direct" — relabel them accordingly.
    op.execute("""
        UPDATE calibrations c SET data_entry_mode = 'model_direct'
        WHERE c.poly_coefficients IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM calibration_data d WHERE d.calibration_id = c.id)
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE calibration_data DROP COLUMN IF EXISTS point_role")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS as_found_summary")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS custom_formula")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS model_type")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS data_entry_mode")
