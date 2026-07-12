import { InfoIcon } from "@/components/icons";

// Shown once, at the top of the app shell (see (app)/layout.tsx), only when the app is built
// with NEXT_PUBLIC_DEMO_MODE=true. Purely informational — no interactivity, so no "use client".
export default function DemoBanner() {
  return (
    <div className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 bg-og-accent/10 border-b border-og-border text-xs text-og-text">
      <InfoIcon size={13} className="text-og-accent shrink-0" />
      <span>
        You&apos;re viewing a live demo of Open Gauge with fictional data — nothing you do here is saved.{" "}
        <a
          href="https://opengauge.org"
          target="_blank"
          rel="noreferrer"
          className="text-og-accent font-medium hover:underline"
        >
          opengauge.org
        </a>
        {" · "}
        <a
          href="https://github.com/open-gauge/open-gauge"
          target="_blank"
          rel="noreferrer"
          className="text-og-accent font-medium hover:underline"
        >
          View on GitHub
        </a>
      </span>
    </div>
  );
}
