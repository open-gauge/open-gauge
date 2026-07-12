// Single source of truth for "are we running the backend-free demo build".
// Kept tiny and stable on purpose — the static-export workstream imports this
// directly, so its shape/signature should not change casually.
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}
