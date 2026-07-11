import { cache } from "react";
import { createOpenAPI } from "fumadocs-openapi/server";
import { loader } from "fumadocs-core/source";
import { getBaseUrl } from "@/lib/api";

// The API Reference embedded at /documentation/api reads the same live OpenAPI schema
// apps/docs' standalone site uses (see apps/docs/src/lib/openapi.ts) — no content is
// duplicated, both just point at the running api service's /openapi.json.
//
// Unlike the guide content (compiled from static MDX at build time), this source is built
// lazily on first request via getApiSource() below, never at module load or Docker build
// time — the api service only needs to be reachable once a real request comes in, which
// Docker Compose already guarantees (`web` depends_on `api: condition: service_healthy`).
//
// The schema is fetched with a plain fetch() rather than handing fumadocs-openapi the bare
// URL as `input` — passing the URL directly failed to resolve inside Next's bundled server
// runtime ("Unable to resolve $ref pointer"). Fetching it ourselves and handing over the
// already-parsed document sidesteps that resolver entirely.
export const apiOpenapi = createOpenAPI({
  input: {
    "openapi.json": async () => {
      const res = await fetch(`${getBaseUrl()}/openapi.json`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch OpenAPI schema: ${res.status} ${res.statusText}`);
      return res.json();
    },
  },
});

export const getApiSource = cache(async () => {
  const source = await apiOpenapi.staticSource({ per: "operation", groupBy: "tag" });
  return loader({ baseUrl: "/documentation/api", source });
});

export interface ApiNavItem {
  title: string;
  url: string;
  method?: string;
}

export interface ApiNavGroup {
  title: string;
  items: ApiNavItem[];
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => (word[0] ?? "").toUpperCase() + word.slice(1))
    .join(" ");
}

/** Groups every generated operation page by its tag folder, for the sidebar tree and the section overview. */
export async function getApiNavGroups(): Promise<ApiNavGroup[]> {
  const apiSource = await getApiSource();
  const groups = new Map<string, ApiNavGroup>();

  for (const page of apiSource.getPages()) {
    const groupSlug = page.slugs[0] ?? "general";
    let group = groups.get(groupSlug);
    if (!group) {
      group = { title: titleCase(groupSlug), items: [] };
      groups.set(groupSlug, group);
    }
    group.items.push({
      title: page.data.title ?? page.url,
      url: page.url,
      method: page.data._openapi?.method,
    });
  }

  return [...groups.values()];
}
