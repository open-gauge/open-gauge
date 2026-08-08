"""Add frequency_response as a 4th data_entry_mode (see DATA_ENTRY_MODES) — the
calibration wizard's 4th Step 2 input mechanism, for sensors that deliver a
signal in the frequency domain (accelerometers, microphones, etc). A sweep of
(frequency, reference, measured[, offset]) points is entered, one is chosen as
the baseline, and a simple sensitivity ratio (measured/reference) is computed
per point — stored as a polynomial-order-1, no-offset (gain-only) model on the
existing poly_order/poly_coefficients columns, same as every other mode.

Adds the sweep-level settings columns on calibrations and a new
calibration_frequency_response_points child table (deliberately not reusing the
name of the child table dropped by 035, to avoid any ambiguity with that
earlier, differently-shaped table).

Revision ID: 036
Revises: 035
Create Date: 2026-08-08
"""

from alembic import op

revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS frequency_response_frequency_unit VARCHAR(10)"
    )
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS frequency_response_amplitude_type VARCHAR(20)"
    )
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS frequency_response_offset_enabled "
        "BOOLEAN NOT NULL DEFAULT false"
    )
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS frequency_response_offset_unit VARCHAR(10)"
    )
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS frequency_response_baseline_sweep_index INTEGER"
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS calibration_frequency_response_points (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            calibration_id UUID NOT NULL REFERENCES calibrations(id) ON DELETE CASCADE,
            sweep_index INTEGER NOT NULL,
            frequency_value NUMERIC(18, 8) NOT NULL,
            reference_value NUMERIC(18, 8) NOT NULL,
            measured_value NUMERIC(18, 8) NOT NULL,
            offset_value NUMERIC(18, 8),
            reference_unit VARCHAR(50) NOT NULL,
            measured_unit VARCHAR(50) NOT NULL,
            sensitivity_value NUMERIC(18, 8),
            deviation_pct NUMERIC(10, 4),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_calibration_frequency_response_points_calibration_id "
        "ON calibration_frequency_response_points(calibration_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS calibration_frequency_response_points")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS frequency_response_baseline_sweep_index")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS frequency_response_offset_unit")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS frequency_response_offset_enabled")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS frequency_response_amplitude_type")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS frequency_response_frequency_unit")
