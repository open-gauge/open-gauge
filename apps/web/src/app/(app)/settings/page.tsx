"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { UserProfile } from "@/types/user";
import {
  CheckIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
  WarningIcon,
  XIcon,
} from "@/components/icons";
import {
  changePassword,
  createTeam,
  deleteMe,
  deleteTeam,
  listTeams,
  updateMe,
  updateTeam,
  type Team,
} from "@/services/user.service";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const IB = "w-full px-3 py-2 rounded-lg border text-sm text-mar-text bg-mar-surface focus:outline-none focus:ring-1 transition-colors placeholder:text-gray-400";
const IB_OK = "border-mar-border-md focus:border-mar-accent focus:ring-mar-accent/20";
const IB_ERR = "border-red-400 focus:border-red-400 focus:ring-red-400/20";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-mar-surface-alt border border-mar-border rounded-lg px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p className="text-sm text-mar-text">{value}</p>
    </div>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

// ---------------------------------------------------------------------------
// Profile section
// ---------------------------------------------------------------------------

function ProfileSection({ user, onRefresh }: { user: UserProfile; onRefresh: () => Promise<void> }) {
  // --- Name ---
  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal] = useState(user.name);
  const [nameSave, setNameSave] = useState<SaveState>("idle");
  const [nameErr, setNameErr] = useState("");

  async function saveName() {
    if (!nameVal.trim()) return;
    setNameSave("saving");
    setNameErr("");
    try {
      await updateMe({ name: nameVal.trim() });
      await onRefresh();
      setEditName(false);
      setNameSave("saved");
      setTimeout(() => setNameSave("idle"), 2000);
    } catch (e: unknown) {
      setNameErr(e instanceof Error ? e.message : "Failed to save");
      setNameSave("error");
    }
  }

  // --- Email ---
  const [editEmail, setEditEmail] = useState(false);
  const [emailVal, setEmailVal] = useState(user.email);
  const [emailSave, setEmailSave] = useState<SaveState>("idle");
  const [emailErr, setEmailErr] = useState("");

  async function saveEmail() {
    if (!emailVal.trim()) return;
    setEmailSave("saving");
    setEmailErr("");
    try {
      await updateMe({ email: emailVal.trim() });
      await onRefresh();
      setEditEmail(false);
      setEmailSave("saved");
      setTimeout(() => setEmailSave("idle"), 2000);
    } catch (e: unknown) {
      setEmailErr(e instanceof Error ? e.message : "Failed to save");
      setEmailSave("error");
    }
  }

  // --- Password ---
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSave, setPwSave] = useState<SaveState>("idle");
  const [pwErr, setPwErr] = useState("");

  const pwMismatch = pwNew !== "" && pwConfirm !== "" && pwNew !== pwConfirm;
  const pwValid = pwCurrent !== "" && pwNew.length >= 8 && pwNew === pwConfirm;

  async function savePassword() {
    if (!pwValid) return;
    setPwSave("saving");
    setPwErr("");
    try {
      await changePassword(pwCurrent, pwNew);
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
      setPwSave("saved");
      setTimeout(() => setPwSave("idle"), 2000);
    } catch (e: unknown) {
      setPwErr(e instanceof Error ? e.message : "Failed to change password");
      setPwSave("error");
    }
  }

  return (
    <div className="space-y-4">
      {/* Display Name */}
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-mar-border">
          <p className="text-xs font-semibold text-mar-text">Display Name</p>
          {editName ? (
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditName(false); setNameVal(user.name); setNameErr(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors">
                <XIcon size={12} /> Cancel
              </button>
              <button onClick={saveName} disabled={nameSave === "saving" || !nameVal.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
                <CheckIcon size={12} /> {nameSave === "saving" ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <button onClick={() => setEditName(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors">
              <EditIcon size={12} /> Edit
            </button>
          )}
        </div>
        <div className="p-4">
          {editName ? (
            <div className="space-y-1">
              <input value={nameVal} onChange={(e) => setNameVal(e.target.value)}
                className={`${IB} ${nameErr ? IB_ERR : IB_OK}`}
                placeholder="Your display name" autoFocus />
              {nameErr && <p className="text-xs text-red-500">{nameErr}</p>}
            </div>
          ) : (
            <Field label="Name" value={user.name} />
          )}
        </div>
      </div>

      {/* Email */}
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-mar-border">
          <p className="text-xs font-semibold text-mar-text">Email Address</p>
          {editEmail ? (
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditEmail(false); setEmailVal(user.email); setEmailErr(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors">
                <XIcon size={12} /> Cancel
              </button>
              <button onClick={saveEmail} disabled={emailSave === "saving" || !emailVal.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
                <CheckIcon size={12} /> {emailSave === "saving" ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <button onClick={() => setEditEmail(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors">
              <EditIcon size={12} /> Edit
            </button>
          )}
        </div>
        <div className="p-4">
          {editEmail ? (
            <div className="space-y-1">
              <input type="email" value={emailVal} onChange={(e) => setEmailVal(e.target.value)}
                className={`${IB} ${emailErr ? IB_ERR : IB_OK}`}
                placeholder="your@email.com" autoFocus />
              {emailErr && <p className="text-xs text-red-500">{emailErr}</p>}
            </div>
          ) : (
            <Field label="Email" value={user.email} />
          )}
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-mar-border">
          <p className="text-xs font-semibold text-mar-text">Change Password</p>
          {pwSave === "saved" && (
            <span className="flex items-center gap-1 text-xs text-emerald-500">
              <CheckIcon size={11} /> Password updated
            </span>
          )}
        </div>
        <div className="p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Current password</label>
            <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)}
              className={`${IB} ${IB_OK}`} placeholder="••••••••" autoComplete="current-password" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">New password <span className="text-gray-500">(min. 8 characters)</span></label>
            <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)}
              className={`${IB} ${IB_OK}`} placeholder="••••••••" autoComplete="new-password" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Confirm new password</label>
            <input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)}
              className={`${IB} ${pwMismatch ? IB_ERR : IB_OK}`} placeholder="••••••••" autoComplete="new-password" />
            {pwMismatch && <p className="text-xs text-red-500">Passwords do not match</p>}
          </div>
          {pwErr && <p className="text-xs text-red-500">{pwErr}</p>}
          <button onClick={savePassword} disabled={!pwValid || pwSave === "saving"}
            className="flex items-center gap-1.5 px-4 py-2 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
            <CheckIcon size={12} /> {pwSave === "saving" ? "Saving…" : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teams section
// ---------------------------------------------------------------------------

function TeamsSection({ user }: { user: UserProfile }) {
  const canManage = user.is_superuser || user.role === "superadmin" || user.role === "admin";

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");

  // Edit state per team
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState("");

  // New team form
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const [createErr, setCreateErr] = useState("");

  useEffect(() => {
    listTeams()
      .then(setTeams)
      .catch((e: unknown) => setLoadErr(e instanceof Error ? e.message : "Failed to load teams"))
      .finally(() => setLoading(false));
  }, []);

  function startEdit(team: Team) {
    setEditId(team.id);
    setEditName(team.name);
    setEditDesc(team.description ?? "");
    setEditErr("");
  }

  function cancelEdit() {
    setEditId(null);
    setEditErr("");
  }

  async function saveEdit(teamId: string) {
    if (!editName.trim()) return;
    setEditSaving(true);
    setEditErr("");
    try {
      const updated = await updateTeam(teamId, { name: editName.trim(), description: editDesc.trim() || undefined });
      setTeams((prev) => prev.map((t) => (t.id === teamId ? updated : t)));
      setEditId(null);
    } catch (e: unknown) {
      setEditErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(teamId: string, teamName: string) {
    if (!confirm(`Delete team "${teamName}"? This cannot be undone.`)) return;
    try {
      await deleteTeam(teamId);
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete team");
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreateSaving(true);
    setCreateErr("");
    try {
      const team = await createTeam({ name: newName.trim(), description: newDesc.trim() || undefined });
      setTeams((prev) => [...prev, team].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setNewDesc("");
      setCreating(false);
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : "Failed to create team");
    } finally {
      setCreateSaving(false);
    }
  }

  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-mar-border">
        <p className="text-xs font-semibold text-mar-text">Teams</p>
        {canManage && !creating && (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors">
            <PlusIcon size={12} /> New Team
          </button>
        )}
      </div>

      {/* New team form */}
      {creating && (
        <div className="px-4 py-4 border-b border-mar-border bg-mar-surface-alt space-y-3">
          <p className="text-xs font-semibold text-mar-text">New Team</p>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Team name <span className="text-red-400">*</span></label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              className={`${IB} ${IB_OK}`} placeholder="e.g. Calibration Lab" autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Description</label>
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              className={`${IB} ${IB_OK}`} placeholder="Optional description" />
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

      <div className="divide-y divide-mar-border">
        {loading && (
          <div className="flex items-center justify-center py-10 gap-2 text-xs text-gray-400">
            <span className="w-4 h-4 border-2 border-mar-accent/30 border-t-mar-accent rounded-full animate-spin" />
            Loading…
          </div>
        )}
        {!loading && loadErr && (
          <div className="px-4 py-4 text-sm text-red-500">{loadErr}</div>
        )}
        {!loading && !loadErr && teams.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400">
            {canManage ? "No teams yet. Create the first one above." : "No teams found."}
          </p>
        )}
        {teams.map((team) =>
          editId === team.id ? (
            <div key={team.id} className="px-4 py-4 space-y-3 bg-mar-surface-alt">
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Team name <span className="text-red-400">*</span></label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                  className={`${IB} ${IB_OK}`} autoFocus />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Description</label>
                <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                  className={`${IB} ${IB_OK}`} placeholder="Optional description" />
              </div>
              {editErr && <p className="text-xs text-red-500">{editErr}</p>}
              <div className="flex gap-2">
                <button onClick={cancelEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors">
                  <XIcon size={12} /> Cancel
                </button>
                <button onClick={() => saveEdit(team.id)} disabled={!editName.trim() || editSaving}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
                  <CheckIcon size={12} /> {editSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div key={team.id} className="flex items-start justify-between px-4 py-3 gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-mar-text">{team.name}</p>
                {team.description && (
                  <p className="text-xs text-gray-400 mt-0.5">{team.description}</p>
                )}
              </div>
              {canManage && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(team)}
                    className="p-1.5 text-gray-400 hover:text-mar-text rounded transition-colors">
                    <EditIcon size={13} />
                  </button>
                  <button onClick={() => handleDelete(team.id, team.name)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors">
                    <TrashIcon size={13} />
                  </button>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Account section
// ---------------------------------------------------------------------------

function DeleteSection({ onDeleted }: { onDeleted: () => void }) {
  const [confirmed, setConfirmed] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const CONFIRM_PHRASE = "delete my account";

  async function handleDelete() {
    if (confirmed !== CONFIRM_PHRASE) return;
    setDeleting(true);
    setError("");
    try {
      await deleteMe();
      onDeleted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete account");
      setDeleting(false);
    }
  }

  return (
    <div className="bg-mar-surface rounded-xl border border-red-400/30 shadow-sm">
      <div className="px-4 py-3 border-b border-red-400/20">
        <p className="text-xs font-semibold text-red-500">Delete Account</p>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30">
          <WarningIcon size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-700 dark:text-red-400 space-y-1">
            <p className="font-semibold">This action is permanent and cannot be undone.</p>
            <p>Your account will be deactivated. All calibration records and data you created will remain for traceability purposes but you will no longer be able to log in.</p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-400">
            Type <span className="font-mono text-mar-text">{CONFIRM_PHRASE}</span> to confirm
          </label>
          <input
            value={confirmed}
            onChange={(e) => setConfirmed(e.target.value)}
            className={`${IB} ${IB_OK}`}
            placeholder={CONFIRM_PHRASE}
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          onClick={handleDelete}
          disabled={confirmed !== CONFIRM_PHRASE || deleting}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <TrashIcon size={12} />
          {deleting ? "Deleting…" : "Delete My Account"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Section = "profile" | "teams" | "delete";

const NAV: { id: Section; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "teams", label: "Teams" },
  { id: "delete", label: "Delete Account" },
];

export default function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [section, setSection] = useState<Section>("profile");

  function handleDeleted() {
    logout();
    router.replace("/");
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-mar-text">Settings</h1>
        <p className="text-sm text-gray-400 mt-1">Manage your profile and workspace</p>
      </div>

      <div className="flex gap-5 items-start">
        {/* Sidebar nav */}
        <div className="w-52 flex-shrink-0 bg-mar-surface rounded-xl border border-mar-border shadow-sm sticky top-4">
          <div className="px-3 py-3 border-b border-mar-border">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Account</p>
          </div>
          <div className="p-2">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left
                  ${section === item.id
                    ? "bg-mar-border text-mar-text"
                    : "text-gray-400 hover:bg-mar-border/50 hover:text-mar-text"
                  }
                  ${item.id === "delete" ? "mt-1 text-red-500 hover:text-red-500" : ""}
                `}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {section === "profile" && <ProfileSection user={user} onRefresh={refreshUser} />}
          {section === "teams" && <TeamsSection user={user} />}
          {section === "delete" && <DeleteSection onDeleted={handleDeleted} />}
        </div>
      </div>
    </div>
  );
}
