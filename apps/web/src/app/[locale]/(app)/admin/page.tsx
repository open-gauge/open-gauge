"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { PdfThumbnail } from "@/components/pdf-thumbnail";
import { Avatar } from "@/components/avatar";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Select } from "@/components/select";
import { NumberInput } from "@/components/number-input";
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
  downloadCertificateTemplateBlob,
  exportDatabase,
  getAdminStats,
  getAdminSystem,
  getEmailSettings,
  importDatabase,
  listAdminUsers,
  listCertificateTemplates,
  previewCertificateTemplate,
  previewDocumentTemplate,
  resetDatabase,
  sendTestEmail,
  setCertificateTemplateEnabled,
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
import {
  archiveTemplate,
  createTemplate,
  duplicateTemplate,
  exportTemplate,
  importTemplate,
  listTemplates,
  setTemplateDefault,
  setTemplateEnabled,
} from "@/services/template.service";
import type { Template, TemplateListItem } from "@/types/template";
import { ROLE_COLORS } from "@/lib/roles";
import { TEMPLATE_STATUS_STYLE } from "@/lib/tokens";
import { translateDynamic } from "@/lib/translate-dynamic";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { CopyIcon, ExportIcon, ImportIcon, TemplatesIcon } from "@/components/icons";

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
  const t = useTranslations("admin.dashboard");
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [sys, setSys] = useState<AdminSystem | null>(null);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    Promise.all([getAdminStats(), getAdminSystem()])
      .then(([s, sy]) => { setStats(s); setSys(sy); })
      .catch((e: unknown) => setLoadErr(e instanceof Error ? e.message : t("failedToLoad")));
  }, [t]);

  if (loadErr) {
    return (
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-6 text-sm text-red-500">
        {loadErr}
      </div>
    );
  }

  const statCards = stats
    ? [
        { label: t("stats.assets"),        value: stats.assets,        icon: <AssetRegistryIcon size={14} className="text-og-accent" /> },
        { label: t("stats.procedures"),    value: stats.procedures,    icon: <DocumentIcon size={14} className="text-og-accent" /> },
        { label: t("stats.calibrations"),  value: stats.calibrations,  icon: <ActivityIcon size={14} className="text-og-accent" /> },
        { label: t("stats.users"),         value: stats.users,         icon: <UsersIcon size={14} className="text-og-accent" /> },
        { label: t("stats.organizations"), value: stats.organizations, icon: <BuildingIcon size={14} className="text-og-accent" /> },
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="px-4 py-3 border-b border-og-border">
          <p className="text-xs font-semibold text-og-text">{t("statistics")}</p>
        </div>
        <div className="p-4">
          {!stats ? (
            <div className="flex items-center gap-2 py-4 text-xs text-gray-400">
              <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
              {t("loading")}
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
          <p className="text-xs font-semibold text-og-text">{t("systemMonitor")}</p>
        </div>
        <div className="p-4">
          {!sys ? (
            <div className="flex items-center gap-2 py-4 text-xs text-gray-400">
              <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
              {t("loading")}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-og-surface-alt border border-og-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <ClockIcon size={12} className="text-gray-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{t("uptime")}</p>
                </div>
                <p className="text-sm font-mono text-og-text">{formatUptime(sys.uptime_seconds)}</p>
              </div>
              <div className="bg-og-surface-alt border border-og-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <DatabaseIcon size={12} className="text-gray-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{t("database")}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {sys.db_status === "ok" ? (
                    <CheckCircleIcon size={13} className="text-emerald-500" />
                  ) : (
                    <WarningIcon size={13} className="text-red-500" />
                  )}
                  <p className={`text-sm font-medium ${sys.db_status === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                    {sys.db_status === "ok" ? t("healthy") : t("error")}
                  </p>
                </div>
              </div>
              <div className="bg-og-surface-alt border border-og-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <ActivityIcon size={12} className="text-gray-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{t("apiVersion")}</p>
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
  const t = useTranslations("admin.users");
  const tRole = useTranslations("tokens.role");
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
      setErr(e instanceof Error ? e.message : t("failedToSave"));
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
            <label className="text-xs text-gray-400">{t("role")}</label>
            <Select
              value={role}
              onChange={(v) => setRole(v as typeof role)}
              options={EDITABLE_ROLES.map((r) => ({ value: r, label: translateDynamic(tRole, r) }))}
              className="w-40"
            />
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors"
            >
              <XIcon size={12} /> {t("cancel")}
            </button>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
            >
              <CheckIcon size={12} /> {saving ? t("saving") : t("save")}
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
                {translateDynamic(tRole, user.role)}
              </span>
              {!user.is_active && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                  {t("disabled")}
                </span>
              )}
              {!user.is_verified && (
                <span
                  title={t("pendingActivationTooltip")}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                >
                  {t("pendingActivation")}
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
                title={t("activateTooltip")}
                className="px-2 py-1 text-[10px] font-medium rounded transition-colors disabled:opacity-50 text-emerald-600 border border-emerald-400/40 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              >
                {activating ? t("activating") : t("activate")}
              </button>
            )}
            <button
              onClick={toggleActive}
              disabled={toggling}
              title={user.is_active ? t("disableTooltip") : t("enableTooltip")}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-colors disabled:opacity-50 ${
                user.is_active
                  ? "text-gray-500 border border-og-border-md hover:bg-og-surface-alt"
                  : "text-emerald-600 border border-emerald-400/40 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              }`}
            >
              {user.is_active ? t("disable") : t("enable")}
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
  const t = useTranslations("admin.users");
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
      setErr(e instanceof Error ? e.message : t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ, t]);

  useEffect(() => { load(); }, [load]);

  function handleUpdated(updated: UserProfile) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
      <div className="flex items-center justify-between px-4 py-3 border-b border-og-border gap-3">
        <p className="text-xs font-semibold text-og-text shrink-0">
          {t("title")} {!loading && <span className="text-gray-400 font-normal">({total})</span>}
        </p>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="flex-1 max-w-xs px-3 py-1.5 rounded-lg border border-og-border-md bg-og-surface-alt text-xs text-og-text placeholder-gray-400 focus:outline-hidden focus:ring-1 focus:ring-og-accent/20 focus:border-og-accent transition-colors"
        />
      </div>

      <div className="divide-y divide-og-border min-h-[100px]">
        {loading && (
          <div className="flex items-center justify-center py-10 gap-2 text-xs text-gray-400">
            <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
            {t("loading")}
          </div>
        )}
        {!loading && err && (
          <div className="px-4 py-4 text-sm text-red-500">{err}</div>
        )}
        {!loading && !err && users.length === 0 && (
          <p className="px-4 py-8 text-sm text-gray-400 text-center">{t("empty")}</p>
        )}
        {!loading && !err && users.map((u) => (
          <UserRow key={u.id} user={u} onUpdated={handleUpdated} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-og-border">
          <p className="text-xs text-gray-400">
            {t("page", { current: page + 1, total: totalPages })}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs font-medium border border-og-border-md rounded-lg text-gray-600 dark:text-gray-300 hover:bg-og-surface-alt transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("previous")}
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-xs font-medium border border-og-border-md rounded-lg text-gray-600 dark:text-gray-300 hover:bg-og-surface-alt transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("next")}
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugifyTemplateName(name: string): string {
  return name.trim().replace(/\s+/g, "_") || "template";
}

// "certificate" also covers editor (WYSIWYG) certificate templates — only "procedure" templates
// are exclusively DocumentTemplate rows with no legacy .tex counterpart.
type TemplateKind = "certificate" | "procedure";

type TemplateRowData =
  | { kind: "certificate"; data: CertificateTemplate }
  | { kind: "document"; data: TemplateListItem };

function TemplateRow({
  row,
  onCertUpdated,
  onCertDeleted,
  onDocUpdated,
  onDocArchived,
  onDocDuplicated,
}: {
  row: TemplateRowData;
  onCertUpdated: (updated: CertificateTemplate) => void;
  onCertDeleted: (id: string) => void;
  onDocUpdated: (updated: TemplateListItem | Template) => void;
  onDocArchived: (id: string) => void;
  onDocDuplicated: (created: TemplateListItem) => void;
}) {
  const t = useTranslations("admin.certificates");
  const tStatus = useTranslations("tokens.templateStatus");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);

  const { name, version, is_default: isDefault, is_builtin: isBuiltin, is_enabled: isEnabled } = row.data;

  async function handleDownload() {
    try {
      if (row.kind === "certificate") {
        downloadBlob(await downloadCertificateTemplateBlob(row.data.id), `${slugifyTemplateName(row.data.name)}.tex`);
      } else {
        downloadBlob(await exportTemplate(row.data.id), `${slugifyTemplateName(row.data.name)}.json`);
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : t("failedToDownload"));
    }
  }

  async function handleSetDefault() {
    setSettingDefault(true);
    try {
      if (row.kind === "certificate") {
        onCertUpdated(await updateCertificateTemplate(row.data.id, { is_default: true }));
      } else {
        onDocUpdated(await setTemplateDefault(row.data.id));
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : t("failedToSetDefault"));
    } finally {
      setSettingDefault(false);
    }
  }

  async function handleToggleEnabled(next: boolean) {
    setTogglingEnabled(true);
    try {
      if (row.kind === "certificate") {
        onCertUpdated(await setCertificateTemplateEnabled(row.data.id, next));
      } else {
        onDocUpdated(await setTemplateEnabled(row.data.id, next));
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : t("failedToToggleEnabled"));
    } finally {
      setTogglingEnabled(false);
    }
  }

  async function handleDuplicate() {
    if (row.kind !== "document") return;
    setDuplicating(true);
    try {
      onDocDuplicated(await duplicateTemplate(row.data.id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : t("failedToCreate"));
    } finally {
      setDuplicating(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("deleteConfirm", { name }))) return;
    setBusy(true);
    try {
      if (row.kind === "certificate") {
        await deleteCertificateTemplate(row.data.id);
        onCertDeleted(row.data.id);
      } else {
        await archiveTemplate(row.data.id);
        onDocArchived(row.data.id);
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : t("failedToDelete"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`flex items-center justify-between px-4 py-3 border-b border-og-border gap-3 ${!isEnabled ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <PdfThumbnail
          fetchPdf={() => (row.kind === "certificate" ? previewCertificateTemplate(row.data.id) : previewDocumentTemplate(row.data.id))}
          title={name}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-og-text truncate">{name}</p>
          {row.kind === "certificate" && row.data.description && (
            <p className="text-xs text-gray-400 truncate">{row.data.description}</p>
          )}
        </div>
        <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-sm bg-og-surface-alt border border-og-border-md text-gray-500">
          v{version}
        </span>
        {isBuiltin && (
          <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-sm bg-og-surface-alt border border-og-border-md text-gray-500">
            {t("base")}
          </span>
        )}
        {isDefault && (
          <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-sm bg-og-accent/10 text-og-accent">
            {t("default")}
          </span>
        )}
        {row.kind === "document" && (
          <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-sm border ${TEMPLATE_STATUS_STYLE[row.data.status]}`}>
            {translateDynamic(tStatus, row.data.status)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <label className="flex items-center gap-1.5 text-xs text-gray-400" title={t("enabledHint")}>
          <ToggleSwitch checked={isEnabled} onChange={handleToggleEnabled} disabled={togglingEnabled} size="sm" />
          {t("enabled")}
        </label>
        <div className="flex items-center gap-1">
          {!isDefault && (
            <button onClick={handleSetDefault} disabled={settingDefault || !isEnabled} className="p-1.5 text-gray-400 hover:text-og-text rounded-sm transition-colors disabled:opacity-40" title={t("setAsDefault")}>
              <CheckIcon size={13} />
            </button>
          )}
          <button onClick={handleDownload} className="p-1.5 text-gray-400 hover:text-og-text rounded-sm transition-colors" title={t("download")}>
            <ExportIcon size={13} />
          </button>
          {row.kind === "document" && (
            <>
              {!isBuiltin && (
                <button onClick={() => router.push(`/templates/${row.data.id}`)} className="p-1.5 text-gray-400 hover:text-og-text rounded-sm transition-colors" title={t("editInEditor")}>
                  <EditIcon size={13} />
                </button>
              )}
              <button onClick={handleDuplicate} disabled={duplicating} className="p-1.5 text-gray-400 hover:text-og-text rounded-sm transition-colors disabled:opacity-50" title={t("duplicate")}>
                <CopyIcon size={13} />
              </button>
            </>
          )}
          {!isBuiltin && (
            <button onClick={handleDelete} disabled={busy} className="p-1.5 text-gray-400 hover:text-red-500 rounded-sm transition-colors disabled:opacity-50" title={t("delete")}>
              <TrashIcon size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type NewTemplateStep = "choose" | "latex" | "json" | "create";

function ImportPreviewPane({ text }: { text: string }) {
  return (
    <pre className="h-64 overflow-auto rounded-lg border border-og-border-md bg-og-surface-alt p-3 text-xs font-mono text-og-text whitespace-pre-wrap break-all">
      {text}
    </pre>
  );
}

function NewTemplateModal({
  kind,
  scope,
  orgs,
  onClose,
  onCertCreated,
  onDocCreated,
}: {
  kind: TemplateKind;
  scope: string;
  orgs: OrganizationListItem[];
  onClose: () => void;
  onCertCreated: (created: CertificateTemplate) => void;
  onDocCreated: (created: TemplateListItem) => void;
}) {
  const t = useTranslations("admin.certificates");
  const router = useRouter();
  const [step, setStep] = useState<NewTemplateStep>("choose");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  const organizationId = kind === "certificate" && scope !== "global" ? scope : undefined;

  function backToChoose() {
    setStep("choose");
    setFileName("");
    setPreviewText("");
    setName("");
    setVersion("1");
    setErr("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPreviewText("");
    setFileName(file?.name ?? "");
    if (!file) return;
    if (!name.trim()) setName(file.name.replace(/\.(tex|json)$/i, ""));
    const reader = new FileReader();
    reader.onload = () => setPreviewText(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  }

  async function handleImportSubmit() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !name.trim()) return;
    setSubmitting(true);
    setErr("");
    const parsedVersion = parseInt(version, 10) || 1;
    try {
      if (step === "latex") {
        const created = await uploadCertificateTemplate({
          file, name: name.trim(), organizationId, isDefault: false, version: parsedVersion,
        });
        onCertCreated(created);
      } else {
        const created = await importTemplate(file, { name: name.trim(), version: parsedVersion });
        onDocCreated(created);
      }
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("failedToImport"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateSubmit() {
    if (!createName.trim()) return;
    setCreating(true);
    setCreateErr("");
    try {
      const created = await createTemplate({ name: createName.trim(), type: kind });
      router.push(`/templates/${created.id}`);
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : t("failedToCreate"));
      setCreating(false);
    }
  }

  const title =
    step === "choose" ? t("modal.title")
    : step === "latex" ? t("modal.importLatexTitle")
    : step === "json" ? t("modal.importJsonTitle")
    : t("modal.createTitle");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-og-surface rounded-xl border border-og-border shadow-xl w-full ${step === "choose" ? "max-w-2xl" : "max-w-lg"} p-6`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-og-text">{title}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-og-text rounded-sm transition-colors">
            <XIcon size={16} />
          </button>
        </div>

        {step === "choose" && (
          <div className={`grid grid-cols-1 gap-3 ${kind === "certificate" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {kind === "certificate" && (
              <button onClick={() => setStep("latex")}
                className="flex flex-col items-start gap-2 p-4 rounded-lg border border-og-border-md hover:border-og-accent hover:bg-og-surface-alt transition-colors text-left">
                <UploadCloudIcon size={20} className="text-og-accent" />
                <p className="text-sm font-semibold text-og-text">{t("modal.importLatexTitle")}</p>
                <p className="text-xs text-gray-400">{t("modal.importLatexDesc")}</p>
              </button>
            )}
            <button onClick={() => setStep("json")}
              className="flex flex-col items-start gap-2 p-4 rounded-lg border border-og-border-md hover:border-og-accent hover:bg-og-surface-alt transition-colors text-left">
              <DocumentIcon size={20} className="text-og-accent" />
              <p className="text-sm font-semibold text-og-text">{t("modal.importJsonTitle")}</p>
              <p className="text-xs text-gray-400">{t("modal.importJsonDesc")}</p>
            </button>
            <button onClick={() => setStep("create")}
              className="flex flex-col items-start gap-2 p-4 rounded-lg border border-og-border-md hover:border-og-accent hover:bg-og-surface-alt transition-colors text-left">
              <TemplatesIcon size={20} className="text-og-accent" />
              <p className="text-sm font-semibold text-og-text">{t("modal.createTitle")}</p>
              <p className="text-xs text-gray-400">{t("modal.createDesc")}</p>
            </button>
          </div>
        )}

        {(step === "latex" || step === "json") && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">
                {step === "latex" ? t("modal.latexFileLabel") : t("modal.jsonFileLabel")} <span className="text-red-400">*</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept={step === "latex" ? ".tex" : ".json"}
                onChange={handleFileChange}
                className={`${IB} ${IB_OK} py-1.5!`}
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-gray-400">{t("nameLabel")} <span className="text-red-400">*</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={`${IB} ${IB_OK} py-1.5!`} placeholder={t("namePlaceholder")} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">{t("modal.versionLabel")}</label>
                <NumberInput value={version} onChange={setVersion} min={1} step={1} className="w-16" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("modal.previewLabel")}</label>
              {fileName ? (
                <ImportPreviewPane text={previewText} />
              ) : (
                <div className="h-64 flex items-center justify-center rounded-lg border border-dashed border-og-border-md text-xs text-gray-400">
                  {t("modal.previewPlaceholder")}
                </div>
              )}
            </div>
            {err && <p className="text-xs text-red-500">{err}</p>}
            <div className="flex items-center justify-between pt-2">
              <button onClick={backToChoose}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
                {t("modal.back")}
              </button>
              <button onClick={handleImportSubmit} disabled={!fileName || !name.trim() || submitting}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
                <ImportIcon size={12} /> {submitting ? t("importing") : t("import")}
              </button>
            </div>
          </div>
        )}

        {step === "create" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("nameLabel")} <span className="text-red-400">*</span></label>
              <input value={createName} onChange={(e) => setCreateName(e.target.value)} className={`${IB} ${IB_OK} py-1.5!`}
                placeholder={t("namePlaceholder")} autoFocus />
            </div>
            {createErr && <p className="text-xs text-red-500">{createErr}</p>}
            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep("choose")}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
                {t("modal.back")}
              </button>
              <button onClick={handleCreateSubmit} disabled={!createName.trim() || creating}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
                <TemplatesIcon size={12} /> {creating ? t("creating") : t("createFromScratch")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateManagementSection({ kind, orgs }: { kind: TemplateKind; orgs: OrganizationListItem[] }) {
  const t = useTranslations("admin.certificates");
  const [scope, setScope] = useState<string>("global");
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [docTemplates, setDocTemplates] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Procedures have no legacy .tex system and no per-organization scoping — only the WYSIWYG
  // editor, and only a single global list (see apps/api/app/models/document_template.py).
  const organizationId = kind === "certificate" && scope !== "global" ? scope : undefined;

  useEffect(() => {
    setLoading(true);
    const certPromise = kind === "certificate"
      ? listCertificateTemplates(organizationId).then((all) =>
          all.filter((tpl) => (organizationId ? tpl.organization_id === organizationId : tpl.organization_id === null))
        )
      : Promise.resolve<CertificateTemplate[]>([]);
    Promise.all([certPromise, listTemplates({ type: kind })])
      .then(([cert, doc]) => {
        setTemplates(cert);
        setDocTemplates(doc);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : t("failedToLoad")))
      .finally(() => setLoading(false));
  }, [kind, organizationId, t]);

  const rows: TemplateRowData[] = [
    ...templates.map((tpl): TemplateRowData => ({ kind: "certificate", data: tpl })),
    ...docTemplates.map((tpl): TemplateRowData => ({ kind: "document", data: tpl })),
  ];
  const rowUpdatedAt = (row: TemplateRowData) => (row.kind === "certificate" ? (row.data.updated_at ?? "") : row.data.updated_at);
  // The base template always leads the table (never sorted away by recency) — see AGENTS.md
  // discussion in MODIFICATIONS.md: "listed on the first place of the table".
  rows.sort((a, b) => {
    if (a.data.is_builtin !== b.data.is_builtin) return a.data.is_builtin ? -1 : 1;
    return rowUpdatedAt(a) < rowUpdatedAt(b) ? 1 : -1;
  });

  function handleCertUpdated(updated: CertificateTemplate) {
    setTemplates((prev) => prev.map((x) => (x.id === updated.id ? updated : (updated.is_default ? { ...x, is_default: false } : x))));
    if (updated.is_default) {
      setDocTemplates((prev) => prev.map((x) => (x.is_default ? { ...x, is_default: false } : x)));
    }
  }

  function handleDocUpdated(updated: TemplateListItem | Template) {
    setDocTemplates((prev) =>
      prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : (updated.is_default ? { ...x, is_default: false } : x)))
    );
    if (updated.is_default) {
      setTemplates((prev) => prev.map((x) => ({ ...x, is_default: false })));
    }
  }

  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
      <div className="flex items-center justify-between px-4 py-3 border-b border-og-border gap-3">
        <p className="text-xs font-semibold text-og-text">{t(kind === "certificate" ? "title" : "titleProcedures")}</p>
        <div className="flex items-center gap-3">
          {kind === "certificate" && (
            <Select
              value={scope}
              onChange={setScope}
              options={[{ value: "global", label: t("global") }, ...orgs.map((org) => ({ value: org.id, label: org.name }))]}
              className="w-44"
            />
          )}
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors"
          >
            <PlusIcon size={12} /> {t("modal.newTemplate")}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 gap-2 text-xs text-gray-400">
          <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
          {t("loading")}
        </div>
      )}
      {!loading && err && <div className="px-4 py-4 text-sm text-red-500">{err}</div>}
      {!loading && !err && rows.length === 0 && (
        <p className="px-4 py-8 text-sm text-gray-400 text-center">
          {t("empty")}
        </p>
      )}
      {!loading && !err && rows.map((row) => (
        <TemplateRow
          key={`${row.kind}-${row.data.id}`}
          row={row}
          onCertUpdated={handleCertUpdated}
          onCertDeleted={(id) => setTemplates((prev) => prev.filter((x) => x.id !== id))}
          onDocUpdated={handleDocUpdated}
          onDocArchived={(id) => setDocTemplates((prev) => prev.filter((x) => x.id !== id))}
          onDocDuplicated={(created) => setDocTemplates((prev) => [created, ...prev])}
        />
      ))}

      {modalOpen && (
        <NewTemplateModal
          kind={kind}
          scope={scope}
          orgs={orgs}
          onClose={() => setModalOpen(false)}
          onCertCreated={(created) =>
            setTemplates((prev) => (created.is_default ? prev.map((x) => ({ ...x, is_default: false })) : prev).concat(created))
          }
          onDocCreated={(created) => setDocTemplates((prev) => [{ ...created, description: created.description ?? null }, ...prev])}
        />
      )}
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
  const t = useTranslations("admin.email");
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
      .catch((e: unknown) => setLoadErr(e instanceof Error ? e.message : t("failedToLoad")))
      .finally(() => setLoading(false));
  }, [t]);

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
      setSaveErr(e instanceof Error ? e.message : t("failedToSave"));
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
      setTestErr(e instanceof Error ? e.message : t("failedToSend"));
      setTestState("error");
    }
  }

  if (loading) {
    return (
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-10 flex items-center justify-center gap-2 text-xs text-gray-400">
        <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
        {t("loading")}
      </div>
    );
  }

  if (loadErr || !settings) {
    return (
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-6 text-sm text-red-500">
        {loadErr || t("failedToLoad")}
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
              <p className="text-xs font-semibold text-og-text">{t("smtpConfig")}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {t("smtpConfigDesc")}
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-og-text cursor-pointer">
            <ToggleSwitch checked={form.enabled} onChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
            {t("enabled")}
          </label>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-gray-400">{t("smtpHost")}</label>
              <input
                value={form.smtp_host}
                onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))}
                placeholder="smtp.example.com"
                className={`${IB} ${IB_OK}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("port")}</label>
              <NumberInput
                value={String(form.smtp_port)}
                onChange={(v) => setForm((f) => ({ ...f, smtp_port: Number(v) }))}
                className="w-24"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("smtpUsername")}</label>
              <input
                value={form.smtp_username}
                onChange={(e) => setForm((f) => ({ ...f, smtp_username: e.target.value }))}
                placeholder={t("optional")}
                className={`${IB} ${IB_OK}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("smtpPassword")}</label>
              <input
                type="password"
                value={form.smtp_password}
                onChange={(e) => setForm((f) => ({ ...f, smtp_password: e.target.value }))}
                placeholder={settings.has_smtp_password ? t("unchanged") : t("notSet")}
                className={`${IB} ${IB_OK}`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("fromAddress")}</label>
              <input
                type="email"
                value={form.from_email}
                onChange={(e) => setForm((f) => ({ ...f, from_email: e.target.value }))}
                placeholder="noreply@example.com"
                className={`${IB} ${IB_OK}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("fromName")}</label>
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
              {t("useTls")}
            </label>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("reminderLeadTime")}</label>
              <NumberInput
                min={1}
                max={90}
                value={String(form.calibration_reminder_days)}
                onChange={(v) => setForm((f) => ({ ...f, calibration_reminder_days: Number(v) }))}
                className="w-20"
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
              {saveState === "saving" ? t("saving") : saveState === "saved" ? t("saved") : t("save")}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="px-4 py-3 border-b border-og-border">
          <p className="text-xs font-semibold text-og-text">{t("sendTestEmail")}</p>
        </div>
        <div className="p-4 flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-gray-400">{t("recipient")}</label>
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
            {testState === "sending" ? t("sending") : testState === "sent" ? t("sent") : t("sendTestEmail")}
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
  const t = useTranslations("admin.danger");
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
      setExportErr(e instanceof Error ? e.message : t("failedToExport"));
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    if (!importFile) return;
    if (!window.confirm(t("importConfirm"))) {
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
      setImportErr(e instanceof Error ? e.message : t("failedToImport"));
    } finally {
      setImporting(false);
    }
  }

  async function handleReset() {
    if (resetConfirmText !== "RESET") return;
    if (!window.confirm(t("resetConfirm"))) {
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
      setResetErr(e instanceof Error ? e.message : t("failedToReset"));
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
            <p className="text-xs font-semibold text-og-text">{t("backup")}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {t("backupDesc")}
            </p>
          </div>
        </div>
        <div className="p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-og-text">{t("exportDatabase")}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {t("exportDatabaseDesc")}
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 border border-og-border-md rounded-lg text-xs font-medium text-og-text hover:bg-og-surface-alt transition-colors disabled:opacity-60"
          >
            {exporting ? t("exporting") : t("downloadBackup")}
          </button>
        </div>
        {exportErr && <p className="px-4 pb-4 text-xs text-red-500">{exportErr}</p>}
      </div>

      <div className="bg-og-surface rounded-xl border border-red-200 dark:border-red-900/40 shadow-xs">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-900/10">
          <WarningIcon size={14} className="text-red-600 dark:text-red-400" />
          <div>
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">{t("dangerousZone")}</p>
            <p className="text-[10px] text-red-600/80 dark:text-red-400/70 mt-0.5">
              {t("dangerousZoneDesc")}
            </p>
          </div>
        </div>
        <div className="p-4 space-y-5">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-og-text">{t("importDatabase")}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {t("importDatabaseDesc")}
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
              {importing ? t("restoring") : t("restoreBackup")}
            </button>
            {importOk && <p className="text-xs text-emerald-600 dark:text-emerald-400">{t("restored")}</p>}
            {importErr && <p className="text-xs text-red-500">{importErr}</p>}
          </div>

          <div className="border-t border-og-border pt-5 space-y-3">
            <div>
              <p className="text-xs font-medium text-og-text">{t("clearDatabase")}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {t("clearDatabaseDesc")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder={t("resetPlaceholder")}
                className={`${IB} border-red-300 dark:border-red-900/50 focus:border-red-500 focus:ring-red-500/20 max-w-xs`}
              />
              <button
                onClick={handleReset}
                disabled={resetConfirmText !== "RESET" || resetting}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {resetting ? t("clearing") : t("clearDatabaseButton")}
              </button>
            </div>
            {resetOk && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{t("cleared")}</p>
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

type Section = "dashboard" | "users" | "reportTemplates" | "procedureTemplates" | "email";

const TEMPLATE_SECTIONS: Section[] = ["reportTemplates", "procedureTemplates"];

export default function AdminPage() {
  const t = useTranslations("admin");
  const { user } = useAuth();
  const router = useRouter();
  const [section, setSection] = useState<Section>("dashboard");
  const [templatesOpen, setTemplatesOpen] = useState(() => TEMPLATE_SECTIONS.includes(section));

  const nav: { id: Section; label: string }[] = [
    { id: "dashboard", label: t("nav.dashboard") },
    { id: "users",     label: t("nav.users") },
    { id: "email",     label: t("nav.email") },
  ];

  // Org list used by the Calibration Reports panel's scope selector —
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
        <h1 className="text-xl font-bold text-og-text">{t("title")}</h1>
        <p className="text-sm text-gray-400 mt-1">{t("subtitle")}</p>
      </div>

      <div className="flex gap-5 items-start">
        {/* Sidebar nav */}
        <div className="w-52 shrink-0 bg-og-surface rounded-xl border border-og-border shadow-xs sticky top-4">
          <div className="px-3 py-3 border-b border-og-border">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{t("nav.administration")}</p>
          </div>
          <div className="p-2">
            {nav.slice(0, 2).map((item) => (
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

            <button
              type="button"
              onClick={() => setTemplatesOpen((v) => !v)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                TEMPLATE_SECTIONS.includes(section)
                  ? "text-og-text"
                  : "text-gray-400 hover:bg-og-border/50 hover:text-og-text"
              }`}
            >
              <span>{t("nav.templates")}</span>
              {templatesOpen ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </button>
            {templatesOpen && (
              <div className="ml-3 pl-2 border-l border-og-border space-y-0.5">
                {(["reportTemplates", "procedureTemplates"] as Section[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSection(id)}
                    className={`w-full flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors text-left ${
                      section === id
                        ? "bg-og-border text-og-text"
                        : "text-gray-400 hover:bg-og-border/50 hover:text-og-text"
                    }`}
                  >
                    {t(id === "reportTemplates" ? "nav.reportTemplates" : "nav.procedureTemplates")}
                  </button>
                ))}
              </div>
            )}

            {nav.slice(2).map((item) => (
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
          {section === "reportTemplates" && <TemplateManagementSection kind="certificate" orgs={orgs} />}
          {section === "procedureTemplates" && <TemplateManagementSection kind="procedure" orgs={orgs} />}
          {section === "email" && <EmailSettingsSection />}
        </div>
      </div>
    </div>
  );
}
