"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { BellIcon, SearchIcon, SignOutIcon } from "@/components/icons";
import ThemeToggle from "@/components/theme-toggle";

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin:      "Admin",
  technician: "Technician",
  viewer:     "Viewer",
};

const BREADCRUMBS: Record<string, string[]> = {
  "/dashboard":    ["Workspace", "Overview"],
  "/assets":       ["Workspace", "Assets"],
  "/sites":        ["Workspace", "Sites"],
  "/certificates": ["Workspace", "Certificates"],
  "/activity":     ["Workspace", "Activity"],
  "/api-explorer": ["System", "API Explorer"],
  "/settings":     ["System", "Settings"],
};

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default function TopBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const initials = getInitials(user.name);
  const breadcrumb = BREADCRUMBS[pathname] ?? ["Workspace"];

  return (
    <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 bg-mar-surface border-b border-mar-border">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs font-medium text-gray-400 tracking-wide uppercase">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300 dark:text-gray-600">/</span>}
            <span>{crumb}</span>
          </span>
        ))}
      </nav>

      {/* Search */}
      <div className="flex-1 max-w-md mx-8">
        <div className="flex items-center gap-2 w-full px-3 py-1.5 bg-mar-surface-alt border border-mar-border-md rounded-lg text-sm text-gray-400">
          <SearchIcon size={13} />
          <span className="flex-1 text-gray-400 text-xs">
            Search assets, certificates, serial numbers...
          </span>
          <kbd className="text-[10px] text-gray-400 border border-mar-border-md rounded px-1 py-0.5 font-mono">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors"
        >
          <span className="text-base leading-none">+</span>
          New Asset
        </button>

        <button type="button" className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
          <BellIcon />
        </button>

        <ThemeToggle />

        {/* Avatar + dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-8 h-8 rounded-full bg-mar-accent flex items-center justify-center text-white text-xs font-semibold hover:bg-mar-accent-dark transition-colors focus:outline-none focus:ring-2 focus:ring-mar-accent/40"
            aria-haspopup="true"
            aria-expanded={open}
          >
            {initials}
          </button>

          {open && (
            <div className="absolute right-0 top-10 w-56 bg-mar-surface rounded-xl border border-mar-border shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-mar-border">
                <p className="text-sm font-semibold text-mar-text leading-tight truncate">
                  {user.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{user.email}</p>
                <span className="inline-flex items-center mt-2 px-2 py-0.5 rounded text-[10px] font-medium bg-mar-accent/10 text-mar-action dark:text-mar-accent">
                  {ROLE_LABEL[user.role] ?? user.role}
                </span>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => { setOpen(false); logout(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-mar-border hover:text-red-500 transition-colors text-left"
                >
                  <SignOutIcon size={14} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
