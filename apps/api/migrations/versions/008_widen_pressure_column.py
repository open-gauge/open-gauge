"""Widen calibrations.pressure column from NUMERIC(8,2) to NUMERIC(10,2)

Standard atmospheric pressure in Pa is ~101325 which fits in NUMERIC(8,2),
but entering values in hPa and converting (×100) can exceed the 10^6 limit.
NUMERIC(10,2) allows up to 99,999,999.99 Pa without truncation errors.

Revision ID: 008
Revises: 007
Create Date: 2026-06-23
"""

from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE calibrations ALTER COLUMN pressure TYPE NUMERIC(10, 2)"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE calibrations ALTER COLUMN pressure TYPE NUMERIC(8, 2)"
    )
