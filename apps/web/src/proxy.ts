import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Next.js 16's renamed successor to middleware.ts (same request-interception
// API). Only runs in the normal (Docker/self-hosted) server build — the demo
// static export doesn't execute it at all, which is fine: every locale's
// pages are still pre-rendered via generateStaticParams in app/[locale]/layout.tsx.
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
