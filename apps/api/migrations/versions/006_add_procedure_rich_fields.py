"""Add rich fields to procedures table

Revision ID: 006
Revises: 005
Create Date: 2026-06-23
"""

from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE procedures ADD COLUMN IF NOT EXISTS proc_id VARCHAR(20)")
    op.execute("ALTER TABLE procedures ADD COLUMN IF NOT EXISTS version VARCHAR(20) NOT NULL DEFAULT '1.0'")
    op.execute("ALTER TABLE procedures ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20)")
    op.execute("ALTER TABLE procedures ADD COLUMN IF NOT EXISTS standard_ref VARCHAR(255)")
    op.execute("ALTER TABLE procedures ADD COLUMN IF NOT EXISTS author VARCHAR(255)")
    op.execute("ALTER TABLE procedures ADD COLUMN IF NOT EXISTS duration_min INTEGER")
    op.execute("ALTER TABLE procedures ADD COLUMN IF NOT EXISTS tags JSONB")
    op.execute("ALTER TABLE procedures ADD COLUMN IF NOT EXISTS equipment JSONB")
    op.execute("ALTER TABLE procedures ADD COLUMN IF NOT EXISTS materials JSONB")
    op.execute("ALTER TABLE procedures ADD COLUMN IF NOT EXISTS environment JSONB")
    op.execute("ALTER TABLE procedures ADD COLUMN IF NOT EXISTS safety_notes JSONB")
    op.execute("ALTER TABLE procedures ADD COLUMN IF NOT EXISTS acceptance_criteria JSONB")
    op.execute("ALTER TABLE procedures ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_procedures_proc_id ON procedures (proc_id) WHERE proc_id IS NOT NULL"
    )


def downgrade() -> None:
    pass
