"""Multi-organization membership, join requests, and notifications

Adds: organizations.{full_name,website,location_id,email,phone,private},
      assets.organization_id, organization_members, organization_join_requests,
      notifications
Removes: users.organization_id (superseded by organization_members)

Revision ID: 025
Revises: 024
Create Date: 2026-07-28

Organizations become full multi-tenant entities: any authenticated user can
create one (becoming its first admin member), users can belong to any number
of organizations with a per-org role (member/admin, distinct from the global
RBAC role on users.role), and non-members can request to join. This replaces
the single nullable users.organization_id FK from migration 024 with a proper
many-to-many membership table.
"""

from alembic import op

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE org_role_enum AS ENUM ('member', 'admin')")
    op.execute("CREATE TYPE join_request_status_enum AS ENUM ('pending', 'approved', 'rejected')")

    op.execute("""
        ALTER TABLE organizations
            ADD COLUMN full_name VARCHAR(255),
            ADD COLUMN website VARCHAR(255),
            ADD COLUMN location_id UUID REFERENCES locations(id),
            ADD COLUMN email VARCHAR(255),
            ADD COLUMN phone VARCHAR(50),
            ADD COLUMN private BOOLEAN NOT NULL DEFAULT false
    """)

    op.execute("ALTER TABLE assets ADD COLUMN organization_id UUID REFERENCES organizations(id)")
    op.execute("CREATE INDEX ix_assets_organization_id ON assets(organization_id)")

    op.execute("""
        CREATE TABLE organization_members (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id),
            user_id UUID NOT NULL REFERENCES users(id),
            role org_role_enum NOT NULL DEFAULT 'member',
            active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_organization_member UNIQUE (organization_id, user_id)
        )
    """)
    op.execute("CREATE INDEX ix_organization_members_organization_id ON organization_members(organization_id)")
    op.execute("CREATE INDEX ix_organization_members_user_id ON organization_members(user_id)")

    # Backfill: every user's existing single org membership becomes a row here,
    # promoted to admin for accounts that already had global admin/superadmin
    # capability, so no one loses access they already effectively had.
    op.execute("""
        INSERT INTO organization_members (organization_id, user_id, role, active)
        SELECT u.organization_id, u.id,
               CASE WHEN u.role IN ('superadmin', 'admin') THEN 'admin' ELSE 'member' END::org_role_enum,
               true
        FROM users u
        WHERE u.organization_id IS NOT NULL
    """)

    op.execute("ALTER TABLE users DROP COLUMN organization_id")

    op.execute("""
        CREATE TABLE organization_join_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id),
            user_id UUID NOT NULL REFERENCES users(id),
            status join_request_status_enum NOT NULL DEFAULT 'pending',
            decided_by UUID REFERENCES users(id),
            decided_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_organization_join_requests_organization_id ON organization_join_requests(organization_id)")
    op.execute("CREATE INDEX ix_organization_join_requests_user_id ON organization_join_requests(user_id)")
    op.execute("""
        CREATE UNIQUE INDEX ux_organization_join_requests_pending
        ON organization_join_requests(organization_id, user_id)
        WHERE status = 'pending'
    """)

    op.execute("""
        CREATE TABLE notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id),
            type VARCHAR(100) NOT NULL,
            title VARCHAR(255) NOT NULL,
            body TEXT,
            link VARCHAR(500),
            entity_type VARCHAR(50),
            entity_id UUID,
            is_read BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_notifications_user_id ON notifications(user_id)")


def downgrade() -> None:
    # Recreates structure only — join requests and notifications are not
    # recoverable. users.organization_id is best-effort restored from each
    # user's earliest active membership.
    op.execute("DROP TABLE IF EXISTS notifications")
    op.execute("DROP TABLE IF EXISTS organization_join_requests")

    op.execute("ALTER TABLE users ADD COLUMN organization_id UUID REFERENCES organizations(id)")
    op.execute("""
        UPDATE users u
        SET organization_id = m.organization_id
        FROM (
            SELECT DISTINCT ON (user_id) user_id, organization_id
            FROM organization_members
            WHERE active = true
            ORDER BY user_id, created_at ASC
        ) m
        WHERE u.id = m.user_id
    """)

    op.execute("DROP TABLE IF EXISTS organization_members")

    op.execute("DROP INDEX IF EXISTS ix_assets_organization_id")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS organization_id")

    op.execute("""
        ALTER TABLE organizations
            DROP COLUMN IF EXISTS full_name,
            DROP COLUMN IF EXISTS website,
            DROP COLUMN IF EXISTS location_id,
            DROP COLUMN IF EXISTS email,
            DROP COLUMN IF EXISTS phone,
            DROP COLUMN IF EXISTS private
    """)

    op.execute("DROP TYPE IF EXISTS join_request_status_enum")
    op.execute("DROP TYPE IF EXISTS org_role_enum")
