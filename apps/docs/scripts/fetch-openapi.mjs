// Pulls the live OpenAPI schema from the Open Gauge API and writes it to ./openapi.json,
// so fumadocs-openapi can generate the API Reference pages from it (see
// scripts/generate-openapi.mjs). Uses the same API_INTERNAL_URL convention
// apps/web already uses for server-to-server calls inside Docker Compose.
//
// ./openapi.json is committed to the repo (not gitignored) as a fallback snapshot: hosts
// that build this site (e.g. Cloudflare Pages) have no route to a live Open Gauge API, so
// when the fetch fails, we fall back to whatever snapshot is already on disk instead of
// failing the build. Local dev/CI with a reachable `api` service still gets the live schema.
// Refresh the snapshot by running this script against a live API and committing the result.
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const schemaUrl = `${apiUrl.replace(/\/$/, "")}/openapi.json`;

async function main() {
  console.log(`[fetch-openapi] fetching ${schemaUrl}`);
  const res = await fetch(schemaUrl);
  if (!res.ok) {
    throw new Error(`[fetch-openapi] request to ${schemaUrl} failed: ${res.status} ${res.statusText}`);
  }
  const schema = await res.json();
  await writeFile("./openapi.json", JSON.stringify(schema, null, 2));
  console.log(`[fetch-openapi] wrote openapi.json (${Object.keys(schema.paths ?? {}).length} paths)`);
}

main().catch((err) => {
  console.error(err);
  if (existsSync("./openapi.json")) {
    console.warn(
      "[fetch-openapi] Could not reach the Open Gauge API — falling back to the committed " +
        "./openapi.json snapshot. Refresh it by running this script against a live API " +
        "(e.g. `docker compose up -d api`) and committing the change."
    );
    process.exit(0);
  }
  console.error(
    "[fetch-openapi] Could not reach the Open Gauge API, and no ./openapi.json snapshot exists " +
      "to fall back to. Start the API first (e.g. `docker compose up -d api` or `uvicorn app.main:app` " +
      "from apps/api) and re-run this script."
  );
  process.exit(1);
});
