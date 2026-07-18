"""Enforce email_settings as a true single-row table

Revision ID: 023
Revises: 022
Create Date: 2026-07-21

email_settings was always documented/intended as a singleton ("Singleton row
holding the SMTP configuration" — models/email_settings.py), but nothing
enforced it: repositories/email_settings.py's get()/get_or_create() just did
`.first()`, silently picking whichever row happened to sort first if more
than one ever existed. Tests that inserted a second, test-local row (rather
than updating the one that already existed) had no effect on `.first()`'s
result — the real row's real SMTP credentials kept being used, including by
the calibration reminder sweep, which is how the test suite ended up sending
real emails through a real mail server. A unique index on a constant
expression makes a second row impossible at the database level, the same
technique already used for certificate_templates' "at most one active
default" constraints.
"""

from alembic import op

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # If more than one row ever slipped in before this migration, keep only
    # the most recently updated one so the unique index below can be created.
    op.execute(
        """
        DELETE FROM email_settings
        WHERE id NOT IN (
            SELECT id FROM email_settings ORDER BY updated_at DESC LIMIT 1
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_email_settings_singleton ON email_settings((1))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ux_email_settings_singleton")
