"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPassword } from "@/services/auth.service";
import { CheckCircleIcon, WarningIcon } from "@/components/icons";

type Status = "form" | "submitting" | "success" | "error";

function ResetPasswordCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("form");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setStatus("error");
      setError("Missing reset token.");
      return;
    }
    setStatus("submitting");
    try {
      const accessToken = await resetPassword(token, password);
      localStorage.setItem("og_token", accessToken);
      setStatus("success");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (e: unknown) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Failed to reset password");
    }
  }

  const inputClass =
    "w-full px-3 py-2 text-sm border border-og-border-md dark:border-og-border bg-og-surface rounded-lg outline-hidden focus:border-og-accent focus:ring-2 focus:ring-og-accent/20 transition-all placeholder:text-gray-400 text-og-text";

  return (
    <div className="bg-og-surface rounded-2xl shadow-xl border border-og-border p-8 w-full max-w-sm">
      {status === "success" ? (
        <div className="text-center">
          <CheckCircleIcon size={28} className="text-emerald-500 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-og-text">Password updated</h1>
          <p className="text-sm text-gray-500 mt-2">Redirecting to your workspace…</p>
        </div>
      ) : !token ? (
        <div className="text-center">
          <WarningIcon size={28} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-og-text">Invalid reset link</h1>
          <p className="text-sm text-gray-500 mt-2">This link is missing its token.</p>
          <a href="/" className="inline-block mt-6 text-sm text-og-accent hover:underline">Back to sign in</a>
        </div>
      ) : (
        <>
          <div className="mb-6 text-center">
            <h1 className="text-lg font-semibold text-og-text">Choose a new password</h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-og-text mb-1">New password</label>
              <input
                id="new-password" type="password" autoComplete="new-password" required minLength={8}
                placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-gray-400 mt-1">Minimum 8 characters</p>
            </div>
            {status === "error" && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full py-2.5 px-4 bg-og-action hover:bg-og-action-dark text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === "submitting" ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Reset password <span aria-hidden>→</span></>
              )}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#dce8ec] dark:bg-og-bg og-grid-bg">
      <Suspense
        fallback={
          <div className="bg-og-surface rounded-2xl shadow-xl border border-og-border p-8 w-full max-w-sm text-center">
            <span className="inline-block w-8 h-8 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
          </div>
        }
      >
        <ResetPasswordCard />
      </Suspense>
    </div>
  );
}
