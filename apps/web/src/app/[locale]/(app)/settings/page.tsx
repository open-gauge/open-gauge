"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import type { UserProfile, UserSignature } from "@/types/user";
import type { NotificationPreference } from "@/types/notification";
import { NOTIFICATION_CATEGORIES } from "@/constants/notifications";
import { translateDynamic } from "@/lib/translate-dynamic";
import { getNotificationPreferences, updateNotificationPreferences } from "@/services/notification.service";
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
import { ImageUploadField } from "@/components/image-upload-field";
import { ToggleSwitch } from "@/components/toggle-switch";
import { ImagePreviewModal } from "@/components/image-preview-modal";
import { SignaturePad } from "@/components/signature-pad";
import {
  changePassword,
  deleteMe,
  deleteMyPicture,
  deleteMySignature,
  getMySignature,
  updateMe,
  uploadMyPicture,
  uploadMySignature,
  verifyUserSignature,
  type SignatureVerifyResult,
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
  const t = useTranslations("settings.profilePicture");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(file: File) {
    setUploading(true);
    setError("");
    try {
      await uploadMyPicture(file);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errorUpload"));
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
      setError(err instanceof Error ? err.message : t("errorRemove"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
      <div className="px-4 py-3 border-b border-og-border">
        <p className="text-xs font-semibold text-og-text">{t("title")}</p>
      </div>
      <div className="p-4 flex items-center gap-4">
        <ImageUploadField
          imageUrl={user.profile_picture_url}
          alt={user.name}
          editable
          uploading={uploading}
          onUpload={handleFileChange}
          onRemove={handleRemove}
          size={64}
        >
          <Avatar name={user.name} pictureUrl={user.profile_picture_url} size={64} />
        </ImageUploadField>
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-gray-400">{t("hint")}</p>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signature card
// ---------------------------------------------------------------------------

function SignatureCard({ user }: { user: UserProfile }) {
  const t = useTranslations("settings.signature");
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
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t("errorLoad")))
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
      setError(err instanceof Error ? err.message : t("errorUpload"));
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
      setError(err instanceof Error ? err.message : t("errorSave"));
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
      setError(err instanceof Error ? err.message : t("errorRemove"));
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
      setError(err instanceof Error ? err.message : t("errorVerify"));
    } finally {
      setVerifying(false);
    }
  }

  if (user.role === "viewer") return null;

  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
      <div className="px-4 py-3 border-b border-og-border">
        <p className="text-xs font-semibold text-og-text">{t("title")}</p>
      </div>
      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-xs text-gray-400">{t("loading")}</p>
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
                  <img src={signature.image_url} alt={t("previewAlt")} className="max-w-full max-h-full object-contain" />
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
                    <CameraIcon size={12} /> {uploading ? t("saving") : signature ? t("replace") : t("uploadImage")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawing(true)}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors disabled:opacity-60"
                  >
                    <EditIcon size={12} /> {t("draw")}
                  </button>
                  {signature && (
                    <button
                      type="button"
                      onClick={handleRemove}
                      disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors disabled:opacity-60"
                    >
                      <TrashIcon size={12} /> {t("remove")}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">
                  {t("hint")}
                </p>
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>
            </div>

            {signature && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-og-surface-alt border border-og-border">
                <span
                  className="text-xs text-gray-400 font-mono truncate"
                  title={t("fingerprintTitle", { fingerprint: signature.fingerprint_sha256 })}
                >
                  {signature.fingerprint_sha256.slice(0, 4)}…{signature.fingerprint_sha256.slice(-4)}
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  {verifyResult && (
                    <span
                      className={`flex items-center gap-1 text-xs ${verifyResult.verified ? "text-emerald-500" : "text-red-500"}`}
                    >
                      <CheckIcon size={11} /> {verifyResult.verified ? t("verified") : t("notVerified")}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={verifying}
                    className="text-xs font-medium text-og-accent hover:underline disabled:opacity-60"
                  >
                    {verifying ? t("verifying") : t("verify")}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        <input ref={fileInputRef} type="file" accept="image/png" className="hidden" onChange={handleFileChange} />
      </div>

      {previewOpen && signature?.image_url && (
        <ImagePreviewModal src={signature.image_url} alt={t("previewAlt")} title={t("previewTitle")} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile section
// ---------------------------------------------------------------------------

function ProfileSection({ user, onRefresh }: { user: UserProfile; onRefresh: () => Promise<void> }) {
  const tName = useTranslations("settings.displayName");
  const tEmail = useTranslations("settings.email");
  const tPw = useTranslations("settings.password");
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
      setNameErr(e instanceof Error ? e.message : tName("errorSave"));
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
      setEmailErr(e instanceof Error ? e.message : tEmail("errorSave"));
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
      setPwErr(e instanceof Error ? e.message : tPw("errorSave"));
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
          <p className="text-xs font-semibold text-og-text">{tName("title")}</p>
          {editName ? (
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditName(false); setNameVal(user.name); setNameErr(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
                <XIcon size={12} /> {tName("cancel")}
              </button>
              <button onClick={saveName} disabled={nameSave === "saving" || !nameVal.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
                <CheckIcon size={12} /> {nameSave === "saving" ? tName("saving") : tName("save")}
              </button>
            </div>
          ) : (
            <button onClick={() => setEditName(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
              <EditIcon size={12} /> {tName("edit")}
            </button>
          )}
        </div>
        <div className="p-4">
          {editName ? (
            <div className="space-y-1">
              <input value={nameVal} onChange={(e) => setNameVal(e.target.value)}
                className={`${IB} ${nameErr ? IB_ERR : IB_OK}`}
                placeholder={tName("placeholder")} autoFocus />
              {nameErr && <p className="text-xs text-red-500">{nameErr}</p>}
            </div>
          ) : (
            <Field label={tName("label")} value={user.name} />
          )}
        </div>
      </div>

      {/* Email */}
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="flex items-center justify-between px-4 py-3 border-b border-og-border">
          <p className="text-xs font-semibold text-og-text">{tEmail("title")}</p>
          {editEmail ? (
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditEmail(false); setEmailVal(user.email); setEmailErr(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
                <XIcon size={12} /> {tEmail("cancel")}
              </button>
              <button onClick={saveEmail} disabled={emailSave === "saving" || !emailVal.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
                <CheckIcon size={12} /> {emailSave === "saving" ? tEmail("saving") : tEmail("save")}
              </button>
            </div>
          ) : (
            <button onClick={() => setEditEmail(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
              <EditIcon size={12} /> {tEmail("edit")}
            </button>
          )}
        </div>
        <div className="p-4">
          {editEmail ? (
            <div className="space-y-1">
              <input type="email" value={emailVal} onChange={(e) => setEmailVal(e.target.value)}
                className={`${IB} ${emailErr ? IB_ERR : IB_OK}`}
                placeholder={tEmail("placeholder")} autoFocus />
              {emailErr && <p className="text-xs text-red-500">{emailErr}</p>}
            </div>
          ) : (
            <Field label={tEmail("label")} value={user.email} />
          )}
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="flex items-center justify-between px-4 py-3 border-b border-og-border">
          <p className="text-xs font-semibold text-og-text">{tPw("title")}</p>
          {pwSave === "saved" && (
            <span className="flex items-center gap-1 text-xs text-emerald-500">
              <CheckIcon size={11} /> {tPw("updated")}
            </span>
          )}
        </div>
        <div className="p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-400">{tPw("currentLabel")}</label>
            <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)}
              className={`${IB} ${IB_OK}`} placeholder="••••••••" autoComplete="current-password" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">{tPw("newLabel")} <span className="text-gray-500">{tPw("newHint")}</span></label>
            <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)}
              className={`${IB} ${IB_OK}`} placeholder="••••••••" autoComplete="new-password" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">{tPw("confirmLabel")}</label>
            <input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)}
              className={`${IB} ${pwMismatch ? IB_ERR : IB_OK}`} placeholder="••••••••" autoComplete="new-password" />
            {pwMismatch && <p className="text-xs text-red-500">{tPw("mismatch")}</p>}
          </div>
          {pwErr && <p className="text-xs text-red-500">{pwErr}</p>}
          <button onClick={savePassword} disabled={!pwValid || pwSave === "saving"}
            className="flex items-center gap-1.5 px-4 py-2 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
            <CheckIcon size={12} /> {pwSave === "saving" ? tPw("saving") : tPw("submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification Preferences section
// ---------------------------------------------------------------------------

function NotificationsSection() {
  const t = useTranslations("settings.notifications");
  const tLabel = useTranslations("tokens.notificationCategory.label");
  const tDesc = useTranslations("tokens.notificationCategory.description");
  const [prefs, setPrefs] = useState<NotificationPreference[] | null>(null);
  const [error, setError] = useState("");
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  useEffect(() => {
    getNotificationPreferences()
      .then(setPrefs)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("errorLoad")));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle(category: string, field: "email_enabled" | "in_app_enabled", value: boolean) {
    if (!prefs) return;
    const current = prefs.find((p) => p.category === category);
    if (!current) return;
    const updated = { ...current, [field]: value };
    setPrefs((prev) => prev!.map((p) => (p.category === category ? updated : p)));
    setSavingCategory(category);
    setError("");
    try {
      setPrefs(await updateNotificationPreferences([updated]));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("errorSave"));
      setPrefs((prev) => prev!.map((p) => (p.category === category ? current : p)));
    } finally {
      setSavingCategory(null);
    }
  }

  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
      <div className="px-4 py-3 border-b border-og-border">
        <p className="text-xs font-semibold text-og-text">{t("title")}</p>
      </div>
      <div className="p-4">
        {!prefs && !error && <p className="text-xs text-gray-400">{t("loading")}</p>}
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        {prefs && (
          <div className="divide-y divide-og-border">
            <div className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-2 pb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              <span>{t("columnType")}</span>
              <span className="text-center">{t("columnEmail")}</span>
              <span className="text-center">{t("columnInternal")}</span>
            </div>
            {NOTIFICATION_CATEGORIES.map((category) => {
              const pref = prefs.find((p) => p.category === category);
              return (
                <div key={category} className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-2 items-center py-3">
                  <div>
                    <p className="text-sm text-og-text">{translateDynamic(tLabel, category)}</p>
                    <p className="text-xs text-gray-400">{translateDynamic(tDesc, category)}</p>
                  </div>
                  <div className="flex justify-center">
                    <ToggleSwitch
                      checked={pref?.email_enabled ?? true}
                      disabled={savingCategory === category}
                      onChange={(v) => handleToggle(category, "email_enabled", v)}
                      showLabel={false}
                    />
                  </div>
                  <div className="flex justify-center">
                    <ToggleSwitch
                      checked={pref?.in_app_enabled ?? true}
                      disabled={savingCategory === category}
                      onChange={(v) => handleToggle(category, "in_app_enabled", v)}
                      showLabel={false}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Account section
// ---------------------------------------------------------------------------

function DeleteSection({ onDeleted }: { onDeleted: () => void }) {
  const t = useTranslations("settings.deleteAccount");
  const [confirmed, setConfirmed] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const CONFIRM_PHRASE = t("confirmPhrase");

  async function handleDelete() {
    if (confirmed !== CONFIRM_PHRASE) return;
    setDeleting(true);
    setError("");
    try {
      await deleteMe();
      onDeleted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("errorDelete"));
      setDeleting(false);
    }
  }

  return (
    <div className="bg-og-surface rounded-xl border border-red-400/30 shadow-xs">
      <div className="px-4 py-3 border-b border-red-400/20">
        <p className="text-xs font-semibold text-red-500">{t("title")}</p>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30">
          <WarningIcon size={14} className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-xs text-red-700 dark:text-red-400 space-y-1">
            <p className="font-semibold">{t("warningTitle")}</p>
            <p>{t("warningBody")}</p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-400">
            {t("confirmPrefix")} <span className="font-mono text-og-text">{CONFIRM_PHRASE}</span> {t("confirmSuffix")}
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
          {deleting ? t("deleting") : t("submit")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Section = "profile" | "notifications" | "delete";

const NAV: { id: Section; labelKey: "profile" | "notifications" | "deleteAccount" }[] = [
  { id: "profile", labelKey: "profile" },
  { id: "notifications", labelKey: "notifications" },
  { id: "delete", labelKey: "deleteAccount" },
];

export default function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const t = useTranslations("settings");
  const [section, setSection] = useState<Section>("profile");

  function handleDeleted() {
    logout();
    router.replace("/");
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-og-text">{t("page.title")}</h1>
        <p className="text-sm text-gray-400 mt-1">{t("page.subtitle")}</p>
      </div>

      <div className="flex gap-5 items-start">
        {/* Sidebar nav */}
        <div className="w-52 shrink-0 bg-og-surface rounded-xl border border-og-border shadow-xs sticky top-4">
          <div className="px-3 py-3 border-b border-og-border">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{t("nav.account")}</p>
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
                {t(`nav.${item.labelKey}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {section === "profile" && <ProfileSection user={user} onRefresh={refreshUser} />}
          {section === "notifications" && <NotificationsSection />}
          {section === "delete" && <DeleteSection onDeleted={handleDeleted} />}
        </div>
      </div>
    </div>
  );
}
