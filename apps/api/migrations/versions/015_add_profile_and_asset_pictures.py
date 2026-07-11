"""Add profile_picture_id to users and picture_id to assets

Revision ID: 015
Revises: 014
Create Date: 2026-07-12
"""

from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_id UUID REFERENCES files(id)")
    op.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS picture_id UUID REFERENCES files(id)")


def downgrade() -> None:
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS picture_id")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS profile_picture_id")
