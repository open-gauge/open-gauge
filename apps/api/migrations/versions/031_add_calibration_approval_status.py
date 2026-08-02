"""Add calibration approval workflow: status (valid/pending_approval/
rejected/void), checked_by fields, and decision tracking on calibrations.

Revision ID: 031
Revises: 030
Create Date: 2026-08-02
"""

from alembic import op

revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS status "
        "VARCHAR(20) NOT NULL DEFAULT 'valid'"
    )
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS checked_by_user_id UUID REFERENCES users(id)")
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS checked_by_name VARCHAR(255)")
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES users(id)")
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ")
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS decision_reason TEXT")
    # Existing voided rows must reflect status='void', not the new-row default 'valid'.
    op.execute(
        "UPDATE calibrations SET status = 'void' WHERE is_active = false AND voided_at IS NOT NULL"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_calibrations_status ON calibrations(status)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_calibrations_status")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS decision_reason")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS decided_at")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS decided_by")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS checked_by_name")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS checked_by_user_id")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS status")
