"""Add calibration_methods table, pinout fields to assets, calibration fields to sensors

Adds:
  - calibration_methods table (new): id, physical_quantity, name, description,
    required_equipment, steps (JSONB), created_by, created_at, updated_at
  - assets.pinout_table (JSONB)
  - assets.pinout_image_id (UUID FK → files)
  - assets.sensor_image_id (UUID FK → files)
  - assets.sensor_schematic_id (UUID FK → files)
  - sensors.calibration_method_id (UUID FK → calibration_methods)
  - sensors.calibration_interval (INTEGER, days)

Revision ID: 003
Revises: 002
Create Date: 2026-06-19
"""

from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # 1. calibration_methods                                              #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE calibration_methods (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            physical_quantity VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            required_equipment TEXT,
            steps JSONB,
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_calibration_methods_physical_quantity ON calibration_methods(physical_quantity)")

    # ------------------------------------------------------------------ #
    # 2. New columns on assets                                            #
    # ------------------------------------------------------------------ #
    op.execute("ALTER TABLE assets ADD COLUMN pinout_table JSONB")
    op.execute("ALTER TABLE assets ADD COLUMN pinout_image_id UUID REFERENCES files(id)")
    op.execute("ALTER TABLE assets ADD COLUMN sensor_image_id UUID REFERENCES files(id)")
    op.execute("ALTER TABLE assets ADD COLUMN sensor_schematic_id UUID REFERENCES files(id)")

    # ------------------------------------------------------------------ #
    # 3. New columns on sensors                                           #
    # ------------------------------------------------------------------ #
    op.execute("ALTER TABLE sensors ADD COLUMN calibration_method_id UUID REFERENCES calibration_methods(id)")
    op.execute("ALTER TABLE sensors ADD COLUMN calibration_interval INTEGER")


def downgrade() -> None:
    op.execute("ALTER TABLE sensors DROP COLUMN IF EXISTS calibration_interval")
    op.execute("ALTER TABLE sensors DROP COLUMN IF EXISTS calibration_method_id")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS sensor_schematic_id")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS sensor_image_id")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS pinout_image_id")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS pinout_table")
    op.execute("DROP TABLE IF EXISTS calibration_methods CASCADE")
