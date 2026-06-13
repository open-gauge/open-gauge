"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, authHeader } from "@/lib/api";
import { clearToken, getToken } from "@/services/auth.service";
import type { UserProfile } from "@/types/user";

interface AuthContextValue {
  user: UserProfile;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/");
      return;
    }

    apiFetch<UserProfile>("/api/v1/users/me", { headers: authHeader(token) })
      .then(setUser)
      .catch(() => {
        clearToken();
        router.replace("/");
      })
      .finally(() => setIsLoading(false));
  }, [router]);

  const logout = () => {
    clearToken();
    router.replace("/");
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <span className="inline-block w-6 h-6 border-2 border-mar-accent/30 border-t-mar-accent rounded-full animate-spin" />
          <span className="text-xs text-gray-400">Loading workspace…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
