"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import { translateDynamic } from "@/lib/translate-dynamic";
import {
  BuildingIcon,
  CheckIcon,
  ChevronLeftIcon,
  DownloadIcon,
  EditIcon,
  GlobeIcon,
  LockIcon,
  MailIcon,
  PhoneIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import { ImageUploadField } from "@/components/image-upload-field";
import { ConfirmModal } from "@/components/confirm-modal";
import { Avatar } from "@/components/avatar";
import { UserSummary } from "@/components/user-summary";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Tooltip } from "@/components/tooltip";
import { CERTIFICATE_DOCS_LINKS } from "@/lib/docs-links";
import {
  addMembers,
  approveJoinRequest,
  deactivateOrganization,
  restoreOrganization,
  deleteOrgLogo,
  getOrganization,
  getSigningCertificate,
  leaveOrganization,
  listEligibleMembers,
  listJoinRequests,
  listOrgMembers,
  rejectJoinRequest,
  removeMember,
  requestToJoin,
  updateMemberRole,
  updateOrganization,
  uploadOrgLogo,
} from "@/services/organization.service";
import { listLocations } from "@/services/asset.service";
import type {
  EligibleUser,
  Organization,
  OrganizationJoinRequest,
  OrganizationMember,
  OrgRole,
  SigningCertificate,
} from "@/types/organization";
import type { LocationOption } from "@/types/asset";

const IB = "w-full px-3 py-2 rounded-lg border text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 transition-colors placeholder:text-gray-400";
const IB_OK = "border-og-border-md focus:border-og-accent focus:ring-og-accent/20";

