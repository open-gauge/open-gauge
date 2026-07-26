import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

// Covers the bare "/" path, which src/proxy.ts (next-intl's middleware) normally rewrites to
// the default locale on the fly. The demo's static export (output: "export") has no server to
// run that middleware, so without this route the root URL 404s — Cloudflare (or any static
// host) has no file to serve there. The normal server build never actually reaches this: proxy.ts
// intercepts "/" first and rewrites it internally before the App Router resolves a page.
export default function RootPage() {
  redirect(`/${routing.defaultLocale}`);
}
