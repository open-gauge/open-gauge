"""Calibration workflow: sensor_id on calibrations, statistics on coefficients, calibration_points table

Revision ID: 004
Revises: 003
Create Date: 2026-06-20
"""

from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # 1. New columns on calibrations                                      #
    # ------------------------------------------------------------------ #
    op.execute("ALTER TABLE calibrations ADD COLUMN sensor_id UUID REFERENCES sensors(id)")
    op.execute("ALTER TABLE calibrations ADD COLUMN calibration_type VARCHAR(20) NOT NULL DEFAULT 'external'")
    op.execute("ALTER TABLE calibrations ADD COLUMN reference_asset_id UUID REFERENCES assets(id)")
    op.execute("ALTER TABLE calibrations ADD COLUMN calibration_method_id UUID REFERENCES calibration_methods(id)")
    op.execute("ALTER TABLE calibrations ADD COLUMN certificate_number VARCHAR(255)")
    op.execute("ALTER TABLE calibrations ADD COLUMN certificate_expiry_date DATE")
    op.execute("ALTER TABLE calibrations ADD COLUMN calibration_interval INTEGER")
    op.execute("ALTER TABLE calibrations ADD COLUMN version INTEGER NOT NULL DEFAULT 1")
    op.execute("ALTER TABLE calibrations ADD COLUMN temperature_value NUMERIC(10, 4)")
    op.execute("ALTER TABLE calibrations ADD COLUMN temperature_unit VARCHAR(10)")
    op.execute("ALTER TABLE calibrations ADD COLUMN pressure_value NUMERIC(12, 4)")
    op.execute("ALTER TABLE calibrations ADD COLUMN pressure_unit VARCHAR(10)")
    op.execute("ALTER TABLE calibrations ADD COLUMN humidity_value NUMERIC(8, 4)")
    op.execute("ALTER TABLE calibrations ADD COLUMN humidity_unit VARCHAR(10)")

    # ------------------------------------------------------------------ #
    # 2. Statistics columns on calibration_coefficients                   #
    # ------------------------------------------------------------------ #
    op.execute("ALTER TABLE calibration_coefficients ADD COLUMN r_squared NUMERIC(10, 8)")
    op.execute("ALTER TABLE calibration_coefficients ADD COLUMN rmse NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibration_coefficients ADD COLUMN standard_error NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibration_coefficients ADD COLUMN max_error NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibration_coefficients ADD COLUMN full_scale_error_pct NUMERIC(8, 4)")
    op.execute("ALTER TABLE calibration_coefficients ADD COLUMN non_linearity_pct NUMERIC(8, 4)")
    op.execute("ALTER TABLE calibration_coefficients ADD COLUMN repeatability NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibration_coefficients ADD COLUMN hysteresis NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibration_coefficients ADD COLUMN distribution_type VARCHAR(20)")
    op.execute("ALTER TABLE calibration_coefficients ADD COLUMN confidence_level NUMERIC(5, 2)")
    op.execute("ALTER TABLE calibration_coefficients ADD COLUMN combined_uncertainty NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibration_coefficients ADD COLUMN expanded_uncertainty NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibration_coefficients ADD COLUMN valid_range_min NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibration_coefficients ADD COLUMN valid_range_max NUMERIC(18, 8)")

    # ------------------------------------------------------------------ #
    # 3. calibration_points table                                         #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE calibration_points (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            calibration_id UUID NOT NULL REFERENCES calibrations(id) ON DELETE CASCADE,
            point_index INTEGER NOT NULL,
            reference_value NUMERIC(18, 8) NOT NULL,
            measured_value NUMERIC(18, 8) NOT NULL,
            calculated_value NUMERIC(18, 8),
            residual_abs NUMERIC(18, 8),
            residual_pct NUMERIC(10, 4),
            reference_unit VARCHAR(50) NOT NULL,
            measured_unit VARCHAR(50) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_calibration_points_calibration_id ON calibration_points(calibration_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS calibration_points CASCADE")

    for col in [
        "r_squared", "rmse", "standard_error", "max_error", "full_scale_error_pct",
        "non_linearity_pct", "repeatability", "hysteresis", "distribution_type",
        "confidence_level", "combined_uncertainty", "expanded_uncertainty",
        "valid_range_min", "valid_range_max",
    ]:
        op.execute(f"ALTER TABLE calibration_coefficients DROP COLUMN IF EXISTS {col}")

    for col in [
        "sensor_id", "calibration_type", "reference_asset_id", "calibration_method_id",
        "certificate_number", "certificate_expiry_date", "calibration_interval", "version",
        "temperature_value", "temperature_unit", "pressure_value", "pressure_unit",
        "humidity_value", "humidity_unit",
    ]:
        op.execute(f"ALTER TABLE calibrations DROP COLUMN IF EXISTS {col}")
