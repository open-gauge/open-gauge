import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

// Each locale's messages are split into small per-feature namespace files
// (mirrors the app's own folder structure) and merged into one messages
// object here. Adding a namespace is just: create the file, add it below.
const NAMESPACES = ["common", "nav", "settings", "tokens", "dashboard", "activity", "assets", "admin", "users", "sites", "procedures", "organizations", "auth"] as const;

async function loadMessages(locale: string) {
  const entries = await Promise.all(
    NAMESPACES.map(async (namespace) => {
      const mod = await import(`../../messages/${locale}/${namespace}.json`);
      return [namespace, mod.default] as const;
    })
  );
  return Object.fromEntries(entries);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
