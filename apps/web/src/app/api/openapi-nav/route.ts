import { NextResponse } from "next/server";
import { getApiNavGroups } from "@/lib/api-docs-source";

// Feeds the sidebar's API Reference tree (see ApiNavTree) — fetched client-side, on demand,
// so a slow or unreachable api service only degrades that one sidebar widget rather than
// the whole app (unlike the guide's docsSource, which is static and always instant).
// No revalidate/cache export here — fumadocs-openapi's own createOpenAPI() already caches
// the fetched schema in-process (see api-docs-source.ts), so this route just calls through.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const groups = await getApiNavGroups();
    return NextResponse.json({ groups });
  } catch (err) {
    console.error("[openapi-nav] failed to load the OpenAPI schema", err);
    return NextResponse.json({ groups: [], error: true }, { status: 503 });
  }
}
