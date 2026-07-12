"""Add user_signing_keys and user_signatures tables

Revision ID: 019
Revises: 018
Create Date: 2026-07-14
"""

from alembic import op

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_signing_keys (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL UNIQUE REFERENCES users(id),
            algorithm VARCHAR(20) NOT NULL,
            public_key_pem TEXT NOT NULL,
            private_key_encrypted TEXT NOT NULL,
            key_encryption_algorithm VARCHAR(30) NOT NULL,
            fingerprint_sha256 VARCHAR(64) NOT NULL,
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_signing_keys_user_id ON user_signing_keys(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_signing_keys_fingerprint ON user_signing_keys(fingerprint_sha256)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_signatures (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id),
            signing_key_id UUID NOT NULL REFERENCES user_signing_keys(id),
            image_file_id UUID NOT NULL REFERENCES files(id),
            image_sha256 VARCHAR(64) NOT NULL,
            signed_envelope TEXT NOT NULL,
            signature_bytes BYTEA NOT NULL,
            signature_algorithm VARCHAR(20) NOT NULL,
            source VARCHAR(20) NOT NULL,
            version INTEGER NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            revoked_at TIMESTAMPTZ,
            change_reason VARCHAR(500),
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_signatures_user_id ON user_signatures(user_id)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_user_signatures_active "
        "ON user_signatures(user_id) WHERE is_active"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_signatures")
    op.execute("DROP TABLE IF EXISTS user_signing_keys")
