"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BuildingIcon, LockIcon, PlusIcon, XIcon, CheckIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth-context";
import { ConfirmModal } from "@/components/confirm-modal";
import { createOrganization, leaveOrganization, listOrganizations, requestToJoin } from "@/services/organization.service";
import type { OrganizationListItem } from "@/types/organization";

const IB = "w-full px-3 py-2 rounded-lg border text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 transition-colors placeholder:text-gray-400";
const IB_OK = "border-og-border-md focus:border-og-accent focus:ring-og-accent/20";

function NewOrgForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
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
      setErr(e instanceof Error ? e.message : "Failed to create organization");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-sm p-4 space-y-3">
      <p className="text-sm font-semibold text-og-text">New organization</p>
      <div className="space-y-1">
        <label className="text-xs text-gray-400">Name <span className="text-red-400">*</span></label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meridian Calibration Labs" className={`${IB} ${IB_OK}`} autoFocus />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-gray-400">Full legal name</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Optional" className={`${IB} ${IB_OK}`} />
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-400">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        Private — only members can see its details, members, and assets
      </label>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
          <XIcon size={12} /> Cancel
        </button>
        <button onClick={handleCreate} disabled={!name.trim() || saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
          <CheckIcon size={12} /> {saving ? "Creating…" : "Create"}
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
  if (org.is_member) {
    return (
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); onLeaveClick(); }}
        className="shrink-0 px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white text-[11px] font-medium rounded-lg transition-colors"
      >
        Leave
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
        Request pending
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); onJoinClick(); }}
      className="shrink-0 px-2.5 py-1 bg-og-action hover:bg-og-action-dark text-white text-[11px] font-medium rounded-lg transition-colors"
    >
      Request to join
    </button>
  );
}

export default function OrganizationsPage() {
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
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load organizations"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-og-text">Organizations</h1>
          <p className="text-sm text-gray-400 mt-1">
            {!loading && `${orgs.length} organization${orgs.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors"
          >
            <PlusIcon size={12} /> New Organization
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
            Loading…
          </div>
        )}
        {!loading && err && <div className="px-4 py-4 text-sm text-red-500">{err}</div>}
        {!loading && !err && orgs.length === 0 && (
          <p className="px-4 py-8 text-sm text-gray-400 text-center">No organizations yet.</p>
        )}
        <div className="divide-y divide-og-border">
          {orgs.map((org) => (
            <div key={org.id} className="flex items-center gap-3 px-4 py-3 hover:bg-og-surface-alt transition-colors">
              <Link href={`/organizations/${org.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-og-surface-alt border border-og-border flex items-center justify-center shrink-0 overflow-hidden">
                  {org.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={org.logo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <BuildingIcon size={16} className="text-gray-400" />
                  )}
                </div>
                <p className="text-sm font-medium text-og-text flex-1 min-w-0 truncate">{org.name}</p>
                {org.private && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400">
                    <LockIcon size={11} /> Private
                  </span>
                )}
              </Link>
              {!isSuperAdmin && (
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
          title="Request to join?"
          message={`Request to join ${joinTarget.name}? An organization admin will need to approve it.`}
          confirmLabel="Send request"
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
              title="You're the only admin"
              message="Promote another member to admin before leaving this organization."
              onClose={() => setLeaveTarget(null)}
            />
          ) : (
            <ConfirmModal
              title="You're the only member"
              message="There's no one else to hand this organization to — delete it instead of leaving. Open the organization page to use the Danger Zone."
              confirmLabel="Open organization"
              onConfirm={() => { router.push(`/organizations/${leaveTarget.id}?edit=1`); }}
              onClose={() => setLeaveTarget(null)}
            />
          )
        ) : (
          <ConfirmModal
            title="Leave organization?"
            message={`Leave ${leaveTarget.name}? You'll need to request to join again to regain access.`}
            confirmLabel="Leave"
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
