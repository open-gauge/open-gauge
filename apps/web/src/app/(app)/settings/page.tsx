"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { UserProfile, UserSignature } from "@/types/user";
import {
  CameraIcon,
  CheckIcon,
  EditIcon,
  SignatureIcon,
  TrashIcon,
  WarningIcon,
  XIcon,
} from "@/components/icons";
import { Avatar } from "@/components/avatar";
import { ImagePreviewModal } from "@/components/image-preview-modal";
import { SignaturePad } from "@/components/signature-pad";
import {
  changePassword,
  deleteMe,
  deleteMyPicture,
  deleteMySignature,
  getMySignature,
  joinTeam,
  leaveTeam,
  listTeams,
  updateMe,
  uploadMyPicture,
  uploadMySignature,
  verifyUserSignature,
  type SignatureVerifyResult,
  type Team,
} from "@/services/user.service";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const IB = "w-full px-3 py-2 rounded-lg border text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 transition-colors placeholder:text-gray-400";
const IB_OK = "border-og-border-md focus:border-og-accent focus:ring-og-accent/20";
const IB_ERR = "border-red-400 focus:border-red-400 focus:ring-red-400/20";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-og-surface-alt border border-og-border rounded-lg px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p className="text-sm text-og-text">{value}</p>
    </div>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

// ---------------------------------------------------------------------------
// Profile picture card
// ---------------------------------------------------------------------------

