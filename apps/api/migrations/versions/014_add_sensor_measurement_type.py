"""Add measurement_type column to sensors table

Revision ID: 014
Revises: 013
Create Date: 2026-07-09
"""

from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE sensors ADD COLUMN IF NOT EXISTS measurement_type VARCHAR(50)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE sensors DROP COLUMN IF EXISTS measurement_type")
