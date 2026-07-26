// Minimal cookie-consent storage shared between the CookieConsentBanner and GoogleAnalytics —
// see components/cookie-consent-banner.tsx and components/google-analytics.tsx.
export type ConsentValue = "granted" | "denied";

const STORAGE_KEY = "og_analytics_consent";
export const CONSENT_EVENT = "og-consent-changed";

export function getStoredConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "granted" || value === "denied" ? value : null;
}

export function setStoredConsent(value: ConsentValue): void {
  window.localStorage.setItem(STORAGE_KEY, value);
  window.dispatchEvent(new CustomEvent<ConsentValue>(CONSENT_EVENT, { detail: value }));
}

// Global Privacy Control / Do Not Track: treat either signal as an immediate, standing opt-out
// so we never prompt a visitor who has already told their browser not to be tracked.
export function hasOptOutSignal(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || window.navigator.doNotTrack === "1";
}