function InfoRow({ label, icon, value }: { label: string; icon?: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-og-border last:border-0">
      <span className="w-32 shrink-0 flex items-center gap-1.5 text-xs text-gray-400 pt-0.5">
        {icon}
        {label}
      </span>
      <span className="flex-1 text-sm text-og-text">{value}</span>
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function websiteHref(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

interface EditForm {
  name: string;
  full_name: string;
  description: string;
  website: string;
  email: string;
  phone: string;
  location_id: string;
  private: boolean;
}

function toForm(org: Organization): EditForm {
  return {
    name: org.name,
    full_name: org.full_name ?? "",
    description: org.description ?? "",
    website: org.website ?? "",
    email: org.email ?? "",
    phone: org.phone ?? "",
    location_id: org.location_id ?? "",
    private: org.private,
  };
}

// ---------------------------------------------------------------------------
// Add member modal
// ---------------------------------------------------------------------------

function AddMemberModal({ orgId, onClose, onAdded }: { orgId: string; onClose: () => void; onAdded: () => void }) {
  const t = useTranslations("organizations.detail.addMemberModal");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<EligibleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    const handle = setTimeout(() => {
      listEligibleMembers(orgId, query || undefined)
        .then(setUsers)
        .catch(() => setUsers([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [orgId, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setSaving(true);
    setErr("");
    try {
      await addMembers(orgId, Array.from(selected));
      onAdded();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xl w-full max-w-md flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-og-border">
          <h2 className="text-sm font-semibold text-og-text">{t("title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-sm hover:bg-og-surface-alt text-gray-400 hover:text-og-text transition-colors"
          >
            <XIcon size={15} />
          </button>
        </div>
        <div className="p-4 flex-1 overflow-hidden flex flex-col gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className={`${IB} ${IB_OK}`}
            autoFocus
          />
          <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1">
            {loading && <p className="text-xs text-gray-400 text-center py-6">{t("loading")}</p>}
            {!loading && users.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">{t("empty")}</p>
            )}
            {!loading && users.map((u) => (
              <div
                key={u.id}
                role="button"
                tabIndex={0}
                onClick={() => toggle(u.id)}
                onKeyDown={(e) => { if (e.key === "Enter") toggle(u.id); }}
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-og-surface-alt cursor-pointer"
              >
                <ToggleSwitch checked={selected.has(u.id)} onChange={() => toggle(u.id)} showLabel={false} />
                <Avatar name={u.name} pictureUrl={u.profile_picture_url} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-og-text truncate">{u.name}</p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                </div>
              </div>
            ))}
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-og-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors text-og-text"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={selected.size === 0 || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? t("adding") : (selected.size ? t("addWithCount", { count: selected.size }) : t("add"))}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrganizationDetailClient() {
  const t = useTranslations("organizations.detail");
  const tOrgRole = useTranslations("tokens.orgRole");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const isSuperAdmin = user.role === "superadmin";

  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [members, setMembers] = useState<OrganizationMember[] | null>(null);
  const [requests, setRequests] = useState<OrganizationJoinRequest[] | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [signingCert, setSigningCert] = useState<SigningCertificate | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getOrganization(id)
      .then((o) => {
        setOrg(o);
        if (o.is_member) {
          listOrgMembers(id).then(setMembers).catch(() => setMembers([]));
        }
        if (o.can_manage) {
          listJoinRequests(id).then(setRequests).catch(() => setRequests([]));
          listLocations().then(setLocations).catch(() => {});
        }
        if (!o.private || o.is_member) {
          getSigningCertificate(id).then(setSigningCert).catch(() => setSigningCert(null));
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("failedToLoad")))
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  function startEdit() {
    if (!org) return;
    setForm(toForm(org));
    setActionError("");
    setEditing(true);
  }

  // A join-request notification links here with ?edit=1 so an admin lands
  // straight in edit mode, where the new requester shows up as "Pending".
  useEffect(() => {
    if (!org || !org.can_manage) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("edit") === "1") {
      startEdit();
      router.replace(`/organizations/${id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id, org?.can_manage]);

  async function saveEdit() {
    if (!form) return;
    setSaving(true);
    setActionError("");
    try {
      const updated = await updateOrganization(id, {
        name: form.name.trim(),
        full_name: form.full_name.trim() || undefined,
        description: form.description.trim() || undefined,
        website: form.website.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        location_id: form.location_id || null,
        private: form.private,
      });
      setOrg(updated);
      setEditing(false);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t("failedToSave"));
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoChange(file: File) {
    if (!org) return;
    setLogoUploading(true);
    try {
      const updated = await uploadOrgLogo(org.id, file);
      setOrg(updated);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : t("failedToUploadLogo"));
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleLogoRemove() {
    if (!org) return;
    setLogoUploading(true);
    try {
      const updated = await deleteOrgLogo(org.id);
      setOrg(updated);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : t("failedToRemoveLogo"));
    } finally {
      setLogoUploading(false);
    }
  }

  function handleDownloadCertificate() {
    if (!signingCert || !org) return;
    const blob = new Blob([signingCert.certificate_pem], { type: "application/x-pem-file" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${org.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-signing-certificate.pem`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRoleChange(userId: string, role: OrgRole) {
    try {
      const updated = await updateMemberRole(id, userId, role);
      setMembers((prev) => prev?.map((m) => (m.user_id === userId ? updated : m)) ?? null);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t("failedToChangeRole"));
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm(t("removeMemberConfirm"))) return;
    try {
      await removeMember(id, userId);
      setMembers((prev) => prev?.filter((m) => m.user_id !== userId) ?? null);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t("failedToRemoveMember"));
    }
  }

  async function handleApprove(requestId: string) {
    try {
      await approveJoinRequest(id, requestId);
      setRequests((prev) => prev?.filter((r) => r.id !== requestId) ?? null);
      if (org?.is_member) listOrgMembers(id).then(setMembers).catch(() => {});
      setOrg((prev) => prev && { ...prev, member_count: (prev.member_count ?? 0) + 1 });
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t("failedToApprove"));
    }
  }

  async function handleReject(requestId: string) {
    try {
      await rejectJoinRequest(id, requestId);
      setRequests((prev) => prev?.filter((r) => r.id !== requestId) ?? null);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t("failedToReject"));
    }
  }

  const showJoinLeave = !!org && !isSuperAdmin;

  return (
    <div className="p-6 space-y-5">
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-og-text transition-colors"
      >
        <ChevronLeftIcon size={13} /> {t("back")}
      </button>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <span className="inline-block w-5 h-5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin mr-3" />
          {t("loading")}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && org && (
        <>
          {/* Header */}
          <div className="flex items-center gap-3">
            <ImageUploadField
              imageUrl={org.logo_url}
              alt={org.name}
              editable={editing && org.can_manage}
              uploading={logoUploading}
              onUpload={handleLogoChange}
              onRemove={handleLogoRemove}
              size={editing ? 80 : 48}
              previewTitle={org.name}
            >
              {org.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={org.logo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-og-surface-alt border border-og-border flex items-center justify-center">
                  <BuildingIcon size={22} className="text-gray-400" />
                </div>
              )}
            </ImageUploadField>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-og-text truncate">{org.name}</h1>
                {org.private && (
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-400">
                    <LockIcon size={12} /> {t("private")}
                  </span>
                )}
              </div>
              {org.full_name && <p className="text-sm text-gray-400">{org.full_name}</p>}
            </div>
            {!editing && (
              <div className="flex items-center gap-2">
                {org.can_manage && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors"
                  >
                    <EditIcon size={12} /> {t("edit")}
                  </button>
                )}
                {showJoinLeave && (
                  org.is_member ? (
                    <button
                      type="button"
                      onClick={() => setLeaveModalOpen(true)}
                      className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      {t("leave")}
                    </button>
                  ) : org.has_pending_join_request ? (
                    <button
                      type="button"
                      disabled
                      className="px-3 py-1.5 bg-og-surface-alt text-gray-400 text-xs font-medium rounded-lg border border-og-border-md cursor-default"
                    >
                      {t("pending")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setJoinModalOpen(true)}
                      className="px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      {t("requestToJoin")}
                    </button>
                  )
                )}
              </div>
            )}
            {editing && (
              <div className="flex items-center gap-2">
                <button onClick={() => setEditing(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
                  <XIcon size={12} /> {t("cancel")}
                </button>
                <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
                  <CheckIcon size={12} /> {saving ? t("saving") : t("save")}
                </button>
              </div>
            )}
          </div>

          {actionError && <p className="text-xs text-red-500">{actionError}</p>}

          {/* Private + non-member gate */}
          {org.private && !org.is_member ? (
            <div className="bg-og-surface rounded-xl border border-og-border shadow-xs px-5 py-10 flex flex-col items-center gap-3 text-center">
              <LockIcon size={24} className="text-gray-300" />
              <p className="text-sm text-gray-400">{t("privateGateMessage")}</p>
            </div>
          ) : (
            <>
              {org.can_manage && editing && (
                <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">{t("name")} <span className="text-red-400">*</span></label>
                      <input value={form?.name ?? ""} onChange={(e) => setForm((f) => f && { ...f, name: e.target.value })} className={`${IB} ${IB_OK}`} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">{t("fullName")}</label>
                      <input value={form?.full_name ?? ""} onChange={(e) => setForm((f) => f && { ...f, full_name: e.target.value })} className={`${IB} ${IB_OK}`} />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs text-gray-400">{t("description")}</label>
                      <textarea value={form?.description ?? ""} onChange={(e) => setForm((f) => f && { ...f, description: e.target.value })} className={`${IB} ${IB_OK}`} rows={2} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">{t("website")}</label>
                      <input value={form?.website ?? ""} onChange={(e) => setForm((f) => f && { ...f, website: e.target.value })} placeholder="https://…" className={`${IB} ${IB_OK}`} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">{t("location")}</label>
                      <select value={form?.location_id ?? ""} onChange={(e) => setForm((f) => f && { ...f, location_id: e.target.value })} className={`${IB} ${IB_OK}`}>
                        <option value="">{t("none")}</option>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.path}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">{t("email")}</label>
                      <input value={form?.email ?? ""} onChange={(e) => setForm((f) => f && { ...f, email: e.target.value })} className={`${IB} ${IB_OK}`} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">{t("phone")}</label>
                      <input value={form?.phone ?? ""} onChange={(e) => setForm((f) => f && { ...f, phone: e.target.value })} className={`${IB} ${IB_OK}`} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <ToggleSwitch checked={form?.private ?? false} onChange={(v) => setForm((f) => f && { ...f, private: v })} />
                    {t("privateToggle")}
                  </label>
                </div>
              )}

              {!editing && (
                <div className="bg-og-surface rounded-xl border border-og-border shadow-xs px-5 py-2">
                  {org.description && <InfoRow label={t("description")} value={org.description} />}
                  {org.website && (
                    <InfoRow label={t("website")} icon={<GlobeIcon size={12} />} value={
                      <a href={websiteHref(org.website)} target="_blank" rel="noopener noreferrer" className="text-og-accent hover:underline">{org.website}</a>
                    } />
                  )}
                  {org.location_name && <InfoRow label={t("location")} value={org.location_name} />}
                  {org.email && <InfoRow label={t("email")} icon={<MailIcon size={12} />} value={<a href={`mailto:${org.email}`} className="text-og-accent hover:underline">{org.email}</a>} />}
                  {org.phone && <InfoRow label={t("phone")} icon={<PhoneIcon size={12} />} value={org.phone} />}
                  {org.asset_count !== null && (
                    <InfoRow label={t("assets")} value={
                      <Link href={`/assets?organization_id=${org.id}&organization_name=${encodeURIComponent(org.name)}`} className="text-og-accent hover:underline">
                        {t("assetCount", { count: org.asset_count })}
                      </Link>
                    } />
                  )}
                  {org.member_count !== null && <InfoRow label={t("members")} value={t("memberCount", { count: org.member_count })} />}
                  <InfoRow label={t("created")} value={fmtDate(org.created_at)} />
                </div>
              )}

              {/* Members */}
              {members && (
                <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-og-border">
                    <p className="text-xs font-semibold text-og-text">{t("members")}</p>
                    {org.can_manage && editing && (
                      <button
                        type="button"
                        onClick={() => setAddMemberOpen(true)}
                        className="flex items-center gap-1 text-[11px] font-medium text-og-accent hover:underline"
                      >
                        <PlusIcon size={11} /> {t("addMember")}
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-og-border">
                    {members.map((m) => (
                      <div key={m.user_id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                        <UserSummary userId={m.user_id} name={m.name} email={m.email} pictureUrl={m.profile_picture_url} className="flex-1" />
                        {org.can_manage && editing ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <select
                              value={m.role}
                              onChange={(e) => handleRoleChange(m.user_id, e.target.value as OrgRole)}
                              className="px-2 py-1 text-xs rounded-lg border border-og-border-md bg-og-surface text-og-text"
                            >
                              <option value="member">{translateDynamic(tOrgRole, "member")}</option>
                              <option value="admin">{translateDynamic(tOrgRole, "admin")}</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m.user_id)}
                              className="p-1 text-gray-400 hover:text-red-500 rounded-sm transition-colors"
                              title={t("removeMember")}
                            >
                              <TrashIcon size={13} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-gray-400 shrink-0">{translateDynamic(tOrgRole, m.role)}</span>
                        )}
                      </div>
                    ))}
                    {requests && requests.map((r) => (
                      <div key={r.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                        <UserSummary userId={r.user_id} name={r.user_name} email={r.user_email} pictureUrl={r.user_profile_picture_url} className="flex-1" />
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 text-[10px] font-medium text-gray-400 bg-og-surface-alt border border-og-border-md rounded-full">
                            {t("requestPending")}
                          </span>
                          <button onClick={() => handleApprove(r.id)} className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-og-action hover:bg-og-action-dark text-white rounded-sm transition-colors">
                            <CheckIcon size={10} /> {t("approve")}
                          </button>
                          <button onClick={() => handleReject(r.id)} className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-sm hover:bg-og-surface-alt transition-colors">
                            <XIcon size={10} /> {t("reject")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Digital signature */}
              {(!org.private || org.is_member) && (
                <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-og-border">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheckIcon size={13} className="text-og-accent" />
                      <p className="text-xs font-semibold text-og-text">{t("certificateSigning")}</p>
                      <Tooltip
                        content={t("certificateSigningTooltip")}
                        docsHref={CERTIFICATE_DOCS_LINKS.signing_certificate}
                      >
                        <span className="text-gray-300 cursor-help text-[11px]">ⓘ</span>
                      </Tooltip>
                    </div>
                    {signingCert && (
                      <button
                        type="button"
                        onClick={handleDownloadCertificate}
                        className="flex items-center gap-1.5 text-[11px] font-medium text-og-accent hover:underline"
                      >
                        <DownloadIcon size={11} /> {t("downloadCertificate")}
                      </button>
                    )}
                  </div>
                  <div className="px-5 py-2">
                    {signingCert ? (
                      <>
                        <InfoRow label={t("algorithm")} value={signingCert.algorithm} />
                        <InfoRow label={t("fingerprint")} value={<span className="font-mono text-xs break-all">{signingCert.fingerprint_sha256}</span>} />
                        <InfoRow label={t("valid")} value={`${fmtDate(signingCert.not_valid_before)} – ${fmtDate(signingCert.not_valid_after)}`} />
                      </>
                    ) : (
                      <p className="text-xs text-gray-400 py-3">
                        {t("noCertificate")}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Danger zone */}
              {editing && org.can_manage && (
                <div className="bg-og-surface rounded-xl border border-red-200 dark:border-red-900/50 shadow-xs">
                  <div className="px-4 py-3 border-b border-red-100 dark:border-red-900/40">
                    <p className="text-xs font-semibold text-red-600 dark:text-red-400">{t("dangerZone")}</p>
                  </div>
                  <div className="p-4 flex items-center justify-between gap-3">
                    {org.is_active ? (
                      <>
                        <p className="text-xs text-gray-400">
                          {t("deactivateDesc")}
                        </p>
                        <button
                          type="button"
                          onClick={() => setDeleteModalOpen(true)}
                          className="shrink-0 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          {t("deleteOrganization")}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-gray-400">
                          {t("deactivatedDesc")}
                        </p>
                        <button
                          type="button"
                          disabled={restoring}
                          onClick={async () => {
                            setRestoring(true);
                            try {
                              setOrg(await restoreOrganization(org.id));
                            } catch (e: unknown) {
                              setActionError(e instanceof Error ? e.message : t("failedToRestore"));
                            } finally {
                              setRestoring(false);
                            }
                          }}
                          className="shrink-0 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
                        >
                          {restoring ? t("restoring") : t("restoreOrganization")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {addMemberOpen && (
        <AddMemberModal
          orgId={id}
          onClose={() => setAddMemberOpen(false)}
          onAdded={() => listOrgMembers(id).then(setMembers).catch(() => {})}
        />
      )}

      {deleteModalOpen && org && (
        <ConfirmModal
          title={t("deleteModal.title")}
          message={t("deleteModal.message", { name: org.name })}
          confirmLabel={t("deleteModal.confirm")}
          danger
          onConfirm={async () => {
            await deactivateOrganization(org.id);
            router.push("/organizations");
          }}
          onClose={() => setDeleteModalOpen(false)}
        />
      )}

      {joinModalOpen && org && (
        <ConfirmModal
          title={t("joinModal.title")}
          message={t("joinModal.message", { name: org.name })}
          confirmLabel={t("joinModal.confirm")}
          onConfirm={async () => {
            await requestToJoin(id);
            await load();
          }}
          onClose={() => setJoinModalOpen(false)}
        />
      )}

      {leaveModalOpen && org && (
        org.is_last_admin ? (
          (org.member_count ?? 0) > 1 ? (
            <ConfirmModal
              title={t("leaveOnlyAdmin.title")}
              message={t("leaveOnlyAdmin.message")}
              onClose={() => setLeaveModalOpen(false)}
            />
          ) : (
            <ConfirmModal
              title={t("leaveOnlyMember.title")}
              message={t("leaveOnlyMember.message")}
              confirmLabel={t("leaveOnlyMember.confirm")}
              onConfirm={() => { startEdit(); }}
              onClose={() => setLeaveModalOpen(false)}
            />
          )
        ) : (
          <ConfirmModal
            title={t("leaveModal.title")}
            message={t("leaveModal.message", { name: org.name })}
            confirmLabel={t("leaveModal.confirm")}
            danger
            onConfirm={async () => {
              await leaveOrganization(id);
              router.push("/organizations");
            }}
            onClose={() => setLeaveModalOpen(false)}
          />
        )
      )}
    </div>
  );
}
