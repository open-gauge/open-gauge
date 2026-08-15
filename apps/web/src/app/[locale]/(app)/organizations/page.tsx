"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import { translateDynamic } from "@/lib/translate-dynamic";
import {
  BuildingIcon,
  CheckIcon,
  DownloadIcon,
  EditIcon,
  GlobeIcon,
  LockIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
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
import { Select } from "@/components/select";
import { CERTIFICATE_DOCS_LINKS } from "@/lib/docs-links";
import {
  addMembers,
  approveJoinRequest,
  createOrganization,
  deactivateOrganization,
  restoreOrganization,
  deleteOrgLogo,
  getOrganization,
  getSigningCertificate,
  leaveOrganization,
  listEligibleMembers,
  listJoinRequests,
  listOrganizations,
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
  OrganizationListItem,
  OrganizationMember,
  OrgCategory,
  OrgRole,
  OrgType,
  SigningCertificate,
} from "@/types/organization";
import type { LocationOption } from "@/types/asset";

const IB = "w-full px-3 py-2 rounded-lg border text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 transition-colors placeholder:text-gray-400";
const IB_OK = "border-og-border-md focus:border-og-accent focus:ring-og-accent/20";

type SidebarFilter = "all" | "internal" | "provider" | "customer";

// ---------------------------------------------------------------------------
// Shared small components
// ---------------------------------------------------------------------------

function SegmentedToggle<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
            value === opt.value
              ? "border-og-accent bg-og-accent/10 text-og-accent"
              : "border-og-border-md text-gray-400 hover:bg-og-surface-alt"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
        active
          ? "border-og-accent bg-og-accent/10 text-og-accent"
          : "border-og-border-md text-gray-400 hover:bg-og-surface-alt"
      }`}
    >
      {label}
    </button>
  );
}

function InfoCard({ label, icon, value }: { label: string; icon?: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="bg-og-surface-alt border border-og-border rounded-lg px-4 py-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
        {icon}
        {label}
      </p>
      <p className="text-sm text-og-text break-words">{value}</p>
    </div>
  );
}

function StatCard({ label, value, sublabel, href }: {
  label: string;
  value: number;
  sublabel?: string;
  href?: string;
}) {
  const classes = `block bg-og-surface rounded-xl border border-og-border shadow-xs p-4 transition-colors ${href ? "hover:border-og-accent/40" : ""}`;
  const content = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${href ? "text-og-accent" : "text-og-text"}`}>{value}</p>
      {sublabel && <p className="text-xs text-gray-400 mt-1">{sublabel}</p>}
    </>
  );
  return href ? <Link href={href} className={classes}>{content}</Link> : <div className={classes}>{content}</div>;
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
  org_category: OrgCategory;
  org_type: OrgType;
  contact_email: string;
  contact_phone: string;
  vat_number: string;
  address_street: string;
  address_city: string;
  address_state: string;
  address_postal_code: string;
  address_country: string;
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
    org_category: org.org_category,
    org_type: org.org_type ?? "provider",
    contact_email: org.contact_email ?? "",
    contact_phone: org.contact_phone ?? "",
    vat_number: org.vat_number ?? "",
    address_street: org.address_street ?? "",
    address_city: org.address_city ?? "",
    address_state: org.address_state ?? "",
    address_postal_code: org.address_postal_code ?? "",
    address_country: org.address_country ?? "",
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
                <ToggleSwitch checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
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
// New organization form
// ---------------------------------------------------------------------------

