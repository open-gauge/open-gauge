"""Add report template assignments to sensors and calibrations

Revision ID: 039
Revises: 038
Create Date: 2026-09-01
"""

from alembic import op

revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE sensors
            ADD COLUMN IF NOT EXISTS default_certificate_template_id UUID REFERENCES certificate_templates(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS default_document_template_id UUID REFERENCES document_templates(id) ON DELETE SET NULL
        """
    )
    op.execute(
        """
        ALTER TABLE calibrations
            ADD COLUMN IF NOT EXISTS report_certificate_template_id UUID REFERENCES certificate_templates(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS report_document_template_id UUID REFERENCES document_templates(id) ON DELETE SET NULL
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS report_document_template_id")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS report_certificate_template_id")
    op.execute("ALTER TABLE sensors DROP COLUMN IF EXISTS default_document_template_id")
    op.execute("ALTER TABLE sensors DROP COLUMN IF EXISTS default_certificate_template_id")
