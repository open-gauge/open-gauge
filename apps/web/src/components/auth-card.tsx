"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { login, register } from "@/services/auth.service";
import { GitHubIcon, SSOIcon } from "@/components/icons";

type Tab = "signin" | "register";

export default function AuthCard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token =
        tab === "signin"
          ? await login(email, password)
          : await register(email, name, password);
      localStorage.setItem("mar_token", token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (t: Tab) => { setTab(t); setError(null); };

  const inputClass =
    "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-mar-accent focus:ring-2 focus:ring-mar-accent/20 transition-all placeholder:text-gray-400";

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 w-full">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Access your workspace</h2>
        <p className="text-sm text-gray-500 mt-1">Authenticate to continue to the registry.</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
        {(["signin", "register"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            className={`flex-1 text-sm font-medium py-1.5 px-3 rounded-md transition-all ${
              tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {tab === "register" && (
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input id="name" type="text" autoComplete="name" required placeholder="Jane Smith"
              value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input id="email" type="email" autoComplete="email" required placeholder="engineer@lab.io"
            value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
            {tab === "signin" && (
              <a href="/auth/forgot-password" className="text-xs text-gray-400 hover:text-mar-accent transition-colors">
                Forgot?
              </a>
            )}
          </div>
          <input
            id="password" type="password"
            autoComplete={tab === "signin" ? "current-password" : "new-password"}
            required minLength={tab === "register" ? 8 : 1} placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass}
          />
          {tab === "register" && (
            <p className="text-xs text-gray-400 mt-1">Minimum 8 characters</p>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-mar-action hover:bg-mar-action-dark text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>{tab === "signin" ? "Sign in" : "Create account"} <span aria-hidden>→</span></>
          )}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-400 font-medium tracking-wide">OR CONTINUE WITH</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => alert("GitHub OAuth not configured in this deployment.")}
          className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <GitHubIcon />
          GitHub
        </button>
        <button
          type="button"
          onClick={() => alert("SSO / SAML not configured in this deployment.")}
          className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <SSOIcon />
          SSO / SAML
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        By continuing you agree to the{" "}
        <a href="#" className="underline hover:text-gray-600 transition-colors">Terms</a>
        {" "}and{" "}
        <a href="#" className="underline hover:text-gray-600 transition-colors">Privacy Policy</a>.
      </p>
    </div>
  );
}
