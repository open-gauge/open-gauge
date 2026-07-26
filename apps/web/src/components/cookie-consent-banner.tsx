"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { hasOptOutSignal, setStoredConsent } from "@/lib/consent";
import { useConsent } from "@/hooks/use-consent";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

// Shown once, on first visit, only on builds where Google Analytics is actually configured
// (see components/google-analytics.tsx, which won't fire until consent is "granted"). A
// visitor who already sent a Global Privacy Control / Do Not Track signal is opted out
// automatically, without ever seeing the banner.
export function CookieConsentBanner() {
  const t = useTranslations("common.cookieConsent");
  const consent = useConsent();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || consent !== null) return;
    if (hasOptOutSignal()) setStoredConsent("denied");
  }, [consent]);

  if (!GA_MEASUREMENT_ID || consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label={t("title")}
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4"
    >
      <div className="flex w-full max-w-2xl flex-col items-start gap-3 rounded-xl border border-og-border bg-og-surface p-4 shadow-lg sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-og-text">
          {t("message")}{" "}
          <Link href="/privacy" className="text-og-accent underline hover:no-underline">
            {t("privacyLink")}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setStoredConsent("denied")}
            className="rounded-lg border border-og-border-md px-3 py-1.5 text-sm text-og-text hover:bg-og-surface-alt"
          >
            {t("decline")}
          </button>
          <button
            type="button"
            onClick={() => setStoredConsent("granted")}
            className="rounded-lg bg-og-action px-3 py-1.5 text-sm text-white hover:bg-og-action-dark"
          >
            {t("accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
