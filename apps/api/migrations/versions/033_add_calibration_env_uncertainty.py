"""Add temperature/humidity/pressure uncertainty columns to calibrations, same
canonical units and precision as their value counterparts.

Revision ID: 033
Revises: 032
Create Date: 2026-08-03
"""

from alembic import op

revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS temperature_uncertainty NUMERIC(6, 2)")
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS humidity_uncertainty NUMERIC(5, 2)")
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS pressure_uncertainty NUMERIC(10, 2)")


def downgrade() -> None:
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS pressure_uncertainty")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS humidity_uncertainty")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS temperature_uncertainty")
