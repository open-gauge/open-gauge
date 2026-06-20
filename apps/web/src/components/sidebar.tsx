"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ActivityIcon,
  ApiIcon,
  AssetRegistryIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DashboardIcon,
  DocumentIcon,
  MapPinIcon,
  SettingsIcon,
} from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const WORKSPACE_NAV: NavItem[] = [
  { href: "/dashboard",    label: "Dashboard",        icon: <DashboardIcon size={15} /> },
  { href: "/assets",       label: "Asset Registry",   icon: <AssetRegistryIcon size={15} /> },
  { href: "/sites",        label: "Locations",        icon: <MapPinIcon size={15} /> },
  { href: "/certificates", label: "Certificates",     icon: <DocumentIcon size={15} /> },
  { href: "/activity",     label: "Activity",         icon: <ActivityIcon size={15} /> },
];

const SYSTEM_NAV: NavItem[] = [
  { href: "/api-explorer", label: "API Explorer", icon: <ApiIcon size={15} /> },
  { href: "/settings",     label: "Settings",     icon: <SettingsIcon size={15} /> },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("mar_sidebar_collapsed");
    if (saved !== null) setCollapsed(saved === "true");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("mar_sidebar_collapsed", String(next));
  }

  return (
    <aside
      className={`flex-shrink-0 flex flex-col h-full bg-mar-surface border-r border-mar-border transition-all duration-300 ease-in-out overflow-hidden ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      {/* Logo */}
      <div
        className={`border-b border-mar-border flex items-center flex-shrink-0 ${
          collapsed ? "justify-center py-4 px-0" : "px-4 py-4"
        }`}
      >
        <Link href="/dashboard" className="block flex-shrink-0">
          {collapsed ? (
            <Image
              src="/assets/Icon.svg"
              alt="MAR"
              width={28}
              height={28}
              priority
            />
          ) : (
            <>
              {/* Light mode: use dark logo (dark text on light bg) */}
              <Image
                src="/assets/Logo dark.svg"
                alt="MAR"
                width={0}
                height={0}
                sizes="168px"
                style={{ width: "60%", height: "auto" }}
                priority
                className="block dark:hidden"
              />
              {/* Dark mode: use light logo (light text on dark bg) */}
              <Image
                src="/assets/Logo light.svg"
                alt="MAR"
                width={0}
                height={0}
                sizes="168px"
                style={{ width: "60%", height: "auto" }}
                priority
                className="hidden dark:block"
              />
            </>
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto overflow-x-hidden">
        {/* Workspace */}
        <div className={collapsed ? "mb-3" : "mb-5"}>
          {!collapsed && (
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 whitespace-nowrap">
              Workspace
            </p>
          )}
          <ul className="space-y-0.5">
            {WORKSPACE_NAV.map((item) => (
              <li key={item.href}>
                <NavLink
                  item={item}
                  active={
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/")
                  }
                  collapsed={collapsed}
                />
              </li>
            ))}
          </ul>
        </div>

        {/* System */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 whitespace-nowrap">
              System
            </p>
          )}
          <ul className="space-y-0.5">
            {SYSTEM_NAV.map((item) => (
              <li key={item.href}>
                <NavLink
                  item={item}
                  active={pathname === item.href}
                  collapsed={collapsed}
                />
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Footer */}
      <div
        className={`border-t border-mar-border flex items-center flex-shrink-0 ${
          collapsed ? "justify-center px-2 py-3" : "justify-between px-3 py-3"
        }`}
      >
        {!collapsed && (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <p className="text-[11px] text-gray-400 whitespace-nowrap">v1.0.0 · self-hosted</p>
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-mar-border transition-colors flex-shrink-0"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRightIcon size={14} /> : <ChevronLeftIcon size={14} />}
        </button>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={`flex items-center rounded-md text-sm transition-colors whitespace-nowrap ${
        collapsed ? "justify-center px-0 py-2 w-full" : "gap-2.5 px-3 py-2"
      } ${
        active
          ? "bg-mar-accent/10 text-mar-accent font-medium dark:bg-white/10 dark:text-white"
          : "text-gray-500 hover:text-gray-800 hover:bg-mar-border dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/5"
      }`}
    >
      <span
        className={`flex-shrink-0 ${
          active
            ? "text-mar-accent"
            : "text-gray-400 dark:text-gray-500"
        }`}
      >
        {item.icon}
      </span>
      {!collapsed && item.label}
    </Link>
  );
}
