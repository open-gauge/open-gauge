"""Add certificate_templates table

Revision ID: 021
Revises: 020
Create Date: 2026-07-14
"""

from alembic import op

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS certificate_templates (
            id UUID PRIMARY KEY,
            organization_id UUID REFERENCES organizations(id),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            template_file_id UUID NOT NULL REFERENCES files(id),
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            version INTEGER NOT NULL DEFAULT 1,
            change_reason VARCHAR(500),
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_certificate_templates_organization_id ON certificate_templates(organization_id)")
    # At most one active default per organization...
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_cert_templates_default_org "
        "ON certificate_templates(organization_id) WHERE is_default AND is_active AND organization_id IS NOT NULL"
    )
    # ...and at most one active global default (organization_id IS NULL).
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_cert_templates_default_global "
        "ON certificate_templates((1)) WHERE is_default AND is_active AND organization_id IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS certificate_templates")
