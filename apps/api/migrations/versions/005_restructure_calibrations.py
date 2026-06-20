"""Restructure calibrations: flatten coefficients, rename tables

Revision ID: 005
Revises: 004
Create Date: 2026-06-22
"""

from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # 1. Rename calibration_methods → procedures                         #
    # ------------------------------------------------------------------ #
    op.execute("ALTER TABLE calibration_methods RENAME TO procedures")

    # ------------------------------------------------------------------ #
    # 2. Rename calibration_points → calibration_data                    #
    # ------------------------------------------------------------------ #
    op.execute("ALTER TABLE calibration_points RENAME TO calibration_data")
    op.execute(
        "ALTER INDEX ix_calibration_points_calibration_id "
        "RENAME TO ix_calibration_data_calibration_id"
    )

    # ------------------------------------------------------------------ #
    # 3. Add new flat columns to calibrations                            #
    # ------------------------------------------------------------------ #
    # Polynomial model
    op.execute("ALTER TABLE calibrations ADD COLUMN poly_order INTEGER")
    op.execute("ALTER TABLE calibrations ADD COLUMN poly_coefficients JSONB")
    op.execute("ALTER TABLE calibrations ADD COLUMN range_min NUMERIC(18, 4)")
    op.execute("ALTER TABLE calibrations ADD COLUMN range_max NUMERIC(18, 4)")
    # Regression statistics
    op.execute("ALTER TABLE calibrations ADD COLUMN r_squared NUMERIC(10, 8)")
    op.execute("ALTER TABLE calibrations ADD COLUMN rmse NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibrations ADD COLUMN standard_error NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibrations ADD COLUMN max_error NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibrations ADD COLUMN full_scale_error NUMERIC(8, 4)")
    op.execute("ALTER TABLE calibrations ADD COLUMN non_linearity NUMERIC(8, 4)")
    op.execute("ALTER TABLE calibrations ADD COLUMN repeatability NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibrations ADD COLUMN hysteresis NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibrations ADD COLUMN distribution_type VARCHAR(20)")
    op.execute("ALTER TABLE calibrations ADD COLUMN confidence_level NUMERIC(5, 2)")
    op.execute("ALTER TABLE calibrations ADD COLUMN coverage_factor NUMERIC(5, 3)")
    op.execute("ALTER TABLE calibrations ADD COLUMN combined_uncertainty NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibrations ADD COLUMN expanded_uncertainty NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibrations ADD COLUMN valid_range_min NUMERIC(18, 8)")
    op.execute("ALTER TABLE calibrations ADD COLUMN valid_range_max NUMERIC(18, 8)")
    # New metadata
    op.execute("ALTER TABLE calibrations ADD COLUMN tolerance_criteria VARCHAR(50)")
    op.execute("ALTER TABLE calibrations ADD COLUMN daq_id UUID REFERENCES daq(id)")
    # Canonical environmental columns: °C, %RH, Pa
    op.execute("ALTER TABLE calibrations ADD COLUMN temperature NUMERIC(6, 2)")
    op.execute("ALTER TABLE calibrations ADD COLUMN humidity NUMERIC(5, 2)")
    op.execute("ALTER TABLE calibrations ADD COLUMN pressure NUMERIC(8, 2)")
    # Back-reference to the calibration data set (populated on create)
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN calibration_data_id UUID "
        "REFERENCES calibration_data(id)"
    )

    # ------------------------------------------------------------------ #
    # 4. Data migration: copy coefficients into calibrations             #
    # ------------------------------------------------------------------ #
    op.execute("""
        UPDATE calibrations c
        SET
            poly_order           = cc.poly_degree,
            poly_coefficients    = cc.poly_coefficients,
            range_min            = cc.range_min,
            range_max            = cc.range_max,
            r_squared            = cc.r_squared,
            rmse                 = cc.rmse,
            standard_error       = cc.standard_error,
            max_error            = cc.max_error,
            full_scale_error     = cc.full_scale_error_pct,
            non_linearity        = cc.non_linearity_pct,
            repeatability        = cc.repeatability,
            hysteresis           = cc.hysteresis,
            distribution_type    = cc.distribution_type,
            confidence_level     = cc.confidence_level,
            coverage_factor      = cc.uncertainty_coverage_factor,
            combined_uncertainty = cc.combined_uncertainty,
            expanded_uncertainty = cc.expanded_uncertainty,
            valid_range_min      = cc.valid_range_min,
            valid_range_max      = cc.valid_range_max
        FROM calibration_coefficients cc
        WHERE cc.calibration_id = c.id
    """)

    # ------------------------------------------------------------------ #
    # 5. Data migration: convert environmental values to canonical units #
    # ------------------------------------------------------------------ #
    # temperature_value (004) → °C
    op.execute("""
        UPDATE calibrations SET temperature =
            CASE temperature_unit
                WHEN '°F'  THEN ROUND(((temperature_value - 32) * 5.0 / 9.0)::numeric, 2)
                WHEN 'K'   THEN ROUND((temperature_value - 273.15)::numeric, 2)
                ELSE            ROUND(temperature_value::numeric, 2)
            END
        WHERE temperature_value IS NOT NULL
    """)
    # fall back to legacy temperature_c
    op.execute("""
        UPDATE calibrations
        SET temperature = temperature_c
        WHERE temperature IS NULL AND temperature_c IS NOT NULL
    """)
    # humidity → %RH (already dimensionless, just round)
    op.execute("""
        UPDATE calibrations SET humidity = ROUND(humidity_value::numeric, 2)
        WHERE humidity_value IS NOT NULL
    """)
    op.execute("""
        UPDATE calibrations
        SET humidity = humidity_pct
        WHERE humidity IS NULL AND humidity_pct IS NOT NULL
    """)
    # pressure_value → Pa
    op.execute("""
        UPDATE calibrations SET pressure =
            CASE pressure_unit
                WHEN 'hPa'  THEN ROUND((pressure_value * 100)::numeric, 2)
                WHEN 'mbar' THEN ROUND((pressure_value * 100)::numeric, 2)
                WHEN 'kPa'  THEN ROUND((pressure_value * 1000)::numeric, 2)
                WHEN 'bar'  THEN ROUND((pressure_value * 100000)::numeric, 2)
                WHEN 'psi'  THEN ROUND((pressure_value * 6894.757)::numeric, 2)
                ELSE             ROUND(pressure_value::numeric, 2)
            END
        WHERE pressure_value IS NOT NULL
    """)
    op.execute("""
        UPDATE calibrations
        SET pressure = ROUND((pressure_hpa * 100)::numeric, 2)
        WHERE pressure IS NULL AND pressure_hpa IS NOT NULL
    """)

    # ------------------------------------------------------------------ #
    # 6. Rename columns on calibrations                                  #
    # ------------------------------------------------------------------ #
    op.execute("ALTER TABLE calibrations RENAME COLUMN version TO calibration_version")
    op.execute("ALTER TABLE calibrations RENAME COLUMN reference_asset_id TO internal_reference_asset_id")
    op.execute("ALTER TABLE calibrations RENAME COLUMN calibration_method_id TO internal_procedure_id")
    op.execute("ALTER TABLE calibrations RENAME COLUMN certificate_number TO external_lab_certificate_number")

    # ------------------------------------------------------------------ #
    # 7. Drop old columns from calibrations                              #
    # ------------------------------------------------------------------ #
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS result")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS external_lab_accreditation")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS certificate_expiry_date")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS temperature_c")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS humidity_pct")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS pressure_hpa")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS temperature_value")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS temperature_unit")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS humidity_value")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS humidity_unit")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS pressure_value")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS pressure_unit")

    # ------------------------------------------------------------------ #
    # 8. Drop the result enum type                                       #
    # ------------------------------------------------------------------ #
    op.execute("DROP TYPE IF EXISTS calibration_result_enum")

    # ------------------------------------------------------------------ #
    # 9. Drop calibration_coefficients (and its enum type)              #
    # ------------------------------------------------------------------ #
    op.execute("DROP TABLE IF EXISTS calibration_coefficients CASCADE")
    op.execute("DROP TYPE IF EXISTS coefficient_type_enum")

    # ------------------------------------------------------------------ #
    # 10. Drop certificates                                              #
    # ------------------------------------------------------------------ #
    op.execute("DROP TABLE IF EXISTS certificates CASCADE")


def downgrade() -> None:
    raise NotImplementedError("Downgrade from 005 is not supported — data migration is one-way")
