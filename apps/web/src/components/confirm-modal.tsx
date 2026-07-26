"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WarningIcon } from "@/components/icons";

interface ConfirmModalProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Omit to render an informational modal with only a dismiss button (no destructive action). */
  onConfirm?: () => void | Promise<void>;
  onClose: () => void;
}

/** Generic confirmation dialog — modeled on asset-detail-client.tsx's RetireModal shell. */
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const t = useTranslations("common.confirmModal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (!onConfirm) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("somethingWrong"));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <WarningIcon size={20} className={`shrink-0 ${danger ? "text-red-500" : "text-og-accent"}`} />
          <h2 className="text-base font-semibold text-og-text">{title}</h2>
        </div>
        <div className="text-sm text-gray-500 mb-5">{message}</div>
        {error && <p className="text-xs text-red-500 mb-4">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-sm border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors text-og-text disabled:opacity-50"
          >
            {onConfirm ? (cancelLabel ?? t("cancel")) : t("close")}
          </button>
          {onConfirm && (
            <button
              type="button"
              disabled={busy}
              onClick={handleConfirm}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                danger ? "bg-red-600 hover:bg-red-700" : "bg-og-action hover:bg-og-action-dark"
              }`}
            >
              {busy && <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {busy ? t("working") : (confirmLabel ?? t("confirm"))}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
