"""Add team_members join table for opt-in team membership; drop users.team

Revision ID: 022
Revises: 021
Create Date: 2026-07-21
"""

from alembic import op

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS team_members (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            team_id UUID NOT NULL REFERENCES teams(id),
            user_id UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (team_id, user_id)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_team_members_team_id ON team_members(team_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_team_members_user_id ON team_members(user_id)")

    # Best-effort carry-over: the old users.team was a free-text name matched
    # against teams in the user's own organization (case-insensitive), so
    # anyone who had a value set keeps their membership under the new
    # join-table model instead of silently losing it.
    op.execute(
        """
        INSERT INTO team_members (team_id, user_id)
        SELECT t.id, u.id
        FROM users u
        JOIN teams t
          ON t.organization_id = u.organization_id
         AND lower(t.name) = lower(u.team)
        WHERE u.team IS NOT NULL
        ON CONFLICT (team_id, user_id) DO NOTHING
        """
    )

    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS team")


def downgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS team VARCHAR(255)")
    op.execute("DROP TABLE IF EXISTS team_members")
