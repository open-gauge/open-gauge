import { NextResponse } from "next/server";
import { getApiNavGroups } from "@/lib/api-docs-source";
import { isDemoMode } from "@/lib/demo/is-demo-mode";

// Feeds the sidebar's API Reference tree (see ApiNavTree) — fetched client-side, on demand,
// so a slow or unreachable api service only degrades that one sidebar widget rather than
// the whole app (unlike the guide's docsSource, which is static and always instant).
// No revalidate/cache export here — fumadocs-openapi's own createOpenAPI() already caches
// the fetched schema in-process (see api-docs-source.ts), so this route just calls through.
//
// The API Reference feature (and this nav feed) is dropped entirely from the demo build — see
// documentation/api/[[...slug]]/page.tsx and the sidebar, which hides this nav entry in demo
// mode. `output: "export"` can't prerender a live schema fetch anyway, so in demo mode this
// short-circuits to a trivial static response before the live-fetch logic runs.
//
// This must stay a literal string — Next's route segment config is parsed from the AST at
// build time and can't be a computed/conditional expression, even one keyed off
// NEXT_PUBLIC_DEMO_MODE. Demo mode's build script patches this literal to "force-static" at
// build time and restores it afterward — see apps/web/scripts/build-demo.mjs.
export const dynamic = "force-dynamic";

export async function GET() {
  if (isDemoMode()) {
    return NextResponse.json({ groups: [] });
  }

  try {
    const groups = await getApiNavGroups();
    return NextResponse.json({ groups });
  } catch (err) {
    console.error("[openapi-nav] failed to load the OpenAPI schema", err);
    return NextResponse.json({ groups: [], error: true }, { status: 503 });
  }
}
