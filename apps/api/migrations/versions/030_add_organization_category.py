"""Add internal/external organization support: org_category, org_type,
contact point, structured address, and VAT number columns on organizations.

Revision ID: 030
Revises: 029
Create Date: 2026-08-02
"""

from alembic import op

revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS org_category "
        "VARCHAR(20) NOT NULL DEFAULT 'internal'"
    )
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS org_type VARCHAR(20)")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255)")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50)")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vat_number VARCHAR(50)")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address_street VARCHAR(255)")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address_city VARCHAR(255)")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address_state VARCHAR(255)")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address_postal_code VARCHAR(20)")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address_country VARCHAR(100)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_organizations_org_category ON organizations(org_category)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_organizations_org_category")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS address_country")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS address_postal_code")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS address_state")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS address_city")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS address_street")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS vat_number")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS contact_phone")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS contact_email")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS org_type")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS org_category")
