"""Add organization_signing_keys table

Revision ID: 027
Revises: 026
Create Date: 2026-07-29
"""

from alembic import op

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS organization_signing_keys (
            id UUID PRIMARY KEY,
            organization_id UUID REFERENCES organizations(id),
            algorithm VARCHAR(20) NOT NULL,
            subject_common_name VARCHAR(255) NOT NULL,
            certificate_pem TEXT NOT NULL,
            private_key_encrypted TEXT NOT NULL,
            key_encryption_algorithm VARCHAR(30) NOT NULL,
            fingerprint_sha256 VARCHAR(64) NOT NULL,
            not_valid_before TIMESTAMPTZ NOT NULL,
            not_valid_after TIMESTAMPTZ NOT NULL,
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_organization_signing_keys_org_id "
        "ON organization_signing_keys(organization_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_organization_signing_keys_fingerprint "
        "ON organization_signing_keys(fingerprint_sha256)"
    )
    # One key per organization...
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_organization_signing_keys_org "
        "ON organization_signing_keys(organization_id) WHERE organization_id IS NOT NULL"
    )
    # ...and at most one instance-wide fallback key (organization_id NULL),
    # used for certificates whose asset has no resolvable organization.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_organization_signing_keys_global "
        "ON organization_signing_keys((true)) WHERE organization_id IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS organization_signing_keys")
