"""Add soft-void fields to calibrations (is_active, voided_at, voided_by,
void_reason), replacing hard delete with a reversible void

Revision ID: 017
Revises: 016
Create Date: 2026-07-13
"""

from alembic import op

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true")
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ")
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES users(id)")
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS void_reason TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS void_reason")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS voided_by")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS voided_at")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS is_active")
