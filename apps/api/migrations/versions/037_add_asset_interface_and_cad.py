"""Add the mechanical interface panel fields to assets, for the new "Interface"
asset detail tab (electrical panel reuses the existing pinout_table/pinout_image_id
columns — see app/models/asset.py — no migration needed there since pinout_table is
JSONB and evolves its item shape without a schema change; only pinout_image_id's role
changes, from write-once-at-creation to editable from the tab).

CAD files (the new "CAD" tab) need no schema change at all — they're StoredFile rows
tagged entity_type="asset_cad", entity_id=<asset id>, the same generic pattern already
used for asset_id-scoped attachments.

Revision ID: 037
Revises: 036
Create Date: 2026-08-14
"""

from alembic import op

revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS mechanical_table JSONB")
    op.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS mechanical_image_id UUID REFERENCES files(id)")


def downgrade() -> None:
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS mechanical_image_id")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS mechanical_table")
