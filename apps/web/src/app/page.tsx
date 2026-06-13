import type { Metadata } from "next";
import Image from "next/image";
import AuthCard from "@/components/auth-card";
import ParticleBackground from "@/components/particle-background";

export const metadata: Metadata = {
  title: "MAR — Measurement Asset Registry",
  description:
    "Version control for metrology. Manage sensors, calibration coefficients, and traceable certificates in one auditable registry.",
};

export default function LoginPage() {
  return (
    <div className="relative min-h-screen" style={{ backgroundColor: "#dce8ec" }}>
      <ParticleBackground />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Nav */}
        <nav className="flex items-center justify-between px-8 py-5">
          <div className="flex items-center gap-2.5">
            <Image
              src="/assets/Logo dark.svg"
              alt="MAR icon"
              height={35}
              priority
            />
            <span className="text-gray-400 text-sm select-none">/</span>
            <span className="text-sm text-gray-500">Measurement Asset Registry</span>
          </div>
          <a
            href="#"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← back to marketing
          </a>
        </nav>

        {/* Main content */}
        <main className="flex-1 flex items-center justify-between gap-16 px-8 py-8 max-w-6xl mx-auto w-full">
          {/* Left: marketing copy */}
          <div className="flex-1 space-y-7">
            {/* Status badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/60 backdrop-blur-sm rounded-full text-xs text-gray-600 border border-white/80 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              registry online · v0.4.2
            </div>

            {/* Headline */}
            <div>
              <h1 className="text-5xl font-bold text-[#152330] leading-[1.1] tracking-tight">
                Version control
              </h1>
              <h1 className="text-5xl font-bold text-[#2f819b] leading-[1.1] tracking-tight">
                for metrology.
              </h1>
            </div>

            {/* Subtitle */}
            <p className="text-gray-500 text-base leading-relaxed max-w-[420px]">
              Sign in to your workspace to manage sensors, calibration
              coefficients, and traceable certificates — all in one auditable
              registry.
            </p>

            {/* Feature list */}
            <ul className="space-y-3.5">
              <li className="flex items-center gap-3 text-sm text-gray-600">
                <GitBranchIcon />
                Git-style history for every coefficient change
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-600">
                <ShieldCheckIcon />
                Cryptographically signed calibration certificates
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-600">
                <ActivityIcon />
                Live telemetry &amp; drift monitoring
              </li>
            </ul>

            {/* CLI snippet */}
            <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#152330] rounded-lg text-xs font-mono text-gray-300 shadow-md">
              <span className="text-[#2f819b] select-none">$</span>
              mar auth login --org acme-metrology
            </div>
          </div>

          {/* Right: auth card */}
          <div className="w-[420px] flex-shrink-0">
            <AuthCard />
          </div>
        </main>

        {/* Footer */}
        <footer className="flex items-center justify-between px-8 py-4 text-xs text-gray-400">
          <span>© 2026 MAR · self-hosted edition</span>
          <span>build c8f1e2a · region eu-west</span>
        </footer>
      </div>
    </div>
  );
}

function GitBranchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="text-[#2f819b] flex-shrink-0"
    >
      <circle cx="5" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5 5v4M5 5c0 0 0 1.5 1.5 2.5S11 7 11 7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="text-[#2f819b] flex-shrink-0"
    >
      <path
        d="M8 1.5 2.5 4v3.667C2.5 10.9 4.922 13.593 8 14.333c3.078-.74 5.5-3.433 5.5-6.666V4L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="m5.5 8 1.5 1.5 3.5-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="text-[#2f819b] flex-shrink-0"
    >
      <path
        d="M1 8h2.5l2-5 3 10 2-6.5 1.5 1.5H15"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
