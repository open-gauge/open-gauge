"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApiIcon, ChevronDownIcon } from "@/components/icons";
import { HTTP_METHOD_STYLE } from "@/lib/tokens";
import type { ApiNavGroup } from "@/lib/api-docs-source";

export function ApiNavTree({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const isActive = pathname === "/documentation/api" || pathname.startsWith("/documentation/api/");
  const [open, setOpen] = useState(isActive);
  const [groups, setGroups] = useState<ApiNavGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isActive) setOpen(true);
  }, [isActive]);

  useEffect(() => {
    if (!open || groups !== null || failed) return;
    fetch("/api/openapi-nav")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { groups: ApiNavGroup[] }) => {
        setGroups(data.groups);
        const activeGroup = data.groups.find((g) => g.items.some((i) => i.url === pathname));
        if (activeGroup) setOpenGroups(new Set([activeGroup.title]));
      })
      .catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggleGroup(title: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  if (collapsed) {
    return (
      <Link
        href="/documentation/api"
        title="API Reference"
        className={`flex items-center justify-center px-0 py-2 w-full rounded-md text-sm transition-colors ${
          isActive
            ? "bg-og-accent/10 text-og-accent font-medium dark:bg-white/10 dark:text-white"
            : "text-gray-500 hover:text-gray-800 hover:bg-og-border dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/5"
        }`}
      >
        <ApiIcon size={15} />
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm transition-colors ${
          isActive
            ? "bg-og-accent/10 text-og-accent font-medium dark:bg-white/10 dark:text-white"
            : "text-gray-500 hover:text-gray-800 hover:bg-og-border dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/5"
        }`}
      >
        <span className={`shrink-0 ${isActive ? "text-og-accent" : "text-gray-400 dark:text-gray-500"}`}>
          <ApiIcon size={15} />
        </span>
        <span className="flex-1 text-left whitespace-nowrap">API Reference</span>
        <ChevronDownIcon size={12} className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>

      {open && (
        <ul className="mt-0.5 ml-4 border-l border-og-border pl-2 space-y-0.5">
          {failed && (
            <li className="px-2 py-1.5 text-[11px] text-gray-400">Couldn&apos;t load the API reference.</li>
          )}
          {!failed && groups === null && (
            <li className="px-2 py-1.5 text-[11px] text-gray-400">Loading…</li>
          )}
          {groups?.map((group) => {
            const groupOpen = openGroups.has(group.title);
            return (
              <li key={group.title}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-xs text-gray-600 dark:text-gray-300 hover:bg-og-border dark:hover:bg-white/5 transition-colors whitespace-nowrap"
                >
                  <ChevronDownIcon size={10} className={`shrink-0 transition-transform ${groupOpen ? "" : "-rotate-90"}`} />
                  <span className="truncate">{group.title}</span>
                </button>
                {groupOpen && (
                  <ul className="ml-3 border-l border-og-border pl-2 space-y-0.5">
                    {group.items.map((item) => {
                      const active = pathname === item.url;
                      return (
                        <li key={item.url}>
                          <Link
                            href={item.url}
                            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
                              active
                                ? "text-og-accent font-medium bg-og-accent/10"
                                : "text-gray-500 hover:text-gray-800 hover:bg-og-border dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/5"
                            }`}
                          >
                            <span className="truncate">{item.title}</span>
                            {item.method && (
                              <span
                                className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide ${
                                  HTTP_METHOD_STYLE[item.method.toUpperCase()] ?? "bg-gray-100 text-gray-500"
                                }`}
                              >
                                {item.method.toUpperCase()}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
