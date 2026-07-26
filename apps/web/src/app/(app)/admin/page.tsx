"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { PdfThumbnail } from "@/components/pdf-thumbnail";
import { Avatar } from "@/components/avatar";
import { ToggleSwitch } from "@/components/toggle-switch";
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
  deleteCertificateTemplate,
  exportDatabase,
  getAdminStats,
  getAdminSystem,
  getEmailSettings,
  importDatabase,
  listAdminUsers,
  listCertificateTemplates,
  previewBuiltinCertificateTemplate,
  previewCertificateTemplate,
  resetDatabase,
  sendTestEmail,
  updateAdminUser,
  updateCertificateTemplate,
  updateEmailSettings,
  uploadCertificateTemplate,
  type AdminStats,
  type AdminSystem,
  type CertificateTemplate,
  type EmailSettings,
  type EmailSettingsUpdate,
} from "@/services/admin.service";
import { listOrganizations } from "@/services/organization.service";
import type { OrganizationListItem } from "@/types/organization";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/roles";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const IB =
  "w-full px-3 py-2 rounded-lg border text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 transition-colors placeholder:text-gray-400";
const IB_OK = "border-og-border-md focus:border-og-accent focus:ring-og-accent/20";

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
  const { user } = useAuth();
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

      {user.role === "superadmin" && <DangerZone />}
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
  onUpdated,
}: {
  user: UserProfile;
  onUpdated: (updated: UserProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(user.role);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toggling, setToggling] = useState(false);
  const [activating, setActivating] = useState(false);

  function startEdit() {
    setRole(user.role);
    setErr("");
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    setErr("");
    try {
      const updated = await updateAdminUser(user.id, { role });
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

  return (
    <div className={`px-4 py-3 ${editing ? "bg-og-surface-alt" : ""}`}>
      {editing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} pictureUrl={user.profile_picture_url} size={32} />
            <div className="flex-1 min-w-0">
              <Link href={`/users/${user.id}`} className="text-sm font-medium text-og-text truncate hover:underline block">{user.name}</Link>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
          </div>
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
          <Avatar name={user.name} pictureUrl={user.profile_picture_url} size={32} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/users/${user.id}`} className="text-sm font-medium text-og-text truncate hover:underline">{user.name}</Link>
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
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
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

function UsersSection() {
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
          <UserRow key={u.id} user={u} onUpdated={handleUpdated} />
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

function CertificateTemplatesSection({ orgs }: { orgs: OrganizationListItem[] }) {
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
          <ToggleSwitch checked={uploadDefault} onChange={setUploadDefault} />
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
            <ToggleSwitch checked={form.enabled} onChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
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
              <ToggleSwitch checked={form.smtp_use_tls} onChange={(v) => setForm((f) => ({ ...f, smtp_use_tls: v }))} />
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
// Dangerous zone — export/import/reset/clear the database. Lives at the
// bottom of the admin Dashboard, superadmin only.
// ---------------------------------------------------------------------------

function DangerZone() {
  const importInputRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState("");

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState("");
  const [importOk, setImportOk] = useState(false);

  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetErr, setResetErr] = useState("");
  const [resetOk, setResetOk] = useState(false);

  async function handleExport() {
    setExporting(true);
    setExportErr("");
    try {
      const blob = await exportDatabase();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `opengauge-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setExportErr(e instanceof Error ? e.message : "Failed to export database");
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    if (!importFile) return;
    if (
      !window.confirm(
        "This replaces every table in the database with the contents of this backup file, including all organizations, assets, calibrations, and user accounts. This cannot be undone. Continue?",
      )
    ) {
      return;
    }
    setImporting(true);
    setImportErr("");
    setImportOk(false);
    try {
      await importDatabase(importFile);
      setImportOk(true);
      setImportFile(null);
      if (importInputRef.current) importInputRef.current.value = "";
    } catch (e: unknown) {
      setImportErr(e instanceof Error ? e.message : "Failed to import database");
    } finally {
      setImporting(false);
    }
  }

  async function handleReset() {
    if (resetConfirmText !== "RESET") return;
    if (
      !window.confirm(
        "This permanently deletes every organization, asset, location, procedure, calibration, and non-superadmin user, and empties file storage. Superadmin accounts are kept. This cannot be undone. Continue?",
      )
    ) {
      return;
    }
    setResetting(true);
    setResetErr("");
    setResetOk(false);
    try {
      await resetDatabase(resetConfirmText);
      setResetOk(true);
      setResetConfirmText("");
    } catch (e: unknown) {
      setResetErr(e instanceof Error ? e.message : "Failed to reset database");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-og-border">
          <DatabaseIcon size={14} className="text-og-accent" />
          <div>
            <p className="text-xs font-semibold text-og-text">Backup</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Download a full backup to restore later.
            </p>
          </div>
        </div>
        <div className="p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-og-text">Export database</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Downloads a zip with a complete PostgreSQL dump of every organization, asset, and
              record, plus every certificate, datasheet, and template file.
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 border border-og-border-md rounded-lg text-xs font-medium text-og-text hover:bg-og-surface-alt transition-colors disabled:opacity-60"
          >
            {exporting ? "Exporting…" : "Download backup"}
          </button>
        </div>
        {exportErr && <p className="px-4 pb-4 text-xs text-red-500">{exportErr}</p>}
      </div>

      <div className="bg-og-surface rounded-xl border border-red-200 dark:border-red-900/40 shadow-xs">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-900/10">
          <WarningIcon size={14} className="text-red-600 dark:text-red-400" />
          <div>
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">Dangerous zone</p>
            <p className="text-[10px] text-red-600/80 dark:text-red-400/70 mt-0.5">
              Irreversible actions. Superadmin only.
            </p>
          </div>
        </div>
        <div className="p-4 space-y-5">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-og-text">Import database</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Restores a backup file, replacing everything currently in the database and
                every certificate, datasheet, and template file in storage.
              </p>
              <input
                ref={importInputRef}
                type="file"
                accept=".zip,.dump"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="mt-2 text-[11px] text-gray-400 file:mr-2 file:px-2 file:py-1 file:rounded-md file:border file:border-og-border-md file:bg-og-surface-alt file:text-[11px] file:text-og-text"
              />
            </div>
            <button
              onClick={handleImport}
              disabled={!importFile || importing}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {importing ? "Restoring…" : "Restore backup"}
            </button>
            {importOk && <p className="text-xs text-emerald-600 dark:text-emerald-400">Database restored.</p>}
            {importErr && <p className="text-xs text-red-500">{importErr}</p>}
          </div>

          <div className="border-t border-og-border pt-5 space-y-3">
            <div>
              <p className="text-xs font-medium text-og-text">Clear database</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Deletes every organization, asset, location, procedure, and calibration, and every
                non-superadmin user. File storage is emptied. Superadmin accounts (including yours)
                are kept, so this is the way to take a populated demo/trial install back to the
                empty state a fresh deployment starts in.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder='Type "RESET" to confirm'
                className={`${IB} border-red-300 dark:border-red-900/50 focus:border-red-500 focus:ring-red-500/20 max-w-xs`}
              />
              <button
                onClick={handleReset}
                disabled={resetConfirmText !== "RESET" || resetting}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {resetting ? "Clearing…" : "Clear database"}
              </button>
            </div>
            {resetOk && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Database cleared.</p>
            )}
            {resetErr && <p className="text-xs text-red-500">{resetErr}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Section = "dashboard" | "users" | "certificates" | "email";

const NAV: { id: Section; label: string }[] = [
  { id: "dashboard",     label: "Dashboard" },
  { id: "users",         label: "Users" },
  { id: "certificates",  label: "Certificate Templates" },
  { id: "email",         label: "Email" },
];

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [section, setSection] = useState<Section>("dashboard");

  // Org list used by the Certificate Templates section's scope selector —
  // org management itself now lives on each organization's own page.
  const [orgs, setOrgs] = useState<OrganizationListItem[]>([]);

  const isAdmin = user.role === "superadmin" || user.role === "admin";

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
        <p className="text-sm text-gray-400 mt-1">Manage users and system settings</p>
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
          {section === "users" && <UsersSection />}
          {section === "certificates" && <CertificateTemplatesSection orgs={orgs} />}
          {section === "email" && <EmailSettingsSection />}
        </div>
      </div>
    </div>
  );
}
