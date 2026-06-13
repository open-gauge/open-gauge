"use client";

interface TopBarProps {
  breadcrumb?: string[];
}

export default function TopBar({ breadcrumb = [] }: TopBarProps) {
  return (
    <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs font-medium text-gray-400 tracking-wide uppercase">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300">/</span>}
            <span>{crumb}</span>
          </span>
        ))}
      </nav>

      {/* Search */}
      <div className="flex-1 max-w-md mx-8">
        <div className="flex items-center gap-2 w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-400">
          <SearchIcon />
          <span className="flex-1 text-gray-400 text-xs">
            Search assets, certificates, serial numbers...
          </span>
          <kbd className="text-[10px] text-gray-300 border border-gray-200 rounded px-1 py-0.5 font-mono">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1b4f64] hover:bg-[#154050] text-white text-xs font-medium rounded-lg transition-colors"
        >
          <span className="text-base leading-none">+</span>
          New Asset
        </button>

        <button type="button" className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
          <BellIcon />
        </button>

        <button type="button" className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
          <MoonIcon />
        </button>

        <div className="w-8 h-8 rounded-full bg-[#2f819b] flex items-center justify-center text-white text-xs font-semibold">
          AL
        </div>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1a5 5 0 0 0-5 5v3l-1.5 2h13L13 9V6a5 5 0 0 0-5-5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.5 13a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
