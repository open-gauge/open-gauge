"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { UserProfile } from "@/types/user";
import {
  CheckIcon,
  CheckCircleIcon,
  ClockIcon,
  DatabaseIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
  BuildingIcon,
  DashboardIcon,
  AssetRegistryIcon,
  DocumentIcon,
  ActivityIcon,
  WarningIcon,
  XIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@/components/icons";
import {
  countAdminUsers,
  createOrganization,
  createOrgTeam,
  deleteOrganization,
  deleteOrgTeam,
  getAdminStats,
  getAdminSystem,
  listAdminUsers,
  listOrganizations,
  listOrgTeams,
  updateAdminUser,
  updateOrganization,
  updateOrgTeam,
  type AdminStats,
  type AdminSystem,
  type AdminTeam,
  type Organization,
} from "@/services/admin.service";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const IB =
  "w-full px-3 py-2 rounded-lg border text-sm text-mar-text bg-mar-surface focus:outline-hidden focus:ring-1 transition-colors placeholder:text-gray-400";
const IB_OK = "border-mar-border-md focus:border-mar-accent focus:ring-mar-accent/20";

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  technician: "Technician",
  viewer: "Viewer",
};

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  technician: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  viewer: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

// ---------------------------------------------------------------------------
// Dashboard section
// ---------------------------------------------------------------------------

