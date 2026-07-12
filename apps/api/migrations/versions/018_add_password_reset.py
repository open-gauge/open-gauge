"""Add password reset token fields to users

Revision ID: 018
Revises: 017
Create Date: 2026-07-13
"""

from alembic import op

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255) UNIQUE")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_expires_at TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_reset_token_expires_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_reset_token")
