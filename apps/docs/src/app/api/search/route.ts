import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

// `staticGET` bakes the search index into a static JSON file at build time
// instead of serving per-query results from a server — required since the
// site is a static export (see next.config.mjs). The client side is switched
// to Fumadocs' static search client in src/app/layout.tsx.
export const { staticGET: GET } = createFromSource(source);
export const dynamic = "force-static";
