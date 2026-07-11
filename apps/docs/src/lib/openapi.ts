import { createOpenAPI } from "fumadocs-openapi/server";

// Kept as a plain relative path string — the same literal value is used by
// scripts/generate-openapi.mjs when generating the API Reference MDX pages,
// since fumadocs-openapi embeds it verbatim as the page's `document` id.
export const openapi = createOpenAPI({
  input: ["./openapi.json"],
});
