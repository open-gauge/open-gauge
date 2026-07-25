"""Per-user notification delivery preferences

Adds: notification_preferences

Revision ID: 026
Revises: 025
Create Date: 2026-07-28

Lets each user choose, per notification category (calibration due, calibration
created, organization join request/decision), whether they want it via email,
in-app, both, or neither. A missing row for a (user, category) pair means both
channels are enabled — this table only ever stores explicit opt-outs/opt-ins,
so existing users get sensible defaults without a backfill.
"""

from alembic import op

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE notification_preferences (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id),
            category VARCHAR(50) NOT NULL,
            email_enabled BOOLEAN NOT NULL DEFAULT true,
            in_app_enabled BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_notification_preference UNIQUE (user_id, category)
        )
    """)
    op.execute("CREATE INDEX ix_notification_preferences_user_id ON notification_preferences(user_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notification_preferences")