function DashboardSection() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [sys, setSys] = useState<AdminSystem | null>(null);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    Promise.all([getAdminStats(), getAdminSystem()])
      .then(([s, sy]) => { setStats(s); setSys(sy); })
      .catch((e: unknown) => setLoadErr(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  if (loadErr) {
    return (
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs p-6 text-sm text-red-500">
        {loadErr}
      </div>
    );
  }

  const statCards = stats
    ? [
        { label: "Assets",        value: stats.assets,        icon: <AssetRegistryIcon size={14} className="text-mar-accent" /> },
        { label: "Procedures",    value: stats.procedures,    icon: <DocumentIcon size={14} className="text-mar-accent" /> },
        { label: "Calibrations",  value: stats.calibrations,  icon: <ActivityIcon size={14} className="text-mar-accent" /> },
        { label: "Users",         value: stats.users,         icon: <UsersIcon size={14} className="text-mar-accent" /> },
        { label: "Organizations", value: stats.organizations, icon: <BuildingIcon size={14} className="text-mar-accent" /> },
        { label: "Teams",         value: stats.teams,         icon: <DashboardIcon size={14} className="text-mar-accent" /> },
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs">
        <div className="px-4 py-3 border-b border-mar-border">
          <p className="text-xs font-semibold text-mar-text">Statistics</p>
        </div>
        <div className="p-4">
          {!stats ? (
            <div className="flex items-center gap-2 py-4 text-xs text-gray-400">
              <span className="w-4 h-4 border-2 border-mar-accent/30 border-t-mar-accent rounded-full animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {statCards.map(({ label, value, icon }) => (
                <div key={label} className="bg-mar-surface-alt border border-mar-border rounded-lg px-4 py-3 flex items-center gap-3">
                  {icon}
                  <div>
                    <p className="text-xl font-bold text-mar-text leading-none">{value.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* System monitor */}
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs">
        <div className="px-4 py-3 border-b border-mar-border">
          <p className="text-xs font-semibold text-mar-text">System Monitor</p>
        </div>
        <div className="p-4">
          {!sys ? (
            <div className="flex items-center gap-2 py-4 text-xs text-gray-400">
              <span className="w-4 h-4 border-2 border-mar-accent/30 border-t-mar-accent rounded-full animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-mar-surface-alt border border-mar-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <ClockIcon size={12} className="text-gray-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Uptime</p>
                </div>
                <p className="text-sm font-mono text-mar-text">{formatUptime(sys.uptime_seconds)}</p>
              </div>
              <div className="bg-mar-surface-alt border border-mar-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <DatabaseIcon size={12} className="text-gray-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Database</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {sys.db_status === "ok" ? (
                    <CheckCircleIcon size={13} className="text-emerald-500" />
                  ) : (
                    <WarningIcon size={13} className="text-red-500" />
                  )}
                  <p className={`text-sm font-medium ${sys.db_status === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                    {sys.db_status === "ok" ? "Healthy" : "Error"}
                  </p>
                </div>
              </div>
              <div className="bg-mar-surface-alt border border-mar-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <ActivityIcon size={12} className="text-gray-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">API Version</p>
                </div>
                <p className="text-sm font-mono text-mar-text">{sys.api_version}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users section
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;
const EDITABLE_ROLES = ["admin", "technician", "viewer"] as const;

function UserRow({
  user,
  orgs,
  onUpdated,
}: {
  user: UserProfile;
  orgs: Organization[];
  onUpdated: (updated: UserProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(user.role);
  const [orgId, setOrgId] = useState(user.organization_id ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toggling, setToggling] = useState(false);

  function startEdit() {
    setRole(user.role);
    setOrgId(user.organization_id ?? "");
    setErr("");
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    setErr("");
    try {
      const updated = await updateAdminUser(user.id, {
        role,
        organization_id: orgId || null,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    setToggling(true);
    try {
      const updated = await updateAdminUser(user.id, { is_active: !user.is_active });
      onUpdated(updated);
    } catch {
      // silent — could add toast here
    } finally {
      setToggling(false);
    }
  }

  const orgName = orgs.find((o) => o.id === user.organization_id)?.name;

  return (
    <div className={`px-4 py-3 ${editing ? "bg-mar-surface-alt" : ""}`}>
      {editing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-mar-text truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className={`${IB} ${IB_OK}`}
              >
                {EDITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Organization</label>
              <select
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className={`${IB} ${IB_OK}`}
              >
                <option value="">— None —</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors"
            >
              <XIcon size={12} /> Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
            >
              <CheckIcon size={12} /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              user.is_active ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
            }`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-mar-text truncate">{user.name}</p>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium ${ROLE_COLORS[user.role] ?? ROLE_COLORS.viewer}`}>
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
              {!user.is_active && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                  Disabled
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 truncate">{user.email}{orgName ? ` · ${orgName}` : ""}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={toggleActive}
              disabled={toggling}
              title={user.is_active ? "Disable user" : "Enable user"}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-colors disabled:opacity-50 ${
                user.is_active
                  ? "text-gray-500 border border-mar-border-md hover:bg-mar-surface-alt"
                  : "text-emerald-600 border border-emerald-400/40 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              }`}
            >
              {user.is_active ? "Disable" : "Enable"}
            </button>
            <button
              onClick={startEdit}
              className="p-1.5 text-gray-400 hover:text-mar-text rounded-sm transition-colors"
            >
              <EditIcon size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UsersSection({ orgs }: { orgs: Organization[] }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [rows, cnt] = await Promise.all([
        listAdminUsers({ skip: page * PAGE_SIZE, limit: PAGE_SIZE, q: debouncedQ || undefined }),
        countAdminUsers(debouncedQ || undefined),
      ]);
      setUsers(rows);
      setTotal(cnt);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ]);

  useEffect(() => { load(); }, [load]);

  function handleUpdated(updated: UserProfile) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs">
      <div className="flex items-center justify-between px-4 py-3 border-b border-mar-border gap-3">
        <p className="text-xs font-semibold text-mar-text shrink-0">
          Users {!loading && <span className="text-gray-400 font-normal">({total})</span>}
        </p>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email…"
          className="flex-1 max-w-xs px-3 py-1.5 rounded-lg border border-mar-border-md bg-mar-surface-alt text-xs text-mar-text placeholder-gray-400 focus:outline-hidden focus:ring-1 focus:ring-mar-accent/20 focus:border-mar-accent transition-colors"
        />
      </div>

      <div className="divide-y divide-mar-border min-h-[100px]">
        {loading && (
          <div className="flex items-center justify-center py-10 gap-2 text-xs text-gray-400">
            <span className="w-4 h-4 border-2 border-mar-accent/30 border-t-mar-accent rounded-full animate-spin" />
            Loading…
          </div>
        )}
        {!loading && err && (
          <div className="px-4 py-4 text-sm text-red-500">{err}</div>
        )}
        {!loading && !err && users.length === 0 && (
          <p className="px-4 py-8 text-sm text-gray-400 text-center">No users found.</p>
        )}
        {!loading && !err && users.map((u) => (
          <UserRow key={u.id} user={u} orgs={orgs} onUpdated={handleUpdated} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-mar-border">
          <p className="text-xs text-gray-400">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs font-medium border border-mar-border-md rounded-lg text-gray-600 dark:text-gray-300 hover:bg-mar-surface-alt transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-xs font-medium border border-mar-border-md rounded-lg text-gray-600 dark:text-gray-300 hover:bg-mar-surface-alt transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Organizations section
// ---------------------------------------------------------------------------

function OrgTeamsPanel({ orgId }: { orgId: string }) {
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const [createErr, setCreateErr] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState("");

  useEffect(() => {
    listOrgTeams(orgId)
      .then(setTeams)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load teams"))
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreateSaving(true);
    setCreateErr("");
    try {
      const team = await createOrgTeam(orgId, { name: newName.trim(), description: newDesc.trim() || undefined });
      setTeams((prev) => [...prev, team].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName(""); setNewDesc(""); setCreating(false);
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreateSaving(false);
    }
  }

  async function handleSaveEdit(teamId: string) {
    if (!editName.trim()) return;
    setEditSaving(true);
    setEditErr("");
    try {
      const updated = await updateOrgTeam(teamId, { name: editName.trim(), description: editDesc.trim() || undefined });
      setTeams((prev) => prev.map((t) => (t.id === teamId ? updated : t)));
      setEditId(null);
    } catch (e: unknown) {
      setEditErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(teamId: string, teamName: string) {
    if (!confirm(`Delete team "${teamName}"?`)) return;
    try {
      await deleteOrgTeam(teamId);
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <div className="ml-6 border-l-2 border-mar-border pl-4 pb-2 space-y-1">
      <div className="flex items-center justify-between py-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Teams</p>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-mar-accent border border-mar-accent/30 rounded-sm hover:bg-mar-accent/10 transition-colors"
          >
            <PlusIcon size={10} /> New Team
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-mar-surface-alt border border-mar-border rounded-lg p-3 space-y-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Team name"
            className={`${IB} ${IB_OK} py-1.5! text-xs`}
            autoFocus
          />
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className={`${IB} ${IB_OK} py-1.5! text-xs`}
          />
          {createErr && <p className="text-xs text-red-500">{createErr}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); setCreateErr(""); }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-sm hover:bg-mar-surface-alt transition-colors">
              <XIcon size={10} /> Cancel
            </button>
            <button onClick={handleCreate} disabled={!newName.trim() || createSaving}
              className="flex items-center gap-1 px-3 py-1 text-[10px] font-medium bg-mar-action hover:bg-mar-action-dark text-white rounded-sm transition-colors disabled:opacity-60">
              <CheckIcon size={10} /> {createSaving ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {loading && <p className="text-xs text-gray-400 py-2">Loading…</p>}
      {!loading && err && <p className="text-xs text-red-500">{err}</p>}
      {!loading && !err && teams.length === 0 && !creating && (
        <p className="text-xs text-gray-400 py-1">No teams yet.</p>
      )}

      {teams.map((team) =>
        editId === team.id ? (
          <div key={team.id} className="bg-mar-surface-alt border border-mar-border rounded-lg p-3 space-y-2">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className={`${IB} ${IB_OK} py-1.5! text-xs`}
              autoFocus
            />
            <input
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description (optional)"
              className={`${IB} ${IB_OK} py-1.5! text-xs`}
            />
            {editErr && <p className="text-xs text-red-500">{editErr}</p>}
            <div className="flex gap-2">
              <button onClick={() => setEditId(null)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-sm hover:bg-mar-surface-alt transition-colors">
                <XIcon size={10} /> Cancel
              </button>
              <button onClick={() => handleSaveEdit(team.id)} disabled={!editName.trim() || editSaving}
                className="flex items-center gap-1 px-3 py-1 text-[10px] font-medium bg-mar-action hover:bg-mar-action-dark text-white rounded-sm transition-colors disabled:opacity-60">
                <CheckIcon size={10} /> {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div key={team.id} className="flex items-center justify-between py-1.5 gap-2 group">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-mar-text">{team.name}</p>
              {team.description && <p className="text-[10px] text-gray-400">{team.description}</p>}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => { setEditId(team.id); setEditName(team.name); setEditDesc(team.description ?? ""); setEditErr(""); }}
                className="p-1 text-gray-400 hover:text-mar-text rounded-sm transition-colors">
                <EditIcon size={11} />
              </button>
              <button
                onClick={() => handleDelete(team.id, team.name)}
                className="p-1 text-gray-400 hover:text-red-500 rounded-sm transition-colors">
                <TrashIcon size={11} />
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function OrgRow({
  org,
  onUpdated,
  onDeleted,
}: {
  org: Organization;
  onUpdated: (updated: Organization) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(org.name);
  const [desc, setDesc] = useState(org.description ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setErr("");
    try {
      const updated = await updateOrganization(org.id, { name: name.trim(), description: desc.trim() || undefined });
      onUpdated(updated);
      setEditing(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete organization "${org.name}"? This will deactivate all its teams and unassign its members.`)) return;
    try {
      await deleteOrganization(org.id);
      onDeleted(org.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <div>
      {editing ? (
        <div className="px-4 py-4 space-y-3 bg-mar-surface-alt border-b border-mar-border">
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Organization name <span className="text-red-400">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${IB} ${IB_OK}`} autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Description</label>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} className={`${IB} ${IB_OK}`} placeholder="Optional description" />
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); setName(org.name); setDesc(org.description ?? ""); setErr(""); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors">
              <XIcon size={12} /> Cancel
            </button>
            <button onClick={handleSave} disabled={!name.trim() || saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
              <CheckIcon size={12} /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 border-b border-mar-border">
          <div className="flex items-start justify-between gap-3">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left group"
            >
              {expanded ? (
                <ChevronDownIcon size={13} className="text-gray-400 shrink-0" />
              ) : (
                <ChevronRightIcon size={13} className="text-gray-400 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-mar-text group-hover:text-mar-accent transition-colors truncate">{org.name}</p>
                {org.description && <p className="text-xs text-gray-400 truncate">{org.description}</p>}
              </div>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => { setEditing(true); setName(org.name); setDesc(org.description ?? ""); }}
                className="p-1.5 text-gray-400 hover:text-mar-text rounded-sm transition-colors">
                <EditIcon size={13} />
              </button>
              <button onClick={handleDelete}
                className="p-1.5 text-gray-400 hover:text-red-500 rounded-sm transition-colors">
                <TrashIcon size={13} />
              </button>
            </div>
          </div>

          {expanded && (
            <div className="mt-3">
              <OrgTeamsPanel orgId={org.id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrgsSection() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const [createErr, setCreateErr] = useState("");

  useEffect(() => {
    listOrganizations()
      .then(setOrgs)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load organizations"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreateSaving(true);
    setCreateErr("");
    try {
      const org = await createOrganization({ name: newName.trim(), description: newDesc.trim() || undefined });
      setOrgs((prev) => [...prev, org].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName(""); setNewDesc(""); setCreating(false);
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : "Failed to create organization");
    } finally {
      setCreateSaving(false);
    }
  }

  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs">
      <div className="flex items-center justify-between px-4 py-3 border-b border-mar-border">
        <p className="text-xs font-semibold text-mar-text">Organizations</p>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors"
          >
            <PlusIcon size={12} /> New Organization
          </button>
        )}
      </div>

      {creating && (
        <div className="px-4 py-4 border-b border-mar-border bg-mar-surface-alt space-y-3">
          <p className="text-xs font-semibold text-mar-text">New Organization</p>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Name <span className="text-red-400">*</span></label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className={`${IB} ${IB_OK}`}
              placeholder="e.g. Metrology Lab" autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Description</label>
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className={`${IB} ${IB_OK}`}
              placeholder="Optional description" />
          </div>
          {createErr && <p className="text-xs text-red-500">{createErr}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); setCreateErr(""); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors">
              <XIcon size={12} /> Cancel
            </button>
            <button onClick={handleCreate} disabled={!newName.trim() || createSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
              <CheckIcon size={12} /> {createSaving ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10 gap-2 text-xs text-gray-400">
          <span className="w-4 h-4 border-2 border-mar-accent/30 border-t-mar-accent rounded-full animate-spin" />
          Loading…
        </div>
      )}
      {!loading && err && <div className="px-4 py-4 text-sm text-red-500">{err}</div>}
      {!loading && !err && orgs.length === 0 && !creating && (
        <p className="px-4 py-8 text-sm text-gray-400 text-center">No organizations yet.</p>
      )}
      {!loading && !err && orgs.map((org) => (
        <OrgRow
          key={org.id}
          org={org}
          onUpdated={(updated) => setOrgs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))}
          onDeleted={(id) => setOrgs((prev) => prev.filter((o) => o.id !== id))}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Section = "dashboard" | "users" | "organizations";

const NAV: { id: Section; label: string }[] = [
  { id: "dashboard",     label: "Dashboard" },
  { id: "users",         label: "Users" },
  { id: "organizations", label: "Organizations" },
];

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [section, setSection] = useState<Section>("dashboard");

  // Shared orgs state used by both Users (for selects) and Organizations sections
  const [orgs, setOrgs] = useState<Organization[]>([]);

  const isAdmin = user.is_superuser || user.role === "superadmin" || user.role === "admin";

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/dashboard");
    }
  }, [isAdmin, router]);

  useEffect(() => {
    if (isAdmin) {
      listOrganizations().then(setOrgs).catch(() => {});
    }
  }, [isAdmin]);

  if (!isAdmin) return null;

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-mar-text">Admin</h1>
        <p className="text-sm text-gray-400 mt-1">Manage users, organizations, and system settings</p>
      </div>

      <div className="flex gap-5 items-start">
        {/* Sidebar nav */}
        <div className="w-52 shrink-0 bg-mar-surface rounded-xl border border-mar-border shadow-xs sticky top-4">
          <div className="px-3 py-3 border-b border-mar-border">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Administration</p>
          </div>
          <div className="p-2">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  section === item.id
                    ? "bg-mar-border text-mar-text"
                    : "text-gray-400 hover:bg-mar-border/50 hover:text-mar-text"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {section === "dashboard" && <DashboardSection />}
          {section === "users" && <UsersSection orgs={orgs} />}
          {section === "organizations" && <OrgsSection />}
        </div>
      </div>
    </div>
  );
}
