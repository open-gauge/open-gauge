import { getTranslations } from "next-intl/server";
import { InfoIcon } from "@/components/icons";

// Shown once, at the top of the app shell (see (app)/layout.tsx), only when the app is built
// with NEXT_PUBLIC_DEMO_MODE=true. Purely informational — no interactivity, so no "use client".
export default async function DemoBanner() {
  const t = await getTranslations("common.demoBanner");
  return (
    <div className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 bg-og-accent/10 border-b border-og-border text-xs text-og-text">
      <InfoIcon size={13} className="text-og-accent shrink-0" />
      <span>
        {t("message")}{" "}
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
          {t("viewOnGithub")}
        </a>
      </span>
    </div>
  );
}
