"""Add is_calibration_lab column to locations table

Revision ID: 009
Revises: 008
Create Date: 2026-07-01
"""

from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_calibration_lab BOOLEAN NOT NULL DEFAULT false"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE locations DROP COLUMN IF EXISTS is_calibration_lab")
