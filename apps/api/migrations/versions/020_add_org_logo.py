"""Add logo_file_id to organizations

Revision ID: 020
Revises: 019
Create Date: 2026-07-14
"""

from alembic import op

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_file_id UUID REFERENCES files(id)")


def downgrade() -> None:
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS logo_file_id")
