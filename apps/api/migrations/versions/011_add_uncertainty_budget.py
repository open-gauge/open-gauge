"""Add uncertainty_budget and effective_degrees_of_freedom columns to calibrations table

Revision ID: 011
Revises: 010
Create Date: 2026-07-09
"""

from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS uncertainty_budget JSONB"
    )
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS effective_degrees_of_freedom NUMERIC(18, 4)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS effective_degrees_of_freedom")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS uncertainty_budget")
