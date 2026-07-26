"use client";

import { useSyncExternalStore } from "react";
import { CONSENT_EVENT, type ConsentValue, getStoredConsent } from "@/lib/consent";

function subscribe(callback: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, callback);
  return () => window.removeEventListener(CONSENT_EVENT, callback);
}

function getServerSnapshot(): ConsentValue | null {
  return null;
}

// null means "no decision yet" — components gating on this should treat it the same as
// "denied". Backed by useSyncExternalStore (not useState+useEffect) so it reconciles the
// server-rendered "no decision" snapshot against the real localStorage value on the client
// without the cascading-render anti-pattern a manual effect would introduce.
export function useConsent(): ConsentValue | null {
  return useSyncExternalStore(subscribe, getStoredConsent, getServerSnapshot);
}
