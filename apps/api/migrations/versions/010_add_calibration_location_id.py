"""Add calibration_location_id column to calibrations table

Revision ID: 010
Revises: 009
Create Date: 2026-07-01
"""

from alembic import op

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS calibration_location_id UUID REFERENCES locations(id)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS calibration_location_id")
