"use client";

import Script from "next/script";
import { isDemoMode } from "@/lib/demo/is-demo-mode";
import { useConsent } from "@/hooks/use-consent";

// Only loads when NEXT_PUBLIC_GA_MEASUREMENT_ID is set at build time. That variable is set on
// the project-operated deployments (the marketing/login build and demo.opengauge.org) and must
// never be set for self-hosted Docker Compose installs — see infrastructure/docker/.env.example,
// which intentionally omits it, and apps/web/README.md for where it's configured.
//
// On the marketing/login build, this additionally waits for consent from CookieConsentBanner
// (components/cookie-consent-banner.tsx), which is only shown there. The demo build has no
// banner of its own (visitors skip straight past the login page — see lib/demo/is-demo-mode.ts),
// so it keeps firing unconditionally once the env var is set, unchanged from before.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function GoogleAnalytics() {
  const consent = useConsent();
  const consentRequired = !isDemoMode();

  if (!GA_MEASUREMENT_ID) return null;
  if (consentRequired && consent !== "granted") return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
    </>
  );
}
