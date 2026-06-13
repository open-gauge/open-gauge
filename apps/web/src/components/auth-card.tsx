"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { login, register } from "@/services/auth.service";

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

  const switchTab = (t: Tab) => {
    setTab(t);
    setError(null);
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 w-full">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Access your workspace</h2>
        <p className="text-sm text-gray-500 mt-1">Authenticate to continue to the registry.</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
        <button
          type="button"
          onClick={() => switchTab("signin")}
          className={`flex-1 text-sm font-medium py-1.5 px-3 rounded-md transition-all ${
            tab === "signin"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchTab("register")}
          className={`flex-1 text-sm font-medium py-1.5 px-3 rounded-md transition-all ${
            tab === "register"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Create account
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {tab === "register" && (
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              placeholder="Jane Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#2f819b] focus:ring-2 focus:ring-[#2f819b]/20 transition-all placeholder:text-gray-400"
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="engineer@lab.io"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#2f819b] focus:ring-2 focus:ring-[#2f819b]/20 transition-all placeholder:text-gray-400"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            {tab === "signin" && (
              <a href="/auth/forgot-password" className="text-xs text-gray-400 hover:text-[#2f819b] transition-colors">
                Forgot?
              </a>
            )}
          </div>
          <input
            id="password"
            type="password"
            autoComplete={tab === "signin" ? "current-password" : "new-password"}
            required
            minLength={tab === "register" ? 8 : 1}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#2f819b] focus:ring-2 focus:ring-[#2f819b]/20 transition-all placeholder:text-gray-400"
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
          className="w-full py-2.5 px-4 bg-[#1b4f64] hover:bg-[#154050] text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              {tab === "signin" ? "Sign in" : "Create account"}
              <span aria-hidden>→</span>
            </>
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

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function SSOIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1" y="4" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6h3.5a1.5 1.5 0 0 1 0 3H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="5.5" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}
