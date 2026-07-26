import type common from "./messages/en/common.json";
import type nav from "./messages/en/nav.json";
import type settings from "./messages/en/settings.json";
import type tokens from "./messages/en/tokens.json";
import type dashboard from "./messages/en/dashboard.json";
import type activity from "./messages/en/activity.json";
import type assets from "./messages/en/assets.json";
import type admin from "./messages/en/admin.json";
import type users from "./messages/en/users.json";
import type sites from "./messages/en/sites.json";
import type procedures from "./messages/en/procedures.json";
import type organizations from "./messages/en/organizations.json";
import type auth from "./messages/en/auth.json";
import type { routing } from "./src/i18n/routing";

type Messages = {
  common: typeof common;
  nav: typeof nav;
  settings: typeof settings;
  tokens: typeof tokens;
  dashboard: typeof dashboard;
  activity: typeof activity;
  assets: typeof assets;
  admin: typeof admin;
  users: typeof users;
  sites: typeof sites;
  procedures: typeof procedures;
  organizations: typeof organizations;
  auth: typeof auth;
};

// Typed message keys: useTranslations("nav") etc. are now checked against the
// English (canonical) catalog's shape at compile time. Adding a namespace
// here is the only extra step beyond src/i18n/request.ts's NAMESPACES list.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: Messages;
  }
}
