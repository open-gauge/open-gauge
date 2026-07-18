"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PdfThumbnail } from "@/components/pdf-thumbnail";
import type { UserProfile } from "@/types/user";
import {
  CameraIcon,
  CheckIcon,
  CheckCircleIcon,
  ClockIcon,
  DatabaseIcon,
  EditIcon,
  MailIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
  BuildingIcon,
  DashboardIcon,
  AssetRegistryIcon,
  DocumentIcon,
  UploadCloudIcon,
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
  deleteCertificateTemplate,
  deleteOrgLogo,
  deleteOrganization,
  deleteOrgTeam,
  getAdminStats,
  getAdminSystem,
  getEmailSettings,
  listAdminUsers,
  listCertificateTemplates,
  listOrganizations,
  listOrgTeams,
  previewBuiltinCertificateTemplate,
  previewCertificateTemplate,
  sendTestEmail,
  updateAdminUser,
  updateCertificateTemplate,
  updateEmailSettings,
  updateOrganization,
  updateOrgTeam,
  uploadCertificateTemplate,
  uploadOrgLogo,
  type AdminStats,
  type AdminSystem,
  type AdminTeam,
  type CertificateTemplate,
  type EmailSettings,
  type EmailSettingsUpdate,
  type Organization,
} from "@/services/admin.service";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const IB =
  "w-full px-3 py-2 rounded-lg border text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 transition-colors placeholder:text-gray-400";
