"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  AssetRegistryIcon,
  BellIcon,
  SearchIcon,
  SignOutIcon,
  XIcon,
} from "@/components/icons";
import ThemeToggle from "@/components/theme-toggle";
import { listAssets } from "@/services/asset.service";
import type { AssetListItem } from "@/types/asset";

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin:      "Admin",
  technician: "Technician",
  viewer:     "Viewer",
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
  const router = useRouter();

  // Avatar dropdown
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  // Search
  const [query, setQuery] = useState("");
  const [allAssets, setAllAssets] = useState<AssetListItem[]>([]);
  const [results, setResults] = useState<AssetListItem[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close avatar dropdown on outside click
  useEffect(() => {
    if (!avatarOpen) return;
    const handler = (e: MouseEvent) => {
      if (!avatarRef.current?.contains(e.target as Node)) setAvatarOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [avatarOpen]);

  // Close search dropdown on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (!searchRef.current?.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);

  // Lazy-load assets on first focus
  async function handleFocus() {
    if (assetsLoaded) return;
    try {
      const data = await listAssets({ limit: 200 });
      setAllAssets(data);
    } catch {
      // silent
    } finally {
      setAssetsLoaded(true);
    }
  }

  // Filter on query or allAssets change
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearchOpen(false);
      return;
    }
    const q = query.toLowerCase();
    const filtered = allAssets
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.asset_id.toLowerCase().includes(q) ||
          (a.serial_number != null && a.serial_number.toLowerCase().includes(q))
      )
      .slice(0, 8);
    setResults(filtered);
    setSearchOpen(filtered.length > 0);
  }, [query, allAssets]);

  function handleSelect(asset: AssetListItem) {
    router.push(`/assets/${asset.id}`);
    setQuery("");
    setResults([]);
    setSearchOpen(false);
  }

  function clearSearch() {
    setQuery("");
    setResults([]);
    setSearchOpen(false);
    inputRef.current?.focus();
  }

  const initials = getInitials(user.name);

  return (
    <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 bg-mar-surface border-b border-mar-border gap-4">
      {/* Search (left) */}
      <div className="relative flex-1 max-w-sm" ref={searchRef}>
        <div className="flex items-center gap-2 w-full px-3 py-1.5 bg-mar-surface-alt border border-mar-border-md rounded-lg text-sm">
          <SearchIcon size={13} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={handleFocus}
            placeholder="Search assets..."
            className="flex-1 bg-transparent text-xs text-mar-text placeholder-gray-400 outline-none min-w-0"
          />
          {query ? (
            <button
              type="button"
              onClick={clearSearch}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex-shrink-0"
            >
              <XIcon size={12} />
            </button>
          ) : (
            <kbd className="text-[10px] text-gray-400 border border-mar-border-md rounded px-1 py-0.5 font-mono flex-shrink-0">
              ⌘K
            </kbd>
          )}
        </div>

        {/* Results dropdown */}
        {searchOpen && results.length > 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-mar-surface rounded-xl border border-mar-border shadow-lg z-50 overflow-hidden">
            {results.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => handleSelect(asset)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-mar-border transition-colors"
              >
                <AssetRegistryIcon size={13} className="text-gray-500 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-mar-text truncate">{asset.name}</div>
                  <div className="text-[10px] text-gray-400">{asset.asset_id}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions (right) */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors"
        >
          <span className="text-base leading-none">+</span>
          New Asset
        </button>

        <button
          type="button"
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          <BellIcon />
        </button>

        <ThemeToggle />

        {/* Avatar + dropdown */}
        <div className="relative" ref={avatarRef}>
          <button
            type="button"
            onClick={() => setAvatarOpen((v) => !v)}
            className="w-8 h-8 rounded-full bg-mar-accent flex items-center justify-center text-white text-xs font-semibold hover:bg-mar-accent-dark transition-colors focus:outline-none focus:ring-2 focus:ring-mar-accent/40"
            aria-haspopup="true"
            aria-expanded={avatarOpen}
          >
            {initials}
          </button>

          {avatarOpen && (
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
                  onClick={() => { setAvatarOpen(false); logout(); }}
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
