"""Add document_templates table

Revision ID: 038
Revises: 037
Create Date: 2026-08-28
"""

from alembic import op

revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS document_templates (
            id UUID PRIMARY KEY,
            template_group_id UUID NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            type VARCHAR(20) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'draft',
            version INTEGER NOT NULL DEFAULT 1,
            document JSONB NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            published_at TIMESTAMPTZ
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_templates_template_group_id ON document_templates(template_group_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_templates_type ON document_templates(type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_templates_status ON document_templates(status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS document_templates")
