import type { Metadata } from "next";
import Image from "next/image";
import AuthCard from "@/components/auth-card";
import ParticleBackground from "@/components/particle-background";
import ThemeToggle from "@/components/theme-toggle";
import {
  ActivityIcon,
  GitBranchIcon,
  ShieldCheckIcon,
} from "@/components/icons";

export const metadata: Metadata = {
  title: "Open Gauge — Open Gauge",
  description:
    "Version control for metrology. Manage sensors, calibration coefficients, and traceable certificates in one auditable registry.",
};

export default function LoginPage() {
  return (
    <div className="relative min-h-screen bg-[#dce8ec] dark:bg-og-bg og-grid-bg">
      <ParticleBackground />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Nav */}
        <nav className="flex items-center justify-between px-8 py-5">
          <div className="flex items-center gap-2.5">
            <>
              {/* Light mode logo */}
              <Image
                src="/assets/Logo dark.png"
                alt="Open Gauge icon"
                width={300}
                height={100}
                priority
                className="block dark:hidden"
              />

              {/* Dark mode logo */}
              <Image
                src="/assets/Logo light.png"
                alt="Open Gauge icon"
                width={300}
                height={100}
                priority
                className="hidden dark:block"
              />
            </>
            <span className="text-gray-400 text-sm select-none">/</span>
          </div>
          <ThemeToggle />
        </nav>

        {/* Main content */}
        <main className="flex-1 flex items-center justify-between gap-16 px-8 py-8 max-w-6xl mx-auto w-full">
          {/* Left: marketing copy */}
          <div className="flex-1 space-y-7">
            {/* Status badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/60 dark:bg-og-action/30 backdrop-blur-xs rounded-full text-xs text-gray-600 dark:text-gray-300 border border-white/80 dark:border-white/10 shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              v1.0.0 · self-hosted
            </div>

            {/* Headline */}
            <div>
              <h1 className="text-5xl font-bold text-og-text leading-[1.1] tracking-tight">
                Version control
              </h1>
              <h1 className="text-5xl font-bold text-og-accent leading-[1.1] tracking-tight">
                for metrology.
              </h1>
            </div>

            {/* Subtitle */}
            <p className="text-gray-500 dark:text-gray-400 text-base leading-relaxed max-w-[420px]">
              Sign in to your workspace to manage sensors, calibration
              coefficients, and traceable certificates — all in one auditable
              registry.
            </p>

            {/* Feature list */}
            <ul className="space-y-3.5">
              <li className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                <GitBranchIcon size={16} className="text-og-accent shrink-0" />
                Git-style history for every coefficient change
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                <ShieldCheckIcon size={16} className="text-og-accent shrink-0" />
                Cryptographically signed calibration certificates
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                <ActivityIcon size={16} className="text-og-accent shrink-0" />
                Live telemetry &amp; drift monitoring
              </li>
            </ul>
          </div>

          {/* Right: auth card */}
          <div className="w-[420px] shrink-0">
            <AuthCard />
          </div>
        </main>

        {/* Footer */}
        <footer className="flex items-center justify-between px-8 py-4 text-xs text-gray-400">
          <span>© 2026 Open Gauge · self-hosted edition</span>
          <div className="flex items-center gap-4">
            <a href="/terms" className="hover:text-og-accent transition-colors">Terms of Service</a>
            <a href="/privacy" className="hover:text-og-accent transition-colors">Privacy Policy</a>
            <span>build c8f1e2a · region eu-west</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
