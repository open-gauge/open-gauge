"""Add step_index column to files table

Revision ID: 007
Revises: 006
Create Date: 2026-06-23
"""

from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE files ADD COLUMN IF NOT EXISTS step_index INTEGER")


def downgrade() -> None:
    op.execute("ALTER TABLE files DROP COLUMN IF EXISTS step_index")
