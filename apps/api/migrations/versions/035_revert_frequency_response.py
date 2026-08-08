"""Revert 029_add_frequency_response — the sweep-as-a-separate-wizard-step design was
wrong (frequency response belongs as a calibration input mechanism, not an extra step;
see 036_add_frequency_response_input_method for the replacement). Drops the sweep-level
columns on calibrations and the calibration_frequency_points child table added by 029.

Revision ID: 035
Revises: 034
Create Date: 2026-08-05
"""

from alembic import op

revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS calibration_frequency_points")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS frequency_response_phase_unit")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS frequency_response_amplitude_unit")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS frequency_response_amplitude_type")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS frequency_response_frequency_unit")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS has_frequency_response")


def downgrade() -> None:
    # Re-run 029's own upgrade() body verbatim to roll this revert back.
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS has_frequency_response "
        "BOOLEAN NOT NULL DEFAULT false"
    )
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS frequency_response_frequency_unit VARCHAR(10)"
    )
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS frequency_response_amplitude_type VARCHAR(20)"
    )
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS frequency_response_amplitude_unit VARCHAR(20)"
    )
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS frequency_response_phase_unit VARCHAR(10)"
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS calibration_frequency_points (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            calibration_id UUID NOT NULL REFERENCES calibrations(id) ON DELETE CASCADE,
            sweep_index INTEGER NOT NULL,
            frequency_value NUMERIC(18, 8) NOT NULL,
            amplitude_value NUMERIC(18, 8),
            phase_value NUMERIC(18, 8),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_calibration_frequency_points_calibration_id "
        "ON calibration_frequency_points(calibration_id)"
    )
