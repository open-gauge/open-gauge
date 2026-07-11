// Pulls the live OpenAPI schema from the MAR API and writes it to ./openapi.json,
// so fumadocs-openapi can generate the API Reference pages from it (see
// scripts/generate-openapi.mjs). Uses the same API_INTERNAL_URL convention
// apps/web already uses for server-to-server calls inside Docker Compose.
import { writeFile } from "node:fs/promises";

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
  console.error(
    "[fetch-openapi] Could not reach the MAR API. Start it first (e.g. `docker compose up api` " +
      "or `uvicorn app.main:app` from apps/api), or run against an existing ./openapi.json."
  );
  process.exit(1);
});
