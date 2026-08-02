"""Restructure calibration_type into 4 values (oem/external_accredited_lab/
internal_lab/customer_asset), add calibration_purpose, an organization-backed
calibration lab reference, repair tracking, and an uploaded-certificate
column distinct from the system-generated one.

Revision ID: 032
Revises: 031
Create Date: 2026-08-02
"""

from alembic import op

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # "external_accredited_lab" (24 chars) no longer fits the old VARCHAR(20)
    # sized for the 2-value scheme — widen before the backfill below writes it.
    op.execute("ALTER TABLE calibrations ALTER COLUMN calibration_type TYPE VARCHAR(30)")
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS calibration_purpose "
        "VARCHAR(20) NOT NULL DEFAULT 'routine'"
    )
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS calibration_organization_id "
        "UUID REFERENCES organizations(id)"
    )
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS repair_date DATE")
    op.execute("ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS repair_description TEXT")
    op.execute(
        "ALTER TABLE calibrations ADD COLUMN IF NOT EXISTS uploaded_certificate_file_id "
        "UUID REFERENCES files(id)"
    )
    # Relabel the old 2-value scheme onto the closest new type.
    op.execute("UPDATE calibrations SET calibration_type = 'internal_lab' WHERE calibration_type = 'internal'")
    op.execute(
        "UPDATE calibrations SET calibration_type = 'external_accredited_lab' "
        "WHERE calibration_type = 'external'"
    )
    # The column default itself also predates the 4-value scheme — repoint it
    # at the closest new type so it stays a valid value if it's ever relied on.
    op.execute("ALTER TABLE calibrations ALTER COLUMN calibration_type SET DEFAULT 'external_accredited_lab'")


def downgrade() -> None:
    op.execute("ALTER TABLE calibrations ALTER COLUMN calibration_type SET DEFAULT 'external'")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS uploaded_certificate_file_id")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS repair_description")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS repair_date")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS calibration_organization_id")
    op.execute("ALTER TABLE calibrations DROP COLUMN IF EXISTS calibration_purpose")
