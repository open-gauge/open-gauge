"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ActivityIcon,
  ApiIcon,
  AssetRegistryIcon,
  DashboardIcon,
  DocumentIcon,
  SettingsIcon,
  SitesIcon,
} from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const WORKSPACE_NAV: NavItem[] = [
  { href: "/dashboard",    label: "Dashboard",      icon: <DashboardIcon size={15} /> },
  { href: "/assets",       label: "Asset Registry", icon: <AssetRegistryIcon size={15} /> },
  { href: "/sites",        label: "Projects & Sites", icon: <SitesIcon size={15} /> },
  { href: "/certificates", label: "Certificates",   icon: <DocumentIcon size={15} /> },
  { href: "/activity",     label: "Activity",       icon: <ActivityIcon size={15} /> },
];

const SYSTEM_NAV: NavItem[] = [
  { href: "/api-explorer", label: "API Explorer", icon: <ApiIcon size={15} /> },
  { href: "/settings",     label: "Settings",     icon: <SettingsIcon size={15} /> },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col h-full bg-mar-bg">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/5">
        <Link href="/dashboard" className="block">
          <Image src="/assets/Logo light.svg" alt="MAR" height={35} priority />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-5 overflow-y-auto">
        <div>
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            Workspace
          </p>
          <ul className="space-y-0.5">
            {WORKSPACE_NAV.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={pathname === item.href} />
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            System
          </p>
          <ul className="space-y-0.5">
            {SYSTEM_NAV.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={pathname === item.href} />
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <p className="text-[11px] text-gray-600">v1.0.0 · self-hosted</p>
      </div>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
        active
          ? "bg-white/10 text-white font-medium"
          : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
      }`}
    >
      <span className={active ? "text-mar-accent" : "text-gray-500"}>{item.icon}</span>
      {item.label}
    </Link>
  );
}
