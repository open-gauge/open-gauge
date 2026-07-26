import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";
import { defineI18n } from "fumadocs-core/i18n";
import { LOCALE_CODES, DEFAULT_LOCALE } from "@/i18n/locales";

// Mirrors apps/docs/src/lib/i18n.ts — kept in sync manually since these are separate apps/builds
// (see source.config.ts for where the content itself is shared from). `hideLocale: "never"`
// (rather than this app's usual unprefixed-English scheme) is intentional: the demo static
// export always serves every locale — including English — under an explicit /en/... prefix
// (there's no middleware in that build to rewrite a clean URL down to it), so page.url values
// built by Fumadocs (used for in-page relative links and the index redirect below) must always
// include the prefix to resolve correctly in both the dynamic and static-export deploys.
const i18n = defineI18n({
  languages: LOCALE_CODES as string[],
  defaultLanguage: DEFAULT_LOCALE,
  hideLocale: "never",
});

// Renders the same Knowledge Center content as apps/docs, inline, inside this app's own
// Sidebar/TopBar shell — see source.config.ts for where the content is actually read from.
export const docsSource = loader({
  baseUrl: "/documentation",
  source: docs.toFumadocsSource(),
  i18n,
});