function ProfilePictureCard({ user, onRefresh }: { user: UserProfile; onRefresh: () => Promise<void> }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      await uploadMyPicture(file);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload picture");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    setError("");
    try {
      await deleteMyPicture();
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove picture");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
      <div className="px-4 py-3 border-b border-og-border">
        <p className="text-xs font-semibold text-og-text">Profile Picture</p>
      </div>
      <div className="p-4 flex items-center gap-4">
        <button
          type="button"
          onClick={() => user.profile_picture_url && setPreviewOpen(true)}
          disabled={!user.profile_picture_url}
          className="rounded-full shrink-0 disabled:cursor-default"
        >
          <Avatar name={user.name} pictureUrl={user.profile_picture_url} size={64} />
        </button>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors disabled:opacity-60"
            >
              <CameraIcon size={12} /> {uploading ? "Uploading…" : "Change picture"}
            </button>
            {user.profile_picture_url && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors disabled:opacity-60"
              >
                <TrashIcon size={12} /> Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-400">JPG, PNG or GIF. Max 5MB.</p>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {previewOpen && user.profile_picture_url && (
        <ImagePreviewModal
          src={user.profile_picture_url}
          alt={user.name}
          title={user.name}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signature card
// ---------------------------------------------------------------------------

function SignatureCard({ user }: { user: UserProfile }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [signature, setSignature] = useState<UserSignature | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [verifyResult, setVerifyResult] = useState<SignatureVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    getMySignature()
      .then(setSignature)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load signature"))
      .finally(() => setLoading(false));
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      setSignature(await uploadMySignature(file, "upload"));
      setVerifyResult(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload signature");
    } finally {
      setUploading(false);
    }
  }

  async function handleDrawSave(blob: Blob) {
    setUploading(true);
    setError("");
    try {
      setSignature(await uploadMySignature(blob, "drawn"));
      setVerifyResult(null);
      setDrawing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save signature");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    setError("");
    try {
      await deleteMySignature();
      setSignature(null);
      setVerifyResult(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove signature");
    } finally {
      setUploading(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    setError("");
    try {
      setVerifyResult(await verifyUserSignature(user.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to verify signature");
    } finally {
      setVerifying(false);
    }
  }

  if (user.role === "viewer") return null;

  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
      <div className="px-4 py-3 border-b border-og-border">
        <p className="text-xs font-semibold text-og-text">Signature</p>
      </div>
      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : drawing ? (
          <SignaturePad onSave={handleDrawSave} onCancel={() => setDrawing(false)} />
        ) : (
          <>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => signature?.image_url && setPreviewOpen(true)}
                disabled={!signature?.image_url}
                // Fixed white, not bg-og-surface-alt — signatures are dark ink on a
                // transparent PNG, so they need a fixed light backdrop to stay
                // visible in dark mode.
                className="w-32 h-16 rounded-lg border border-og-border-md bg-white flex items-center justify-center overflow-hidden shrink-0 disabled:cursor-default"
              >
                {signature?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={signature.image_url} alt="Signature" className="max-w-full max-h-full object-contain" />
                ) : (
                  <SignatureIcon size={20} className="text-gray-300" />
                )}
              </button>
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors disabled:opacity-60"
                  >
                    <CameraIcon size={12} /> {uploading ? "Saving…" : signature ? "Replace" : "Upload image"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawing(true)}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors disabled:opacity-60"
                  >
                    <EditIcon size={12} /> Draw
                  </button>
                  {signature && (
                    <button
                      type="button"
                      onClick={handleRemove}
                      disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors disabled:opacity-60"
                    >
                      <TrashIcon size={12} /> Remove
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">
                  PNG with a transparent background. Cryptographically signed and used to sign certificates you perform.
                </p>
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>
            </div>

            {signature && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-og-surface-alt border border-og-border">
                <span
                  className="text-xs text-gray-400 font-mono truncate"
                  title={`Ed25519 public key fingerprint: ${signature.fingerprint_sha256}`}
                >
                  {signature.fingerprint_sha256.slice(0, 4)}…{signature.fingerprint_sha256.slice(-4)}
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  {verifyResult && (
                    <span
                      className={`flex items-center gap-1 text-xs ${verifyResult.verified ? "text-emerald-500" : "text-red-500"}`}
                    >
                      <CheckIcon size={11} /> {verifyResult.verified ? "Verified" : "Not verified"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={verifying}
                    className="text-xs font-medium text-og-accent hover:underline disabled:opacity-60"
                  >
                    {verifying ? "Verifying…" : "Verify"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        <input ref={fileInputRef} type="file" accept="image/png" className="hidden" onChange={handleFileChange} />
      </div>

      {previewOpen && signature?.image_url && (
        <ImagePreviewModal src={signature.image_url} alt="Signature" title="Signature" onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}

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
      <ProfilePictureCard user={user} onRefresh={onRefresh} />
      <SignatureCard user={user} />

      {/* Display Name */}
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="flex items-center justify-between px-4 py-3 border-b border-og-border">
          <p className="text-xs font-semibold text-og-text">Display Name</p>
          {editName ? (
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditName(false); setNameVal(user.name); setNameErr(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
                <XIcon size={12} /> Cancel
              </button>
              <button onClick={saveName} disabled={nameSave === "saving" || !nameVal.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
                <CheckIcon size={12} /> {nameSave === "saving" ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <button onClick={() => setEditName(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
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
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="flex items-center justify-between px-4 py-3 border-b border-og-border">
          <p className="text-xs font-semibold text-og-text">Email Address</p>
          {editEmail ? (
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditEmail(false); setEmailVal(user.email); setEmailErr(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
                <XIcon size={12} /> Cancel
              </button>
              <button onClick={saveEmail} disabled={emailSave === "saving" || !emailVal.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
                <CheckIcon size={12} /> {emailSave === "saving" ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <button onClick={() => setEditEmail(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
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
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="flex items-center justify-between px-4 py-3 border-b border-og-border">
          <p className="text-xs font-semibold text-og-text">Change Password</p>
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
            className="flex items-center gap-1.5 px-4 py-2 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
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

function TeamsSection() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");

  useEffect(() => {
    listTeams()
      .then(setTeams)
      .catch((e: unknown) => setLoadErr(e instanceof Error ? e.message : "Failed to load teams"))
      .finally(() => setLoading(false));
  }, []);

  async function toggleMembership(team: Team) {
    setPendingId(team.id);
    setActionErr("");
    try {
      const updated = team.is_member ? await leaveTeam(team.id) : await joinTeam(team.id);
      setTeams((prev) => prev.map((t) => (t.id === team.id ? updated : t)));
    } catch (e: unknown) {
      setActionErr(e instanceof Error ? e.message : "Failed to update team membership");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
      <div className="px-4 py-3 border-b border-og-border">
        <p className="text-xs font-semibold text-og-text">Teams</p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          Choose which of your organization&apos;s teams to join — membership is opt-in and
          determines who gets calibration reminder emails for a team-owned asset. Creating,
          renaming, or deleting teams is done from Admin → Organizations.
        </p>
      </div>

      {actionErr && <p className="px-4 pt-3 text-xs text-red-500">{actionErr}</p>}

      <div className="divide-y divide-og-border">
        {loading && (
          <div className="flex items-center justify-center py-10 gap-2 text-xs text-gray-400">
            <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
            Loading…
          </div>
        )}
        {!loading && loadErr && (
          <div className="px-4 py-4 text-sm text-red-500">{loadErr}</div>
        )}
        {!loading && !loadErr && teams.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400">No teams in your organization yet.</p>
        )}
        {teams.map((team) => (
          <div key={team.id} className="flex items-start justify-between px-4 py-3 gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-og-text">{team.name}</p>
              {team.description && (
                <p className="text-xs text-gray-400 mt-0.5">{team.description}</p>
              )}
            </div>
            <button
              onClick={() => toggleMembership(team)}
              disabled={pendingId === team.id}
              className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-60 ${
                team.is_member
                  ? "border border-og-border-md text-gray-600 dark:text-gray-300 hover:bg-og-surface-alt"
                  : "bg-og-action hover:bg-og-action-dark text-white"
              }`}
            >
              {pendingId === team.id ? "…" : team.is_member ? "Leave" : "Join"}
            </button>
          </div>
        ))}
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
    <div className="bg-og-surface rounded-xl border border-red-400/30 shadow-xs">
      <div className="px-4 py-3 border-b border-red-400/20">
        <p className="text-xs font-semibold text-red-500">Delete Account</p>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30">
          <WarningIcon size={14} className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-xs text-red-700 dark:text-red-400 space-y-1">
            <p className="font-semibold">This action is permanent and cannot be undone.</p>
            <p>Your account will be deactivated. All calibration records and data you created will remain for traceability purposes but you will no longer be able to log in.</p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-400">
            Type <span className="font-mono text-og-text">{CONFIRM_PHRASE}</span> to confirm
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
        <h1 className="text-xl font-bold text-og-text">Settings</h1>
        <p className="text-sm text-gray-400 mt-1">Manage your profile and workspace</p>
      </div>

      <div className="flex gap-5 items-start">
        {/* Sidebar nav */}
        <div className="w-52 shrink-0 bg-og-surface rounded-xl border border-og-border shadow-xs sticky top-4">
          <div className="px-3 py-3 border-b border-og-border">
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
                    ? "bg-og-border text-og-text"
                    : "text-gray-400 hover:bg-og-border/50 hover:text-og-text"
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
          {section === "teams" && <TeamsSection />}
          {section === "delete" && <DeleteSection onDeleted={handleDeleted} />}
        </div>
      </div>
    </div>
  );
}
