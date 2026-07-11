"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  AssetRegistryIcon,
  ChevronDownIcon,
  DocumentIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SignOutIcon,
  XIcon,
} from "@/components/icons";
import ThemeToggle from "@/components/theme-toggle";
import { Avatar } from "@/components/avatar";
import { listAssets } from "@/services/asset.service";
import type { AssetListItem } from "@/types/asset";

interface DocSearchResult {
  id: string;
  url: string;
  type: "page" | "heading" | "text";
  content: string;
}

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin:      "Admin",
  technician: "Technician",
  viewer:     "Viewer",
};

export default function TopBar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  // Avatar dropdown
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  // + New dropdown
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

  // Search
  const [query, setQuery] = useState("");
  const [allAssets, setAllAssets] = useState<AssetListItem[]>([]);
  const [results, setResults] = useState<AssetListItem[]>([]);
  const [docResults, setDocResults] = useState<DocSearchResult[]>([]);
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

  // Close + New dropdown on outside click
  useEffect(() => {
    if (!newMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!newMenuRef.current?.contains(e.target as Node)) setNewMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [newMenuOpen]);

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

  // Filter assets on query or allAssets change
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

  // Search documentation content (debounced)
  useEffect(() => {
    if (!query.trim()) {
      setDocResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/docs-search?query=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: DocSearchResult[]) => {
          setDocResults(data.slice(0, 5));
          if (data.length > 0) setSearchOpen(true);
        })
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  function handleSelect(asset: AssetListItem) {
    router.push(`/assets/${asset.id}`);
    setQuery("");
    setResults([]);
    setDocResults([]);
    setSearchOpen(false);
  }

  function handleSelectDoc(doc: DocSearchResult) {
    router.push(doc.url);
    setQuery("");
    setResults([]);
    setDocResults([]);
    setSearchOpen(false);
  }

  function clearSearch() {
    setQuery("");
    setResults([]);
    setDocResults([]);
    setSearchOpen(false);
    inputRef.current?.focus();
  }

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-6 bg-og-surface border-b border-og-border gap-4">
      {/* Search (left) */}
      <div className="relative flex-1 max-w-sm" ref={searchRef}>
        <div className="flex items-center gap-2 w-full px-3 py-1.5 bg-og-surface-alt border border-og-border-md rounded-lg text-sm">
          <SearchIcon size={13} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={handleFocus}
            placeholder="Search assets & docs..."
            className="flex-1 bg-transparent text-xs text-og-text placeholder-gray-400 outline-hidden min-w-0"
          />
          {query ? (
            <button
              type="button"
              onClick={clearSearch}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0"
            >
              <XIcon size={12} />
            </button>
          ) : (
            <kbd className="text-[10px] text-gray-400 border border-og-border-md rounded-sm px-1 py-0.5 font-mono shrink-0">
              ⌘K
            </kbd>
          )}
        </div>

        {/* Results dropdown */}
        {searchOpen && (results.length > 0 || docResults.length > 0) && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-og-surface rounded-xl border border-og-border shadow-lg z-50 overflow-hidden max-h-96 overflow-y-auto">
            {results.length > 0 && (
              <div className="py-1">
                <p className="px-4 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Assets</p>
                {results.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => handleSelect(asset)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-og-border transition-colors"
                  >
                    <AssetRegistryIcon size={13} className="text-gray-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-og-text truncate">{asset.name}</div>
                      <div className="text-[10px] text-gray-400">{asset.asset_id}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {docResults.length > 0 && (
              <div className="py-1 border-t border-og-border">
                <p className="px-4 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Documentation</p>
                {docResults.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => handleSelectDoc(doc)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-og-border transition-colors"
                  >
                    <DocumentIcon size={13} className="text-gray-500 shrink-0" />
                    <div className="min-w-0">
                      <div
                        className="text-xs font-medium text-og-text truncate [&_mark]:bg-og-accent/20 [&_mark]:text-og-accent [&_mark]:rounded-sm"
                        // Own search index content (fumadocs' highlighter output), not user input — safe to render.
                        dangerouslySetInnerHTML={{ __html: doc.content }}
                      />
                      <div className="text-[10px] text-gray-400 truncate">{doc.url}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions (right) */}
      <div className="flex items-center gap-3">
        <div className="relative" ref={newMenuRef}>
          <button
            type="button"
            onClick={() => setNewMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors"
          >
            <PlusIcon size={13} />
            New
            <ChevronDownIcon size={11} />
          </button>
          {newMenuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-og-surface border border-og-border rounded-lg shadow-lg z-50 py-1 min-w-[150px]">
              <button
                type="button"
                onClick={() => { setNewMenuOpen(false); router.push("/assets?new=1"); }}
                className="w-full text-left px-3 py-2 text-xs text-og-text hover:bg-og-surface-alt transition-colors"
              >
                New Asset
              </button>
              <button
                type="button"
                onClick={() => { setNewMenuOpen(false); router.push("/procedures?new=1"); }}
                className="w-full text-left px-3 py-2 text-xs text-og-text hover:bg-og-surface-alt transition-colors"
              >
                New Procedure
              </button>
            </div>
          )}
        </div>

        <ThemeToggle />

        {/* Avatar + dropdown */}
        <div className="relative" ref={avatarRef}>
          <button
            type="button"
            onClick={() => setAvatarOpen((v) => !v)}
            className="rounded-full transition-colors focus:outline-hidden focus:ring-2 focus:ring-og-accent/40"
            aria-haspopup="true"
            aria-expanded={avatarOpen}
          >
            <Avatar name={user.name} pictureUrl={user.profile_picture_url} size={32} />
          </button>

          {avatarOpen && (
            <div className="absolute right-0 top-10 w-56 bg-og-surface rounded-xl border border-og-border shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-og-border">
                <p className="text-sm font-semibold text-og-text leading-tight truncate">
                  {user.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{user.email}</p>
                <span className="inline-flex items-center mt-2 px-2 py-0.5 rounded-sm text-[10px] font-medium bg-og-accent/10 text-og-action dark:text-og-accent">
                  {ROLE_LABEL[user.role] ?? user.role}
                </span>
              </div>

              <div className="py-1">
                {(user.is_superuser || user.role === "superadmin" || user.role === "admin") && (
                  <button
                    type="button"
                    onClick={() => { setAvatarOpen(false); router.push("/admin"); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-og-border hover:text-og-text transition-colors text-left"
                  >
                    <ShieldCheckIcon size={14} />
                    Admin Panel
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setAvatarOpen(false); router.push("/settings"); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-og-border hover:text-og-text transition-colors text-left"
                >
                  <SettingsIcon size={14} />
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => { setAvatarOpen(false); logout(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-og-border hover:text-red-500 transition-colors text-left"
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
