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
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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

export function SunIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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

// ---------------------------------------------------------------------------
// Asset registry toolbar
// ---------------------------------------------------------------------------

export function QrCodeIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="1" y="1" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="10" y="1" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="10" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2.5" y="2.5" width="2" height="2" fill="currentColor" />
      <rect x="11.5" y="2.5" width="2" height="2" fill="currentColor" />
      <rect x="2.5" y="11.5" width="2" height="2" fill="currentColor" />
      <path d="M10 10h1.5M13.5 10H15M10 12.5h2.5M12.5 12.5V15M15 12.5V15M10 15h1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function DownloadIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function FilterIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M1.5 4h13M4 8h8M6.5 12h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ListViewIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="2.5" cy="4" r="1" fill="currentColor" />
      <circle cx="2.5" cy="8" r="1" fill="currentColor" />
      <circle cx="2.5" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function GridViewIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sort indicators
// ---------------------------------------------------------------------------

export function ChevronUpIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M3 10.5L8 5.5L13 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M3 5.5L8 10.5L13 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M10.5 3L5.5 8L10.5 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M5.5 3L10.5 8L5.5 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EditIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M11 2.5a1.5 1.5 0 0 1 2.5 1.5L5 12.5 2 13.5l1-3L11 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function MapPinIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5C12.5 9.5 8 14.5 8 14.5S3.5 9.5 3.5 6A4.5 4.5 0 0 1 8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="8" cy="6" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function InfoIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="5.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

export function ShareIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="13" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="13" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="3" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.4 7.2 11.6 3.8M4.4 8.8l7.2 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="5.5" cy="9.5" r="0.8" fill="currentColor" />
      <circle cx="8" cy="9.5" r="0.8" fill="currentColor" />
      <circle cx="10.5" cy="9.5" r="0.8" fill="currentColor" />
      <circle cx="5.5" cy="12" r="0.8" fill="currentColor" />
      <circle cx="8" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}

export function PlusIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M2.5 4.5h11M6 4.5V3h4v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 4.5l.8 8.5h6.4L12 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function XIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CopyIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 5V3.5A1.5 1.5 0 0 0 8.5 2h-5A1.5 1.5 0 0 0 2 3.5v7A1.5 1.5 0 0 0 3.5 12H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Location hierarchy tree
// ---------------------------------------------------------------------------

/** Top-level organisation node in the location tree. */
export function LocationOrgIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Site node — building outline. */
export function LocationSiteIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M2 14V7l6-5 6 5v7H2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="6" y="9" width="4" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** Laboratory node — flask outline. */
export function LocationLabIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M5.5 1.5h5M6 1.5v5.5L2.5 13.5h11L10 7V1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5.5" cy="11" r="0.75" fill="currentColor" />
      <circle cx="8" cy="12" r="0.75" fill="currentColor" />
    </svg>
  );
}

/** Building — tall rectangle with window grid and door. */
export function LocationBuildingIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="2.5" y="1.5" width="11" height="13" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 5h2M9 5h2M5 8h2M9 8h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="6" y="11" width="4" height="3.5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

/** Office — briefcase shape. */
export function LocationOfficeIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="1.5" y="6" width="13" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 6V4.5a1.5 1.5 0 011.5-1.5h2a1.5 1.5 0 011.5 1.5V6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M1.5 9.5h13" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Production — gear / cog with center circle. */
export function LocationProductionIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1.5V4M8 12v2.5M1.5 8H4M12 8h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3.5 3.5l1.7 1.7M10.8 10.8l1.7 1.7M3.5 12.5l1.7-1.7M10.8 5.2l1.7-1.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Industrial process — two tanks connected by a horizontal pipe. */
export function LocationIndustrialIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="1.5" y="5" width="4.5" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="10" y="3" width="4.5" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3.75 5V3M12.25 3V1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Test facility — clipboard with a checkmark. */
export function LocationTestIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="2.5" y="1.5" width="11" height="13" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 1.5v2.5h4V1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M5.5 9.5l2 2L11 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Field — pine tree (triangle crown + trunk). */
export function LocationFieldIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M8 1.5L2.5 9.5H6V14h4V9.5h3.5L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/** Vehicle — car side profile with two wheels. */
export function LocationVehicleIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M1 9V7l3-3h8l3 3v2H1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="4.5" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.5" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** Storage — isometric box / crate outline. */
export function LocationStorageIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M2 5.5l6-4 6 4v6l-6 3.5L2 11.5V5.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 1.5V8M2 5.5l6 2.5M14 5.5L8 8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** External — arrow leaving a box (external-link pattern). */
export function LocationExternalIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M9 2h5v5M14 2l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 4H4a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Other — question mark inside a circle. */
export function LocationOtherIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 6.5C6 5.4 6.9 4.5 8 4.5s2 .9 2 2c0 .9-.5 1.5-1.5 2-.3.2-.5.5-.5.8V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="12.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

export function UsersIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M15 14c0-2.21-1.34-4.1-3.25-4.88" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function BuildingIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 14V9h4v5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 5.5h1.5M9.5 5.5H11M5 7.5h1.5M9.5 7.5H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

/** Clipboard with numbered steps — sidebar nav icon for Procedures. */
export function ProceduresIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="2.5" y="2" width="11" height="12.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 2V4.5M10 2V4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M5 7h6M5 9.5h6M5 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Fork / branch — two branches from a single stem. */
export function ForkIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="8" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="3.5" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12.5" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.5 4.5V7c0 1.5 1.5 2 4.5 2s4.5-.5 4.5-2V4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 9v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Printer — rectangle body with tray and paper. */
export function PrinterIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <rect x="3.5" y="6" width="9" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 6V3h6v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10h6M5 12.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="11.5" cy="8.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

/** Play triangle — run / execute action. */
export function PlayIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M4 2.5l9 5.5-9 5.5V2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/** Shield — safety / warning section header. */
export function ShieldIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M8 1.5 2.5 4v3.667C2.5 10.9 4.922 13.593 8 14.333c3.078-.74 5.5-3.433 5.5-6.666V4L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// File upload
// ---------------------------------------------------------------------------

/** Cloud with upward arrow — drag-and-drop upload zone icon. */
export function UploadCloudIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M10.5 10.5a3 3 0 1 0-5 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 3v7M5.5 5.5 8 3l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 13h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Paperclip — attach file to a step. */
export function PaperclipIcon({ size = 16, className }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M13 7.5 7 13.5a3.5 3.5 0 0 1-4.95-4.95L8 2.88A2.12 2.12 0 0 1 11 5.88L5.05 11.83a.7.7 0 0 1-.99-.99L9.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

