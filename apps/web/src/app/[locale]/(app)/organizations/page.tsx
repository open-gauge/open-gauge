"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { BuildingIcon, LockIcon, PlusIcon, XIcon, CheckIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth-context";
import { ConfirmModal } from "@/components/confirm-modal";
import { ToggleSwitch } from "@/components/toggle-switch";
import { createOrganization, leaveOrganization, listOrganizations, requestToJoin } from "@/services/organization.service";
import type { OrganizationListItem } from "@/types/organization";

const IB = "w-full px-3 py-2 rounded-lg border text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 transition-colors placeholder:text-gray-400";
const IB_OK = "border-og-border-md focus:border-og-accent focus:ring-og-accent/20";

function NewOrgForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const t = useTranslations("organizations.newOrgForm");
  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    setErr("");
    try {
      const org = await createOrganization({ name: name.trim(), full_name: fullName.trim() || undefined, private: isPrivate });
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
      <div className="space-y-1">
        <label className="text-xs text-gray-400">{t("name")} <span className="text-red-400">*</span></label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} className={`${IB} ${IB_OK}`} autoFocus />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-gray-400">{t("fullName")}</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("optional")} className={`${IB} ${IB_OK}`} />
      </div>
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
        onClick={(e) => { e.preventDefault(); onLeaveClick(); }}
        className="shrink-0 px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white text-[11px] font-medium rounded-lg transition-colors"
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
        onClick={(e) => e.preventDefault()}
        className="shrink-0 px-2.5 py-1 bg-og-surface-alt text-gray-400 text-[11px] font-medium rounded-lg border border-og-border-md cursor-default"
      >
        {t("pending")}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); onJoinClick(); }}
      className="shrink-0 px-2.5 py-1 bg-og-action hover:bg-og-action-dark text-white text-[11px] font-medium rounded-lg transition-colors"
    >
      {t("requestToJoin")}
    </button>
  );
}

export default function OrganizationsPage() {
  const t = useTranslations("organizations.page");
  const router = useRouter();
  const { user } = useAuth();
  const isSuperAdmin = user.role === "superadmin";
  const [orgs, setOrgs] = useState<OrganizationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [joinTarget, setJoinTarget] = useState<OrganizationListItem | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<OrganizationListItem | null>(null);

  function load() {
    listOrganizations()
      .then(setOrgs)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : t("loadFailed")))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-6 space-y-5">
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
          onCancel={() => setCreating(false)}
          onCreated={(id) => router.push(`/organizations/${id}`)}
        />
      )}

      <div className="bg-og-surface rounded-xl border border-og-border shadow-sm">
        {loading && (
          <div className="flex items-center justify-center py-10 gap-2 text-xs text-gray-400">
            <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
            {t("loading")}
          </div>
        )}
        {!loading && err && <div className="px-4 py-4 text-sm text-red-500">{err}</div>}
        {!loading && !err && orgs.length === 0 && (
          <p className="px-4 py-8 text-sm text-gray-400 text-center">{t("empty")}</p>
        )}
        <div className="divide-y divide-og-border">
          {orgs.map((org) => (
            <div
              key={org.id}
              className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                org.is_active ? "hover:bg-og-surface-alt" : "bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/30"
              }`}
            >
              <Link href={`/organizations/${org.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-full bg-og-surface-alt border border-og-border flex items-center justify-center shrink-0 overflow-hidden">
                  {org.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={org.logo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <BuildingIcon size={16} className="text-gray-400" />
                  )}
                </div>
                <p className="text-sm font-medium text-og-text flex-1 min-w-0 truncate">{org.name}</p>
                {!org.is_active && (
                  <span className="px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 rounded-full">
                    {t("deleted")}
                  </span>
                )}
                {org.private && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400">
                    <LockIcon size={11} /> {t("private")}
                  </span>
                )}
              </Link>
              {!isSuperAdmin && org.is_active && (
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
              onConfirm={() => { router.push(`/organizations/${leaveTarget.id}?edit=1`); }}
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