const IB_OK = "border-og-border-md focus:border-og-accent focus:ring-og-accent/20";

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
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-6 text-sm text-red-500">
        {loadErr}
      </div>
    );
  }

  const statCards = stats
    ? [
        { label: "Assets",        value: stats.assets,        icon: <AssetRegistryIcon size={14} className="text-og-accent" /> },
        { label: "Procedures",    value: stats.procedures,    icon: <DocumentIcon size={14} className="text-og-accent" /> },
        { label: "Calibrations",  value: stats.calibrations,  icon: <ActivityIcon size={14} className="text-og-accent" /> },
        { label: "Users",         value: stats.users,         icon: <UsersIcon size={14} className="text-og-accent" /> },
        { label: "Organizations", value: stats.organizations, icon: <BuildingIcon size={14} className="text-og-accent" /> },
        { label: "Teams",         value: stats.teams,         icon: <DashboardIcon size={14} className="text-og-accent" /> },
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="px-4 py-3 border-b border-og-border">
          <p className="text-xs font-semibold text-og-text">Statistics</p>
        </div>
        <div className="p-4">
          {!stats ? (
            <div className="flex items-center gap-2 py-4 text-xs text-gray-400">
              <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {statCards.map(({ label, value, icon }) => (
                <div key={label} className="bg-og-surface-alt border border-og-border rounded-lg px-4 py-3 flex items-center gap-3">
                  {icon}
                  <div>
                    <p className="text-xl font-bold text-og-text leading-none">{value.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* System monitor */}
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="px-4 py-3 border-b border-og-border">
          <p className="text-xs font-semibold text-og-text">System Monitor</p>
        </div>
        <div className="p-4">
          {!sys ? (
            <div className="flex items-center gap-2 py-4 text-xs text-gray-400">
              <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-og-surface-alt border border-og-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <ClockIcon size={12} className="text-gray-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Uptime</p>
                </div>
                <p className="text-sm font-mono text-og-text">{formatUptime(sys.uptime_seconds)}</p>
              </div>
              <div className="bg-og-surface-alt border border-og-border rounded-lg px-4 py-3">
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
              <div className="bg-og-surface-alt border border-og-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <ActivityIcon size={12} className="text-gray-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">API Version</p>
                </div>
                <p className="text-sm font-mono text-og-text">{sys.api_version}</p>
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
  const [activating, setActivating] = useState(false);

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

  async function activate() {
    setActivating(true);
    try {
      const updated = await updateAdminUser(user.id, { is_verified: true });
      onUpdated(updated);
    } catch {
      // silent — could add toast here
    } finally {
      setActivating(false);
    }
  }

  const orgName = orgs.find((o) => o.id === user.organization_id)?.name;

  return (
    <div className={`px-4 py-3 ${editing ? "bg-og-surface-alt" : ""}`}>
      {editing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-og-text truncate">{user.name}</p>
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors"
            >
              <XIcon size={12} /> Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
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
              <p className="text-sm font-medium text-og-text truncate">{user.name}</p>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium ${ROLE_COLORS[user.role] ?? ROLE_COLORS.viewer}`}>
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
              {!user.is_active && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                  Disabled
                </span>
              )}
              {!user.is_verified && (
                <span
                  title="Self-registered without email verification available — needs manual activation before they can sign in."
                  className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                >
                  Pending activation
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 truncate">{user.email}{orgName ? ` · ${orgName}` : ""}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!user.is_verified && (
              <button
                onClick={activate}
                disabled={activating}
                title="Activate account"
                className="px-2 py-1 text-[10px] font-medium rounded transition-colors disabled:opacity-50 text-emerald-600 border border-emerald-400/40 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              >
                {activating ? "Activating…" : "Activate"}
              </button>
            )}
            <button
              onClick={toggleActive}
              disabled={toggling}
              title={user.is_active ? "Disable user" : "Enable user"}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-colors disabled:opacity-50 ${
                user.is_active
                  ? "text-gray-500 border border-og-border-md hover:bg-og-surface-alt"
                  : "text-emerald-600 border border-emerald-400/40 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              }`}
            >
              {user.is_active ? "Disable" : "Enable"}
            </button>
            <button
              onClick={startEdit}
              className="p-1.5 text-gray-400 hover:text-og-text rounded-sm transition-colors"
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
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
      <div className="flex items-center justify-between px-4 py-3 border-b border-og-border gap-3">
        <p className="text-xs font-semibold text-og-text shrink-0">
          Users {!loading && <span className="text-gray-400 font-normal">({total})</span>}
        </p>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email…"
          className="flex-1 max-w-xs px-3 py-1.5 rounded-lg border border-og-border-md bg-og-surface-alt text-xs text-og-text placeholder-gray-400 focus:outline-hidden focus:ring-1 focus:ring-og-accent/20 focus:border-og-accent transition-colors"
        />
      </div>

      <div className="divide-y divide-og-border min-h-[100px]">
        {loading && (
          <div className="flex items-center justify-center py-10 gap-2 text-xs text-gray-400">
            <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
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
        <div className="flex items-center justify-between px-4 py-3 border-t border-og-border">
          <p className="text-xs text-gray-400">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs font-medium border border-og-border-md rounded-lg text-gray-600 dark:text-gray-300 hover:bg-og-surface-alt transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-xs font-medium border border-og-border-md rounded-lg text-gray-600 dark:text-gray-300 hover:bg-og-surface-alt transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
    <div className="ml-6 border-l-2 border-og-border pl-4 pb-2 space-y-1">
      <div className="flex items-center justify-between py-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Teams</p>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-og-accent border border-og-accent/30 rounded-sm hover:bg-og-accent/10 transition-colors"
          >
            <PlusIcon size={10} /> New Team
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-og-surface-alt border border-og-border rounded-lg p-3 space-y-2">
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
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-sm hover:bg-og-surface-alt transition-colors">
              <XIcon size={10} /> Cancel
            </button>
            <button onClick={handleCreate} disabled={!newName.trim() || createSaving}
              className="flex items-center gap-1 px-3 py-1 text-[10px] font-medium bg-og-action hover:bg-og-action-dark text-white rounded-sm transition-colors disabled:opacity-60">
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
          <div key={team.id} className="bg-og-surface-alt border border-og-border rounded-lg p-3 space-y-2">
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
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-sm hover:bg-og-surface-alt transition-colors">
                <XIcon size={10} /> Cancel
              </button>
              <button onClick={() => handleSaveEdit(team.id)} disabled={!editName.trim() || editSaving}
                className="flex items-center gap-1 px-3 py-1 text-[10px] font-medium bg-og-action hover:bg-og-action-dark text-white rounded-sm transition-colors disabled:opacity-60">
                <CheckIcon size={10} /> {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div key={team.id} className="flex items-center justify-between py-1.5 gap-2 group">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-og-text">{team.name}</p>
              {team.description && <p className="text-[10px] text-gray-400">{team.description}</p>}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => { setEditId(team.id); setEditName(team.name); setEditDesc(team.description ?? ""); setEditErr(""); }}
                className="p-1 text-gray-400 hover:text-og-text rounded-sm transition-colors">
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

  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoErr, setLogoErr] = useState("");

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

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoUploading(true);
    setLogoErr("");
    try {
      onUpdated(await uploadOrgLogo(org.id, file));
    } catch (err: unknown) {
      setLogoErr(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleLogoRemove() {
    setLogoUploading(true);
    setLogoErr("");
    try {
      onUpdated(await deleteOrgLogo(org.id));
    } catch (err: unknown) {
      setLogoErr(err instanceof Error ? err.message : "Failed to remove logo");
    } finally {
      setLogoUploading(false);
    }
  }

  return (
    <div>
      {editing ? (
        <div className="px-4 py-4 space-y-3 bg-og-surface-alt border-b border-og-border">
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
              <XIcon size={12} /> Cancel
            </button>
            <button onClick={handleSave} disabled={!name.trim() || saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
              <CheckIcon size={12} /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 border-b border-og-border">
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
              <div className="w-7 h-7 rounded-md border border-og-border-md bg-og-surface-alt flex items-center justify-center overflow-hidden shrink-0">
                {org.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={org.logo_url} alt={org.name} className="w-full h-full object-contain" />
                ) : (
                  <BuildingIcon size={13} className="text-gray-300" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-og-text group-hover:text-og-accent transition-colors truncate">{org.name}</p>
                {org.description && <p className="text-xs text-gray-400 truncate">{org.description}</p>}
              </div>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => { setEditing(true); setName(org.name); setDesc(org.description ?? ""); }}
                className="p-1.5 text-gray-400 hover:text-og-text rounded-sm transition-colors">
                <EditIcon size={13} />
              </button>
              <button onClick={handleDelete}
                className="p-1.5 text-gray-400 hover:text-red-500 rounded-sm transition-colors">
                <TrashIcon size={13} />
              </button>
            </div>
          </div>

          {expanded && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-3 bg-og-surface-alt border border-og-border rounded-lg px-3 py-2.5">
                <div className="w-10 h-10 rounded-lg border border-og-border-md bg-og-surface flex items-center justify-center overflow-hidden shrink-0">
                  {org.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={org.logo_url} alt={org.name} className="w-full h-full object-contain" />
                  ) : (
                    <BuildingIcon size={16} className="text-gray-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoUploading}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-sm hover:bg-og-surface transition-colors disabled:opacity-60"
                    >
                      <CameraIcon size={10} /> {logoUploading ? "Saving…" : org.logo_url ? "Change logo" : "Upload logo"}
                    </button>
                    {org.logo_url && (
                      <button
                        type="button"
                        onClick={handleLogoRemove}
                        disabled={logoUploading}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-red-500 border border-og-border-md rounded-sm hover:bg-og-surface transition-colors disabled:opacity-60"
                      >
                        <TrashIcon size={10} /> Remove
                      </button>
                    )}
                  </div>
                  {logoErr && <p className="text-[10px] text-red-500">{logoErr}</p>}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </div>
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
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
      <div className="flex items-center justify-between px-4 py-3 border-b border-og-border">
        <p className="text-xs font-semibold text-og-text">Organizations</p>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors"
          >
            <PlusIcon size={12} /> New Organization
          </button>
        )}
      </div>

      {creating && (
        <div className="px-4 py-4 border-b border-og-border bg-og-surface-alt space-y-3">
          <p className="text-xs font-semibold text-og-text">New Organization</p>
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
              <XIcon size={12} /> Cancel
            </button>
            <button onClick={handleCreate} disabled={!newName.trim() || createSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
              <CheckIcon size={12} /> {createSaving ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10 gap-2 text-xs text-gray-400">
          <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
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
// Certificate templates section
// ---------------------------------------------------------------------------

function CertificateTemplateRow({
  template,
  onUpdated,
  onDeleted,
}: {
  template: CertificateTemplate;
  onUpdated: (updated: CertificateTemplate) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setErr("");
    try {
      onUpdated(await updateCertificateTemplate(template.id, { name: name.trim() }));
      setEditing(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetDefault() {
    try {
      onUpdated(await updateCertificateTemplate(template.id, { is_default: true }));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to set default");
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete template "${template.name}"?`)) return;
    try {
      await deleteCertificateTemplate(template.id);
      onDeleted(template.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  if (editing) {
    return (
      <div className="px-4 py-4 space-y-3 bg-og-surface-alt border-b border-og-border">
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${IB} ${IB_OK}`} autoFocus />
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2">
          <button onClick={() => { setEditing(false); setName(template.name); setErr(""); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
            <XIcon size={12} /> Cancel
          </button>
          <button onClick={handleSave} disabled={!name.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
            <CheckIcon size={12} /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-og-border gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <PdfThumbnail fetchPdf={() => previewCertificateTemplate(template.id)} title={template.name} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-og-text truncate">{template.name}</p>
          {template.description && <p className="text-xs text-gray-400 truncate">{template.description}</p>}
        </div>
        {template.is_default && (
          <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-sm bg-og-accent/10 text-og-accent">
            Default
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!template.is_default && (
          <button onClick={handleSetDefault} className="p-1.5 text-gray-400 hover:text-og-text rounded-sm transition-colors" title="Set as default">
            <CheckIcon size={13} />
          </button>
        )}
        <button onClick={() => setEditing(true)} className="p-1.5 text-gray-400 hover:text-og-text rounded-sm transition-colors" title="Rename">
          <EditIcon size={13} />
        </button>
        <button onClick={handleDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded-sm transition-colors" title="Delete">
          <TrashIcon size={13} />
        </button>
      </div>
    </div>
  );
}

function CertificateTemplatesSection({ orgs }: { orgs: Organization[] }) {
  const [scope, setScope] = useState<string>("global");
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadDefault, setUploadDefault] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");

  const organizationId = scope === "global" ? undefined : scope;

  useEffect(() => {
    listCertificateTemplates(organizationId)
      .then((all) => setTemplates(all.filter((t) => (organizationId ? t.organization_id === organizationId : t.organization_id === null))))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load templates"))
      .finally(() => setLoading(false));
  }, [organizationId]);

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !uploadName.trim()) return;
    setUploading(true);
    setUploadErr("");
    try {
      const created = await uploadCertificateTemplate({
        file, name: uploadName.trim(), organizationId, isDefault: uploadDefault,
      });
      setTemplates((prev) => (uploadDefault ? prev.map((t) => ({ ...t, is_default: false })) : prev).concat(created));
      setUploadName("");
      setUploadDefault(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: unknown) {
      setUploadErr(e instanceof Error ? e.message : "Failed to upload template");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
      <div className="flex items-center justify-between px-4 py-3 border-b border-og-border gap-3">
        <p className="text-xs font-semibold text-og-text">Certificate Templates</p>
        <div className="flex items-center gap-3">
          <select value={scope} onChange={(e) => setScope(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-lg border border-og-border-md bg-og-surface text-og-text">
            <option value="global">Global (all organizations)</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-2 pl-3 border-l border-og-border-md">
            <PdfThumbnail fetchPdf={previewBuiltinCertificateTemplate} title="Built-in default" />
            <span className="text-xs text-gray-400">Built-in default</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 border-b border-og-border bg-og-surface-alt space-y-3">
        <p className="text-xs font-semibold text-og-text">
          Upload template {scope === "global" ? "(global default, requires superadmin)" : `for ${orgs.find((o) => o.id === scope)?.name ?? ""}`}
        </p>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">.tex file <span className="text-red-400">*</span></label>
          <input ref={fileInputRef} type="file" accept=".tex" className={`${IB} ${IB_OK} py-1.5!`} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Name <span className="text-red-400">*</span></label>
          <input value={uploadName} onChange={(e) => setUploadName(e.target.value)} className={`${IB} ${IB_OK} py-1.5!`}
            placeholder="e.g. ISO 17025 Certificate" />
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input type="checkbox" checked={uploadDefault} onChange={(e) => setUploadDefault(e.target.checked)} />
          Set as default for this scope
        </label>
        {uploadErr && <p className="text-xs text-red-500">{uploadErr}</p>}
        <button onClick={handleUpload} disabled={!uploadName.trim() || uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
          <UploadCloudIcon size={12} /> {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 gap-2 text-xs text-gray-400">
          <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
          Loading…
        </div>
      )}
      {!loading && err && <div className="px-4 py-4 text-sm text-red-500">{err}</div>}
      {!loading && !err && templates.length === 0 && (
        <p className="px-4 py-8 text-sm text-gray-400 text-center">
          No templates in this scope yet — the built-in default is used until one is uploaded.
        </p>
      )}
      {!loading && !err && templates.map((t) => (
        <CertificateTemplateRow
          key={t.id}
          template={t}
          onUpdated={(updated) => setTemplates((prev) => prev.map((x) => (x.id === updated.id ? updated : (updated.is_default ? { ...x, is_default: false } : x))))}
          onDeleted={(id) => setTemplates((prev) => prev.filter((x) => x.id !== id))}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email settings section
// ---------------------------------------------------------------------------

const IB_ERR = "border-red-400 focus:border-red-400 focus:ring-red-400/20";

const EMPTY_SETTINGS_FORM = {
  smtp_host: "",
  smtp_port: 587,
  smtp_username: "",
  smtp_password: "",
  smtp_use_tls: true,
  from_email: "",
  from_name: "Open Gauge",
  enabled: false,
  calibration_reminder_days: 14,
};

function EmailSettingsSection() {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [form, setForm] = useState(EMPTY_SETTINGS_FORM);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveErr, setSaveErr] = useState("");

  const [testEmail, setTestEmail] = useState("");
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testErr, setTestErr] = useState("");

  useEffect(() => {
    getEmailSettings()
      .then((s) => {
        setSettings(s);
        setForm({
          smtp_host: s.smtp_host ?? "",
          smtp_port: s.smtp_port,
          smtp_username: s.smtp_username ?? "",
          smtp_password: "",
          smtp_use_tls: s.smtp_use_tls,
          from_email: s.from_email ?? "",
          from_name: s.from_name,
          enabled: s.enabled,
          calibration_reminder_days: s.calibration_reminder_days,
        });
      })
      .catch((e: unknown) => setLoadErr(e instanceof Error ? e.message : "Failed to load email settings"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaveState("saving");
    setSaveErr("");
    try {
      const body: EmailSettingsUpdate = {
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        smtp_username: form.smtp_username,
        smtp_use_tls: form.smtp_use_tls,
        from_email: form.from_email,
        from_name: form.from_name,
        enabled: form.enabled,
        calibration_reminder_days: form.calibration_reminder_days,
      };
      // Only send the password field if the admin actually typed something —
      // omitting it leaves the stored password untouched.
      if (form.smtp_password) body.smtp_password = form.smtp_password;

      const updated = await updateEmailSettings(body);
      setSettings(updated);
      setForm((f) => ({ ...f, smtp_password: "" }));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "Failed to save email settings");
      setSaveState("error");
    }
  }

  async function handleTest() {
    if (!testEmail.trim()) return;
    setTestState("sending");
    setTestErr("");
    try {
      await sendTestEmail(testEmail.trim());
      setTestState("sent");
      setTimeout(() => setTestState("idle"), 3000);
    } catch (e: unknown) {
      setTestErr(e instanceof Error ? e.message : "Failed to send test email");
      setTestState("error");
    }
  }

  if (loading) {
    return (
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-10 flex items-center justify-center gap-2 text-xs text-gray-400">
        <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
        Loading…
      </div>
    );
  }

  if (loadErr || !settings) {
    return (
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-6 text-sm text-red-500">
        {loadErr || "Failed to load email settings"}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="flex items-center justify-between px-4 py-3 border-b border-og-border">
          <div className="flex items-center gap-2">
            <MailIcon size={14} className="text-og-accent" />
            <div>
              <p className="text-xs font-semibold text-og-text">SMTP configuration</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Used for account verification and calibration notification emails.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-og-text cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="w-4 h-4 rounded accent-og-accent"
            />
            Enabled
          </label>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-gray-400">SMTP host</label>
              <input
                value={form.smtp_host}
                onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))}
                placeholder="smtp.example.com"
                className={`${IB} ${IB_OK}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Port</label>
              <input
                type="number"
                value={form.smtp_port}
                onChange={(e) => setForm((f) => ({ ...f, smtp_port: Number(e.target.value) }))}
                className={`${IB} ${IB_OK}`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">SMTP username</label>
              <input
                value={form.smtp_username}
                onChange={(e) => setForm((f) => ({ ...f, smtp_username: e.target.value }))}
                placeholder="Optional"
                className={`${IB} ${IB_OK}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">SMTP password</label>
              <input
                type="password"
                value={form.smtp_password}
                onChange={(e) => setForm((f) => ({ ...f, smtp_password: e.target.value }))}
                placeholder={settings.has_smtp_password ? "•••••••• (unchanged)" : "Not set"}
                className={`${IB} ${IB_OK}`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">From address</label>
              <input
                type="email"
                value={form.from_email}
                onChange={(e) => setForm((f) => ({ ...f, from_email: e.target.value }))}
                placeholder="noreply@example.com"
                className={`${IB} ${IB_OK}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">From name</label>
              <input
                value={form.from_name}
                onChange={(e) => setForm((f) => ({ ...f, from_name: e.target.value }))}
                className={`${IB} ${IB_OK}`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <label className="flex items-center gap-2 text-xs font-medium text-og-text cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={form.smtp_use_tls}
                onChange={(e) => setForm((f) => ({ ...f, smtp_use_tls: e.target.checked }))}
                className="w-4 h-4 rounded accent-og-accent"
              />
              Use STARTTLS (uncheck for implicit SSL)
            </label>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Calibration reminder lead time (days)</label>
              <input
                type="number"
                min={1}
                max={90}
                value={form.calibration_reminder_days}
                onChange={(e) => setForm((f) => ({ ...f, calibration_reminder_days: Number(e.target.value) }))}
                className={`${IB} ${IB_OK}`}
              />
            </div>
          </div>

          {saveErr && <p className="text-xs text-red-500">{saveErr}</p>}

          <div className="flex justify-end pt-1">
            <button
              onClick={handleSave}
              disabled={saveState === "saving"}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
            >
              <CheckIcon size={12} />
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save"}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="px-4 py-3 border-b border-og-border">
          <p className="text-xs font-semibold text-og-text">Send test email</p>
        </div>
        <div className="p-4 flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-gray-400">Recipient</label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@example.com"
              className={`${IB} ${testState === "error" ? IB_ERR : IB_OK}`}
            />
          </div>
          <button
            onClick={handleTest}
            disabled={!testEmail.trim() || testState === "sending"}
            className="flex items-center gap-1.5 px-4 py-2 border border-og-border-md rounded-lg text-xs font-medium text-og-text hover:bg-og-surface-alt transition-colors disabled:opacity-60"
          >
            {testState === "sending" ? "Sending…" : testState === "sent" ? "Sent ✓" : "Send test email"}
          </button>
        </div>
        {testErr && <p className="px-4 pb-3 text-xs text-red-500">{testErr}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Section = "dashboard" | "users" | "organizations" | "certificates" | "email";

const NAV: { id: Section; label: string }[] = [
  { id: "dashboard",     label: "Dashboard" },
  { id: "users",         label: "Users" },
  { id: "organizations", label: "Organizations" },
  { id: "certificates",  label: "Certificate Templates" },
  { id: "email",         label: "Email" },
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
        <h1 className="text-xl font-bold text-og-text">Admin</h1>
        <p className="text-sm text-gray-400 mt-1">Manage users, organizations, and system settings</p>
      </div>

      <div className="flex gap-5 items-start">
        {/* Sidebar nav */}
        <div className="w-52 shrink-0 bg-og-surface rounded-xl border border-og-border shadow-xs sticky top-4">
          <div className="px-3 py-3 border-b border-og-border">
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
                    ? "bg-og-border text-og-text"
                    : "text-gray-400 hover:bg-og-border/50 hover:text-og-text"
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
          {section === "certificates" && <CertificateTemplatesSection orgs={orgs} />}
          {section === "email" && <EmailSettingsSection />}
        </div>
      </div>
    </div>
  );
}