function NewOrgForm({ isAdmin, onCancel, onCreated }: {
  isAdmin: boolean;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("organizations.newOrgForm");
  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [category, setCategory] = useState<OrgCategory>("internal");
  const [orgType, setOrgType] = useState<OrgType>("provider");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    setErr("");
    try {
      const isExternal = isAdmin && category === "external";
      const org = await createOrganization({
        name: name.trim(),
        full_name: fullName.trim() || undefined,
        private: isPrivate,
        org_category: isExternal ? "external" : "internal",
        ...(isExternal && {
          org_type: orgType,
          contact_email: contactEmail.trim() || undefined,
          contact_phone: contactPhone.trim() || undefined,
          vat_number: vatNumber.trim() || undefined,
          address_street: addressStreet.trim() || undefined,
          address_city: addressCity.trim() || undefined,
          address_state: addressState.trim() || undefined,
          address_postal_code: addressPostalCode.trim() || undefined,
          address_country: addressCountry.trim() || undefined,
        }),
      });
      onCreated(org.id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("createFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-sm p-4 space-y-3">
      <p className="text-sm font-semibold text-og-text">{t("title")}</p>
      {isAdmin && (
        <div className="space-y-1">
          <label className="text-xs text-gray-400">{t("category")}</label>
          <SegmentedToggle
            value={category}
            onChange={setCategory}
            options={[
              { value: "internal", label: t("categoryInternal") },
              { value: "external", label: t("categoryExternal") },
            ]}
          />
        </div>
      )}
      <div className="space-y-1">
        <label className="text-xs text-gray-400">{t("name")} <span className="text-red-400">*</span></label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} className={`${IB} ${IB_OK}`} autoFocus />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-gray-400">{t("fullName")}</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("optional")} className={`${IB} ${IB_OK}`} />
      </div>
      {isAdmin && category === "external" && (
        <>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">{t("orgType")}</label>
            <SegmentedToggle
              value={orgType}
              onChange={setOrgType}
              options={[
                { value: "provider", label: t("orgTypeProvider") },
                { value: "customer", label: t("orgTypeCustomer") },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("contactEmail")}</label>
              <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={`${IB} ${IB_OK}`} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("contactPhone")}</label>
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={`${IB} ${IB_OK}`} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">{t("vatNumber")}</label>
            <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} className={`${IB} ${IB_OK}`} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-gray-400">{t("addressStreet")}</label>
              <input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} className={`${IB} ${IB_OK}`} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("addressCity")}</label>
              <input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} className={`${IB} ${IB_OK}`} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("addressState")}</label>
              <input value={addressState} onChange={(e) => setAddressState(e.target.value)} className={`${IB} ${IB_OK}`} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("addressPostalCode")}</label>
              <input value={addressPostalCode} onChange={(e) => setAddressPostalCode(e.target.value)} className={`${IB} ${IB_OK}`} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("addressCountry")}</label>
              <input value={addressCountry} onChange={(e) => setAddressCountry(e.target.value)} className={`${IB} ${IB_OK}`} />
            </div>
          </div>
        </>
      )}
      <label className="flex items-center gap-2 text-xs text-gray-400">
        <ToggleSwitch checked={isPrivate} onChange={setIsPrivate} />
        {t("private")}
      </label>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
          <XIcon size={12} /> {t("cancel")}
        </button>
        <button onClick={handleCreate} disabled={!name.trim() || saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
          <CheckIcon size={12} /> {saving ? t("creating") : t("create")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar join/leave button
// ---------------------------------------------------------------------------

function JoinLeaveButton({ org, onJoinClick, onLeaveClick }: {
  org: OrganizationListItem;
  onJoinClick: () => void;
  onLeaveClick: () => void;
}) {
  const t = useTranslations("organizations.joinLeave");
  if (org.is_member) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onLeaveClick(); }}
        className="shrink-0 px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-[10px] font-medium rounded-lg transition-colors"
      >
        {t("leave")}
      </button>
    );
  }
  if (org.has_pending_join_request) {
    return (
      <button
        type="button"
        disabled
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 px-2 py-1 bg-og-surface-alt text-gray-400 text-[10px] font-medium rounded-lg border border-og-border-md cursor-default"
      >
        {t("pending")}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onJoinClick(); }}
      className="shrink-0 px-2 py-1 bg-og-action hover:bg-og-action-dark text-white text-[10px] font-medium rounded-lg transition-colors"
    >
      {t("requestToJoin")}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function OrganizationDetail({ orgId, autoEdit, onAutoEditConsumed, onChanged, onRemoved }: {
  orgId: string;
  autoEdit: boolean;
  onAutoEditConsumed: () => void;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const t = useTranslations("organizations.detail");
  const tOrgRole = useTranslations("tokens.orgRole");
  const tOrgCategory = useTranslations("tokens.orgCategory");
  const tOrgType = useTranslations("tokens.orgType");
  const { user } = useAuth();
  const isSuperAdmin = user.role === "superadmin";
  const isGlobalAdmin = user.role === "admin" || user.role === "superadmin";

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
    getOrganization(orgId)
      .then((o) => {
        setOrg(o);
        if (o.is_member) {
          listOrgMembers(orgId).then(setMembers).catch(() => setMembers([]));
        }
        if (o.can_manage) {
          listJoinRequests(orgId).then(setRequests).catch(() => setRequests([]));
          listLocations().then(setLocations).catch(() => {});
        }
        if (!o.private || o.is_member) {
          getSigningCertificate(orgId).then(setSigningCert).catch(() => setSigningCert(null));
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("failedToLoad")))
      .finally(() => setLoading(false));
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!org || !org.can_manage || !autoEdit) return;
    startEdit();
    onAutoEditConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id, org?.can_manage, autoEdit]);

  async function saveEdit() {
    if (!form) return;
    setSaving(true);
    setActionError("");
    try {
      const updated = await updateOrganization(orgId, {
        name: form.name.trim(),
        full_name: form.full_name.trim() || undefined,
        description: form.description.trim() || undefined,
        website: form.website.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        location_id: form.location_id || null,
        private: form.private,
        ...(isGlobalAdmin && {
          org_category: form.org_category,
          org_type: form.org_category === "external" ? form.org_type : undefined,
          contact_email: form.contact_email.trim() || undefined,
          contact_phone: form.contact_phone.trim() || undefined,
          vat_number: form.vat_number.trim() || undefined,
          address_street: form.address_street.trim() || undefined,
          address_city: form.address_city.trim() || undefined,
          address_state: form.address_state.trim() || undefined,
          address_postal_code: form.address_postal_code.trim() || undefined,
          address_country: form.address_country.trim() || undefined,
        }),
      });
      setOrg(updated);
      setEditing(false);
      onChanged();
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
      onChanged();
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
      onChanged();
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
      const updated = await updateMemberRole(orgId, userId, role);
      setMembers((prev) => prev?.map((m) => (m.user_id === userId ? updated : m)) ?? null);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t("failedToChangeRole"));
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm(t("removeMemberConfirm"))) return;
    try {
      await removeMember(orgId, userId);
      setMembers((prev) => prev?.filter((m) => m.user_id !== userId) ?? null);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t("failedToRemoveMember"));
    }
  }

  async function handleApprove(requestId: string) {
    try {
      await approveJoinRequest(orgId, requestId);
      setRequests((prev) => prev?.filter((r) => r.id !== requestId) ?? null);
      if (org?.is_member) listOrgMembers(orgId).then(setMembers).catch(() => {});
      setOrg((prev) => prev && { ...prev, member_count: (prev.member_count ?? 0) + 1 });
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t("failedToApprove"));
    }
  }

  async function handleReject(requestId: string) {
    try {
      await rejectJoinRequest(orgId, requestId);
      setRequests((prev) => prev?.filter((r) => r.id !== requestId) ?? null);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : t("failedToReject"));
    }
  }

  const canManageOrg = !!org && (org.org_category === "external" ? isGlobalAdmin : org.can_manage);
  const showJoinLeave = !!org && !isSuperAdmin && org.org_category === "internal";

  const infoCards = useMemo(() => {
    if (!org) return [];
    const cards: { key: string; label: string; icon?: React.ReactNode; value: React.ReactNode }[] = [];
    if (org.location_name) cards.push({ key: "location", label: t("location"), icon: <MapPinIcon size={11} />, value: org.location_name });
    if (org.email) cards.push({ key: "email", label: t("email"), icon: <MailIcon size={11} />, value: <a href={`mailto:${org.email}`} className="text-og-accent hover:underline">{org.email}</a> });
    if (org.phone) cards.push({ key: "phone", label: t("phone"), icon: <PhoneIcon size={11} />, value: org.phone });
    if (org.website) cards.push({ key: "website", label: t("website"), icon: <GlobeIcon size={11} />, value: <a href={websiteHref(org.website)} target="_blank" rel="noopener noreferrer" className="text-og-accent hover:underline">{org.website}</a> });
    if (org.contact_email) cards.push({ key: "contact_email", label: t("contactEmail"), icon: <MailIcon size={11} />, value: <a href={`mailto:${org.contact_email}`} className="text-og-accent hover:underline">{org.contact_email}</a> });
    if (org.contact_phone) cards.push({ key: "contact_phone", label: t("contactPhone"), icon: <PhoneIcon size={11} />, value: org.contact_phone });
    if (org.vat_number) cards.push({ key: "vat_number", label: t("vatNumber"), value: org.vat_number });
    const address = [org.address_street, org.address_city, org.address_state, org.address_postal_code, org.address_country].filter(Boolean).join(", ");
    if (address) cards.push({ key: "address", label: t("address"), icon: <MapPinIcon size={11} />, value: address });
    cards.push({ key: "created", label: t("created"), value: fmtDate(org.created_at) });
    return cards;
  }, [org, t]);

  if (loading) {
    return (
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs flex items-center justify-center py-24">
        <span className="inline-block w-5 h-5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin mr-3" />
        <span className="text-sm text-gray-400">{t("loading")}</span>
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 px-4 py-3 text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-5">
        <div className="flex items-start gap-3">
          <ImageUploadField
            imageUrl={org.logo_url}
            alt={org.name}
            editable={editing && canManageOrg && org.org_category === "internal"}
            uploading={logoUploading}
            onUpload={handleLogoChange}
            onRemove={handleLogoRemove}
            size={editing ? 80 : 56}
            previewTitle={org.name}
          >
            {org.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-og-surface-alt border border-og-border flex items-center justify-center">
                <BuildingIcon size={24} className="text-gray-400" />
              </div>
            )}
          </ImageUploadField>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-og-text truncate">{org.name}</h1>
              {org.private && (
                <span className="flex items-center gap-1 text-xs font-medium text-gray-400">
                  <LockIcon size={12} /> {t("private")}
                </span>
              )}
            </div>
            {org.full_name && <p className="text-sm text-gray-400 mt-0.5">{org.full_name}</p>}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            {org.org_category === "external" && (
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 text-[10px] font-medium text-og-accent border border-og-accent/40 bg-og-accent/10 rounded-full">
                  {org.org_type ? tOrgType(org.org_type) : tOrgCategory("external")}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-medium text-gray-400 border border-og-border-md rounded-full">
                  {tOrgCategory("external")}
                </span>
              </div>
            )}
            {!editing ? (
              <div className="flex items-center gap-2">
                {canManageOrg && (
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
            ) : (
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
        </div>
        {!editing && org.description && (
          <p className="mt-4 text-sm text-gray-500 leading-relaxed">{org.description}</p>
        )}
      </div>

      {actionError && <p className="text-xs text-red-500">{actionError}</p>}

      {/* Private + non-member gate (internal orgs only — an external org's
          is_member is always False, so this must not fire for those) */}
      {org.org_category === "internal" && org.private && !org.is_member ? (
        <div className="bg-og-surface rounded-xl border border-og-border shadow-xs px-5 py-10 flex flex-col items-center gap-3 text-center">
          <LockIcon size={24} className="text-gray-300" />
          <p className="text-sm text-gray-400">{t("privateGateMessage")}</p>
        </div>
      ) : (
        <>
          {canManageOrg && editing && (
            <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-4 space-y-3">
              {isGlobalAdmin && (
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">{t("category")}</label>
                  <SegmentedToggle
                    value={form?.org_category ?? "internal"}
                    onChange={(v) => setForm((f) => f && { ...f, org_category: v })}
                    options={[
                      { value: "internal", label: t("categoryInternal") },
                      { value: "external", label: t("categoryExternal") },
                    ]}
                  />
                </div>
              )}
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
                  <Select
                    value={form?.location_id ?? ""}
                    onChange={(v) => setForm((f) => f && { ...f, location_id: v })}
                    options={locations.map((l) => ({ value: l.id, label: l.path }))}
                    placeholder={t("none")}
                  />
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
              {isGlobalAdmin && form?.org_category === "external" && (
                <div className="space-y-3 pt-2 border-t border-og-border">
                  <div className="space-y-1">
                    <label className="text-xs text-gray-400">{t("orgType")}</label>
                    <SegmentedToggle
                      value={form.org_type}
                      onChange={(v) => setForm((f) => f && { ...f, org_type: v })}
                      options={[
                        { value: "provider", label: t("orgTypeProvider") },
                        { value: "customer", label: t("orgTypeCustomer") },
                      ]}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">{t("contactEmail")}</label>
                      <input value={form.contact_email} onChange={(e) => setForm((f) => f && { ...f, contact_email: e.target.value })} className={`${IB} ${IB_OK}`} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">{t("contactPhone")}</label>
                      <input value={form.contact_phone} onChange={(e) => setForm((f) => f && { ...f, contact_phone: e.target.value })} className={`${IB} ${IB_OK}`} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-400">{t("vatNumber")}</label>
                    <input value={form.vat_number} onChange={(e) => setForm((f) => f && { ...f, vat_number: e.target.value })} className={`${IB} ${IB_OK}`} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs text-gray-400">{t("addressStreet")}</label>
                      <input value={form.address_street} onChange={(e) => setForm((f) => f && { ...f, address_street: e.target.value })} className={`${IB} ${IB_OK}`} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">{t("addressCity")}</label>
                      <input value={form.address_city} onChange={(e) => setForm((f) => f && { ...f, address_city: e.target.value })} className={`${IB} ${IB_OK}`} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">{t("addressState")}</label>
                      <input value={form.address_state} onChange={(e) => setForm((f) => f && { ...f, address_state: e.target.value })} className={`${IB} ${IB_OK}`} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">{t("addressPostalCode")}</label>
                      <input value={form.address_postal_code} onChange={(e) => setForm((f) => f && { ...f, address_postal_code: e.target.value })} className={`${IB} ${IB_OK}`} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">{t("addressCountry")}</label>
                      <input value={form.address_country} onChange={(e) => setForm((f) => f && { ...f, address_country: e.target.value })} className={`${IB} ${IB_OK}`} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Info card grid */}
          {!editing && infoCards.length > 0 && (
            <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {infoCards.map((card) => (
                  <InfoCard key={card.key} label={card.label} icon={card.icon} value={card.value} />
                ))}
              </div>
            </div>
          )}

          {/* Stat highlights */}
          {!editing && (org.asset_count !== null || org.member_count !== null) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {org.asset_count !== null && (
                <StatCard
                  label={t("assets")}
                  value={org.asset_count}
                  sublabel={t("assetCount", { count: org.asset_count })}
                  href={`/assets?organization_id=${org.id}&organization_name=${encodeURIComponent(org.name)}`}
                />
              )}
              {org.member_count !== null && (
                <StatCard label={t("members")} value={org.member_count} sublabel={t("memberCount", { count: org.member_count })} />
              )}
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
                        <Select
                          value={m.role}
                          onChange={(v) => handleRoleChange(m.user_id, v as OrgRole)}
                          options={[
                            { value: "member", label: translateDynamic(tOrgRole, "member") },
                            { value: "admin", label: translateDynamic(tOrgRole, "admin") },
                          ]}
                          className="w-28"
                        />
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
                  <div className="divide-y divide-og-border">
                    <div className="flex items-start gap-4 py-3">
                      <span className="w-32 shrink-0 text-xs text-gray-400 pt-0.5">{t("algorithm")}</span>
                      <span className="flex-1 text-sm text-og-text">{signingCert.algorithm}</span>
                    </div>
                    <div className="flex items-start gap-4 py-3">
                      <span className="w-32 shrink-0 text-xs text-gray-400 pt-0.5">{t("fingerprint")}</span>
                      <span className="flex-1 font-mono text-xs break-all">{signingCert.fingerprint_sha256}</span>
                    </div>
                    <div className="flex items-start gap-4 py-3 last:border-0">
                      <span className="w-32 shrink-0 text-xs text-gray-400 pt-0.5">{t("valid")}</span>
                      <span className="flex-1 text-sm text-og-text">{fmtDate(signingCert.not_valid_before)} – {fmtDate(signingCert.not_valid_after)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 py-3">
                    {t("noCertificate")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Danger zone */}
          {editing && canManageOrg && (
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
                          const updated = await restoreOrganization(org.id);
                          setOrg(updated);
                          onChanged();
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

      {addMemberOpen && (
        <AddMemberModal
          orgId={orgId}
          onClose={() => setAddMemberOpen(false)}
          onAdded={() => listOrgMembers(orgId).then(setMembers).catch(() => {})}
        />
      )}

      {deleteModalOpen && (
        <ConfirmModal
          title={t("deleteModal.title")}
          message={t("deleteModal.message", { name: org.name })}
          confirmLabel={t("deleteModal.confirm")}
          danger
          onConfirm={async () => {
            await deactivateOrganization(org.id);
            onRemoved();
          }}
          onClose={() => setDeleteModalOpen(false)}
        />
      )}

      {joinModalOpen && (
        <ConfirmModal
          title={t("joinModal.title")}
          message={t("joinModal.message", { name: org.name })}
          confirmLabel={t("joinModal.confirm")}
          onConfirm={async () => {
            await requestToJoin(orgId);
            load();
          }}
          onClose={() => setJoinModalOpen(false)}
        />
      )}

      {leaveModalOpen && (
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
              onConfirm={() => { setLeaveModalOpen(false); startEdit(); }}
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
              await leaveOrganization(orgId);
              onRemoved();
            }}
            onClose={() => setLeaveModalOpen(false)}
          />
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrganizationsPage() {
  const t = useTranslations("organizations.page");
  const tOrgCategory = useTranslations("tokens.orgCategory");
  const tOrgType = useTranslations("tokens.orgType");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isSuperAdmin = user.role === "superadmin";
  const isAdmin = user.role === "admin" || user.role === "superadmin";

  const [orgs, setOrgs] = useState<OrganizationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [joinTarget, setJoinTarget] = useState<OrganizationListItem | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<OrganizationListItem | null>(null);
  const [filter, setFilter] = useState<SidebarFilter>("all");
  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("id"));
  const [autoEditId, setAutoEditId] = useState<string | null>(
    () => (searchParams.get("edit") === "1" ? searchParams.get("id") : null)
  );

  const load = useCallback(() => {
    setLoading(true);
    listOrganizations({
      org_category: filter === "all" ? undefined : filter === "internal" ? "internal" : "external",
      org_type: filter === "provider" || filter === "customer" ? filter : undefined,
    })
      .then((data) => {
        setOrgs(data);
        setSelectedId((prev) => prev ?? data[0]?.id ?? null);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : t("loadFailed")))
      .finally(() => setLoading(false));
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const visibleOrgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) => o.name.toLowerCase().includes(q));
  }, [orgs, search]);

  const selectedOrg = useMemo(() => orgs.find((o) => o.id === selectedId) ?? null, [orgs, selectedId]);

  function handleCreated(id: string) {
    setCreating(false);
    load();
    setSelectedId(id);
  }

  function handleRemoved() {
    setSelectedId(null);
    load();
  }

  return (
    <div className="p-6 space-y-5">
      {/* Page header — floats over grid background */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-og-text">{t("title")}</h1>
          <p className="text-sm text-gray-400 mt-1">
            {!loading && t("count", { count: orgs.length })}
          </p>
        </div>
        {!creating && user.role !== "viewer" && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors"
          >
            <PlusIcon size={12} /> {t("newOrganization")}
          </button>
        )}
      </div>

      {creating && (
        <NewOrgForm
          isAdmin={isAdmin}
          onCancel={() => setCreating(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Two-panel layout */}
      <div className="flex gap-5 items-start">
        {/* Sidebar — search, filters, list */}
        <div className="w-80 shrink-0 bg-og-surface rounded-xl border border-og-border shadow-sm overflow-y-auto max-h-[calc(100vh-180px)] sticky top-0">
          <div className="p-3 space-y-3 border-b border-og-border sticky top-0 bg-og-surface rounded-t-xl z-10">
            <div className="relative">
              <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className={`${IB} ${IB_OK} pl-8`}
              />
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-1.5">
                <FilterPill label={t("filterAll")} active={filter === "all"} onClick={() => setFilter("all")} />
                <FilterPill label={t("filterInternal")} active={filter === "internal"} onClick={() => setFilter("internal")} />
                <FilterPill label={t("filterProviders")} active={filter === "provider"} onClick={() => setFilter("provider")} />
                <FilterPill label={t("filterCustomers")} active={filter === "customer"} onClick={() => setFilter("customer")} />
              </div>
            )}
          </div>

          <div className="p-2">
            {loading && <p className="text-xs text-gray-400 px-3 py-4">{t("loading")}</p>}
            {!loading && err && <p className="text-xs text-red-500 px-3 py-4">{err}</p>}
            {!loading && !err && visibleOrgs.length === 0 && (
              <p className="text-xs text-gray-400 px-3 py-4">{t("empty")}</p>
            )}
            <div className="space-y-1">
              {visibleOrgs.map((org) => (
                <div
                  key={org.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(org.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") setSelectedId(org.id); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left cursor-pointer transition-colors border ${
                    selectedId === org.id
                      ? "bg-og-accent/10 border-og-accent/40"
                      : org.is_active
                        ? "border-transparent hover:bg-og-surface-alt"
                        : "border-transparent bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/30"
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-og-surface-alt border border-og-border flex items-center justify-center shrink-0 overflow-hidden">
                    {org.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={org.logo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <BuildingIcon size={14} className="text-gray-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-og-text truncate">{org.name}</p>
                    <p className="flex items-center gap-1 text-xs text-gray-400 truncate">
                      {org.org_category === "external"
                        ? `${tOrgCategory("external")}${org.org_type ? ` · ${tOrgType(org.org_type)}` : ""}`
                        : tOrgCategory("internal")}
                      {org.private && <LockIcon size={10} className="shrink-0" />}
                    </p>
                  </div>
                  {!org.is_active && (
                    <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 rounded-full">
                      {t("deleted")}
                    </span>
                  )}
                  {!isSuperAdmin && org.is_active && org.org_category === "internal" && (
                    <JoinLeaveButton
                      org={org}
                      onJoinClick={() => setJoinTarget(org)}
                      onLeaveClick={() => setLeaveTarget(org)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detail panel */}
        <div className="flex-1 min-w-0">
          {selectedOrg ? (
            <OrganizationDetail
              key={selectedOrg.id}
              orgId={selectedOrg.id}
              autoEdit={autoEditId === selectedOrg.id}
              onAutoEditConsumed={() => {
                setAutoEditId(null);
                router.replace(`/organizations?id=${selectedOrg.id}`);
              }}
              onChanged={load}
              onRemoved={handleRemoved}
            />
          ) : (
            <div className="bg-og-surface rounded-xl border border-og-border shadow-xs flex items-center justify-center py-24">
              <div className="text-center">
                <BuildingIcon size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-400">{t("selectPrompt")}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {joinTarget && (
        <ConfirmModal
          title={t("joinModal.title")}
          message={t("joinModal.message", { name: joinTarget.name })}
          confirmLabel={t("joinModal.confirm")}
          onConfirm={async () => {
            await requestToJoin(joinTarget.id);
            load();
          }}
          onClose={() => setJoinTarget(null)}
        />
      )}

      {leaveTarget && (
        leaveTarget.is_last_admin ? (
          (leaveTarget.member_count ?? 0) > 1 ? (
            <ConfirmModal
              title={t("leaveOnlyAdmin.title")}
              message={t("leaveOnlyAdmin.message")}
              onClose={() => setLeaveTarget(null)}
            />
          ) : (
            <ConfirmModal
              title={t("leaveOnlyMember.title")}
              message={t("leaveOnlyMember.message")}
              confirmLabel={t("leaveOnlyMember.confirm")}
              onConfirm={() => {
                const id = leaveTarget.id;
                setLeaveTarget(null);
                setSelectedId(id);
                setAutoEditId(id);
              }}
              onClose={() => setLeaveTarget(null)}
            />
          )
        ) : (
          <ConfirmModal
            title={t("leaveModal.title")}
            message={t("leaveModal.message", { name: leaveTarget.name })}
            confirmLabel={t("leaveModal.confirm")}
            danger
            onConfirm={async () => {
              await leaveOrganization(leaveTarget.id);
              load();
            }}
            onClose={() => setLeaveTarget(null)}
          />
        )
      )}
    </div>
  );
}
