"""Remove teams and the is_superuser flag (Gogs-style: only users and organizations)

Drops: teams, team_members, assets.owner, users.is_superuser

Revision ID: 024
Revises: 023
Create Date: 2026-07-27

Open Gauge now mimics Gogs: no team layer between organizations and users.
Asset ownership (previously a team) is dropped rather than replaced — assets
are scoped by organization alone (via their location). Calibration reminder/
notification emails now go to the asset's organization's Technician/Admin/
Super Admin users instead of a team's members (see services/notifications.py).

The four user roles were already exactly superadmin/admin/technician/viewer;
the separate `is_superuser` bootstrap flag was redundant with
`role == 'superadmin'` at every call site, so it's folded into role and
dropped.
"""

from alembic import op

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Fold the redundant is_superuser flag into role before dropping it, so no
    # account loses the privilege it already effectively had.
    op.execute("UPDATE users SET role = 'superadmin' WHERE is_superuser = true AND role != 'superadmin'")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_superuser")

    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS owner")
    op.execute("DROP TABLE IF EXISTS team_members")
    op.execute("DROP TABLE IF EXISTS teams")


def downgrade() -> None:
    # Recreates structure only — opt-in team membership and asset ownership
    # data are not recoverable.
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN NOT NULL DEFAULT false")

    op.execute("""
        CREATE TABLE IF NOT EXISTS teams (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_teams_organization_id ON teams(organization_id)")

    op.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS owner UUID REFERENCES teams(id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS team_members (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            team_id UUID NOT NULL REFERENCES teams(id),
            user_id UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (team_id, user_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_team_members_team_id ON team_members(team_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_team_members_user_id ON team_members(user_id)")
