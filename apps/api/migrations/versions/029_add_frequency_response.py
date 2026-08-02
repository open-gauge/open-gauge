"""Add frequency-response sweep support to calibrations: sweep-level
settings on calibrations, plus a new calibration_frequency_points child
table for the swept points.

Revision ID: 029
Revises: 028
Create Date: 2026-08-02
"""

from alembic import op

revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS calibration_frequency_points")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS frequency_response_phase_unit")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS frequency_response_amplitude_unit")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS frequency_response_amplitude_type")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS frequency_response_frequency_unit")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS has_frequency_response")
