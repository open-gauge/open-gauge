"""Add email notifications: email_settings table, user verification fields,
calibration reminder tracking fields

Revision ID: 016
Revises: 015
Create Date: 2026-07-13
"""

from alembic import op

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS email_settings (
            id UUID PRIMARY KEY,
            smtp_host VARCHAR(255),
            smtp_port INTEGER NOT NULL DEFAULT 587,
            smtp_username VARCHAR(255),
            smtp_password VARCHAR(255),
            smtp_use_tls BOOLEAN NOT NULL DEFAULT true,
            from_email VARCHAR(255),
            from_name VARCHAR(255) NOT NULL DEFAULT 'Open Gauge',
            enabled BOOLEAN NOT NULL DEFAULT false,
            calibration_reminder_days INTEGER NOT NULL DEFAULT 14,
            updated_by UUID REFERENCES users(id),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    # Existing users are grandfathered in as verified so this migration never locks
    # anyone out; only new self-registrations go through the verification flow.
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT true")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255) UNIQUE")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ")

    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS due_reminder_sent_at TIMESTAMPTZ")
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS overdue_reminder_sent_at TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS overdue_reminder_sent_at")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS due_reminder_sent_at")

    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS verification_token_expires_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS verification_token")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_verified")

    op.execute("DROP TABLE IF EXISTS email_settings")
