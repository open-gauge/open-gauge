import { NextResponse, type NextRequest } from "next/server";
import { createFromSource } from "fumadocs-core/search/server";
import { docsSource } from "@/lib/docs-source";
import { isDemoMode } from "@/lib/demo/is-demo-mode";

// This handler reads the query string per request (?query=...), which `output: "export"`
// cannot prerender — there is no server in a static export to answer it live. In demo mode it
// is replaced with a trivial static response (empty results); the top bar's search box simply
// finds nothing, which is an acceptable degradation for a static demo.
//
// No `dynamic` export here, matching the original file exactly — Next's route segment config
// must be a static string literal (confirmed via Next's own AST analysis), so it can't be a
// ternary on NEXT_PUBLIC_DEMO_MODE. Demo mode's build script inserts
// `export const dynamic = "force-static";` into a build-time copy of this file before running
// `next build`, then restores this file afterward — see apps/web/scripts/build-demo.mjs.

const { GET: liveSearchGET } = createFromSource(docsSource);

export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json([]);
  }
  return liveSearchGET(request);
}
