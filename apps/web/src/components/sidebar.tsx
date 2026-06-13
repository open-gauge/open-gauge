"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const WORKSPACE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { href: "/assets", label: "Asset Registry", icon: <AssetIcon /> },
  { href: "/sites", label: "Projects & Sites", icon: <SitesIcon /> },
  { href: "/certificates", label: "Certificates", icon: <CertIcon /> },
  { href: "/activity", label: "Activity", icon: <ActivityIcon /> },
];

const SYSTEM_NAV: NavItem[] = [
  { href: "/api-explorer", label: "API Explorer", icon: <ApiIcon /> },
  { href: "/settings", label: "Settings", icon: <SettingsIcon /> },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col h-full bg-[#0f1c26]">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/5">
        <Link href="/dashboard" className="block">
          <Image
            src="/assets/Logo light.svg"
            alt="MAR"
            width={80}
            priority
          />
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
        <p className="text-[11px] text-gray-600">v1.4.2 · self-hosted</p>
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
      <span className={active ? "text-[#2f819b]" : "text-gray-500"}>{item.icon}</span>
      {item.label}
    </Link>
  );
}

function DashboardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function AssetIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="7.5" width="14" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="12" width="14" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function SitesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M8 1v14M1 8h14M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M1 8h2.5l2-5 3 10 2-6.5 1.5 1.5H15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ApiIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M4.5 6 2 8l2.5 2M11.5 6 14 8l-2.5 2M9 4l-2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06M12.95 12.95l-1.06-1.06M4.11 4.11 3.05 3.05" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
