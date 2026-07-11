// Generates the API Reference MDX pages (content/docs/api/**) from ./openapi.json
// (written by fetch-openapi.mjs) using fumadocs-openapi, one page per operation,
// grouped into a folder per FastAPI tag. Re-run whenever the API schema changes —
// this whole directory is a build artifact (see apps/docs/.gitignore).
import { readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createOpenAPI } from "fumadocs-openapi/server";
import { generateFiles } from "fumadocs-openapi";

const OUTPUT_DIR = "./content/docs/api";

async function main() {
  if (!existsSync("./openapi.json")) {
    throw new Error("./openapi.json not found — run `node scripts/fetch-openapi.mjs` first.");
  }

  await rm(OUTPUT_DIR, { recursive: true, force: true });

  // NOTE: the input path string below is embedded verbatim into every generated
  // page's `document` prop — it must match src/lib/openapi.ts's `input` exactly.
  const openapi = createOpenAPI({ input: ["./openapi.json"], disableCache: true });

  await generateFiles({
    input: openapi,
    output: OUTPUT_DIR,
    per: "operation",
    groupBy: "tag",
    meta: true,
  });

  await writeIndexPage();
  await markAsRoot();

  console.log("[generate-openapi] API Reference pages generated.");
}

async function writeIndexPage() {
  const schema = JSON.parse(await readFile("./openapi.json", "utf-8"));
  const tags = schema.tags ?? [];

  const cards = tags
    .map(
      (tag) =>
        `<Card title="${tag.name}" href="/docs/api/${slugify(tag.name)}" description={${JSON.stringify(
          tag.description ?? ""
        )}} />`
    )
    .join("\n");

  const content = `---
title: API Reference
description: ${JSON.stringify(schema.info?.description ?? "REST API reference for Open Gauge, generated from its OpenAPI schema.")}
---

All Open Gauge functionality is available over a REST API at \`/api/v1\`, documented here directly
from the live OpenAPI schema. See [Authentication](/docs/guide/self-hosting/authentication)
for how to obtain a session token, and [API workflow guides](/docs/guide) for narrative,
task-oriented documentation (this section is a reference, not a tutorial).

<Cards>
${cards}
</Cards>
`;

  await writeFile(`${OUTPUT_DIR}/index.mdx`, content);
}

async function markAsRoot() {
  const metaPath = `${OUTPUT_DIR}/meta.json`;
  const meta = JSON.parse(await readFile(metaPath, "utf-8"));
  meta.title = "API Reference";
  meta.root = true;
  meta.pages = ["index", "---Endpoints---", ...(meta.pages ?? [])];
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
}

function slugify(s) {
  return s.replace(/\s+/g, "-").toLowerCase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
