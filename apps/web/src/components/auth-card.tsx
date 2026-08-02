"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { forgotPassword, login, register, resendVerification, setToken } from "@/services/auth.service";
import { EyeIcon, EyeOffIcon, MailIcon } from "@/components/icons";
import { ToggleSwitch } from "@/components/toggle-switch";

type Tab = "signin" | "register" | "forgot";

export default function AuthCard() {
  const t = useTranslations("auth.card");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (tab === "signin") {
        const token = await login(email, password);
        setToken(token, stayLoggedIn);
        router.push("/dashboard");
        return;
      }
      if (tab === "forgot") {
        await forgotPassword(email);
        setForgotSent(true);
        return;
      }
      const result = await register(email, name, password);
      setPendingMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unexpectedError"));
    } finally {
      setLoading(false);
    }
  };

  async function handleResend() {
    setResendState("sending");
    try {
      await resendVerification(email);
    } finally {
      setResendState("sent");
    }
  }

  const switchTab = (t: Tab) => {
    setTab(t);
    setError(null);
    setPendingMessage(null);
    setForgotSent(false);
  };

  if (pendingMessage) {
    return (
      <div className="bg-og-surface rounded-2xl shadow-xl border border-og-border p-8 w-full text-center">
        <MailIcon size={28} className="text-og-accent mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-og-text">{t("checkAccount")}</h2>
        <p className="text-sm text-gray-500 mt-2">{pendingMessage}</p>
        <button
          type="button"
          onClick={handleResend}
          disabled={resendState !== "idle"}
          className="mt-6 text-sm text-og-accent hover:underline disabled:opacity-60 disabled:no-underline"
        >
          {resendState === "sent" ? t("resendSent") : resendState === "sending" ? t("sending") : t("resendVerification")}
        </button>
      </div>
    );
  }

  const inputClass =
    "w-full px-3 py-2 text-sm border border-og-border-md dark:border-og-border bg-og-surface rounded-lg outline-hidden focus:border-og-accent focus:ring-2 focus:ring-og-accent/20 transition-all placeholder:text-gray-400 text-og-text";

  if (tab === "forgot") {
    return (
      <div className="bg-og-surface rounded-2xl shadow-xl border border-og-border p-8 w-full">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-og-text">{t("resetTitle")}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {t("resetDesc")}
          </p>
        </div>

        {forgotSent ? (
          <div className="text-center py-4">
            <MailIcon size={28} className="text-og-accent mx-auto mb-4" />
            <p className="text-sm text-gray-500">
              {t("resetSentMessage", { email })}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className="block text-sm font-medium text-og-text mb-1">{t("email")}</label>
              <input id="forgot-email" type="email" autoComplete="email" required placeholder={t("emailPlaceholder")}
                value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-og-action hover:bg-og-action-dark text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>{t("sendResetLink")} <span aria-hidden>→</span></>
              )}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => switchTab("signin")}
          className="mt-6 w-full text-center text-sm text-gray-400 hover:text-og-accent transition-colors"
        >
          {t("backToSignIn")}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-og-surface rounded-2xl shadow-xl border border-og-border p-8 w-full">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-og-text">{t("accessWorkspace")}</h2>
        <p className="text-sm text-gray-500 mt-1">{t("authenticateDesc")}</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-og-surface-alt rounded-lg p-1 mb-6 border border-og-border">
        {(["signin", "register"] as Tab[]).map((tabOption) => (
          <button
            key={tabOption}
            type="button"
            onClick={() => switchTab(tabOption)}
            className={`flex-1 text-sm font-medium py-1.5 px-3 rounded-md transition-all ${
              tab === tabOption
                ? "bg-og-surface text-og-text shadow-xs"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tabOption === "signin" ? t("signIn") : t("createAccount")}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {tab === "register" && (
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-og-text mb-1">{t("name")}</label>
            <input id="name" type="text" autoComplete="name" required placeholder={t("namePlaceholder")}
              value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-og-text mb-1">{t("email")}</label>
          <input id="email" type="email" autoComplete="email" required placeholder={t("emailPlaceholder")}
            value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="block text-sm font-medium text-og-text">{t("password")}</label>
            {tab === "signin" && (
              <button
                type="button"
                onClick={() => switchTab("forgot")}
                className="text-xs text-gray-400 hover:text-og-accent transition-colors"
              >
                {t("forgot")}
              </button>
            )}
          </div>
          <div className="relative">
            <input
              id="password" type={showPassword ? "text" : "password"}
              autoComplete={tab === "signin" ? "current-password" : "new-password"}
              required minLength={tab === "register" ? 8 : 1} placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} pr-9`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              {showPassword ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
            </button>
          </div>
          {tab === "register" && (
            <p className="text-xs text-gray-400 mt-1">{t("minChars")}</p>
          )}
          {tab === "signin" && (
            <label className="flex items-center gap-2 mt-3 text-xs text-gray-400">
              <ToggleSwitch checked={stayLoggedIn} onChange={setStayLoggedIn} />
              {t("stayLoggedIn")}
            </label>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-og-action hover:bg-og-action-dark text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>{tab === "signin" ? t("signIn") : t("createAccount")} <span aria-hidden>→</span></>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-gray-400">
        {t("agreePrefix")}{" "}
        <a href="/terms" className="underline hover:text-gray-600 dark:hover:text-gray-200 transition-colors">{t("termsLink")}</a>
        {" "}{t("agreeAnd")}{" "}
        <a href="/privacy" className="underline hover:text-gray-600 dark:hover:text-gray-200 transition-colors">{t("privacyLink")}</a>.
      </p>
    </div>
  );
}
