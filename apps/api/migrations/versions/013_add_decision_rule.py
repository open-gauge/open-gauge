"""Add decision_rule and conformity_statement columns to calibrations table

Revision ID: 013
Revises: 012
Create Date: 2026-07-09
"""

from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS decision_rule VARCHAR(30) "
        "NOT NULL DEFAULT 'simple_acceptance'"
    )
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS conformity_statement JSONB"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS conformity_statement")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS decision_rule")
