"""Add is_default/is_builtin/is_enabled flags for unified template default management

Revision ID: 040
Revises: 039
Create Date: 2026-09-29
"""

from alembic import op

revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE certificate_templates
            ADD COLUMN IF NOT EXISTS is_builtin BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true
        """
    )
    op.execute(
        """
        ALTER TABLE document_templates
            ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS is_builtin BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE document_templates DROP COLUMN IF EXISTS is_enabled")
    op.execute("ALTER TABLE document_templates DROP COLUMN IF EXISTS is_builtin")
    op.execute("ALTER TABLE document_templates DROP COLUMN IF EXISTS is_default")
    op.execute("ALTER TABLE certificate_templates DROP COLUMN IF EXISTS is_enabled")
    op.execute("ALTER TABLE certificate_templates DROP COLUMN IF EXISTS is_builtin")
