/**
 * Shared SVG icon library for MAR.
 *
 * All icons accept a `size` prop (default 16) and an optional `className`.
 * They render with `currentColor` so colour is controlled by the parent via
 * a Tailwind `text-*` class (e.g. <SearchIcon className="text-gray-400" />).
 *
 * Rules:
 *  - Never define inline SVG icon functions in other components.
 *  - Always import from this file.
 *  - To add a new icon, add it here with the same interface.
 */

interface IconProps {
  size?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Navigation (sidebar)
// ---------------------------------------------------------------------------

export function DashboardIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function AssetRegistryIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="1" y="3" width="14" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="7.5" width="14" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="12" width="14" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function SitesIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M8 1v14M1 8h14M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Used for certificates, reports, and any document-style screen. */
export function DocumentIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Waveform / activity pulse. */
export function ActivityIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M1 8h2.5l2-5 3 10 2-6.5 1.5 1.5H15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ApiIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M4.5 6 2 8l2.5 2M11.5 6 14 8l-2.5 2M9 4l-2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SettingsIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06M12.95 12.95l-1.06-1.06M4.11 4.11 3.05 3.05" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Top-bar controls
// ---------------------------------------------------------------------------

export function SearchIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function BellIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M8 1a5 5 0 0 0-5 5v3l-1.5 2h13L13 9V6a5 5 0 0 0-5-5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.5 13a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function MoonIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function SignOutIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10 11l3-3-3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Dashboard stat cards
// ---------------------------------------------------------------------------

export function DatabaseIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <ellipse cx="8" cy="4" rx="6" ry="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 4v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 8v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function CheckCircleIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="m5 8 2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClockIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.5V8l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WarningIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M8 2 1.5 13.5h13L8 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 7v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Utility / misc
// ---------------------------------------------------------------------------

/** Small diagonal arrow — used as "open in new tab / view all" affordance. */
export function ExternalLinkIcon({ size = 10, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true" className={className}>
      <path d="M2 8 8 2M8 2H4M8 2v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Authentication / login page
// ---------------------------------------------------------------------------

export function GitBranchIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="5" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 5v4M5 5c0 0 0 1.5 1.5 2.5S11 7 11 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ShieldCheckIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M8 1.5 2.5 4v3.667C2.5 10.9 4.922 13.593 8 14.333c3.078-.74 5.5-3.433 5.5-6.666V4L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="m5.5 8 1.5 1.5 3.5-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GitHubIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function SSOIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="1" y="4" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6h3.5a1.5 1.5 0 0 1 0 3H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="5.5" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}
