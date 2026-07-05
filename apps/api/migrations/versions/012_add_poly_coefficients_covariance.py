"""Add poly_coefficients_covariance column to calibrations table

Revision ID: 012
Revises: 011
Create Date: 2026-07-09
"""

from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS poly_coefficients_covariance JSONB"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS poly_coefficients_covariance")
