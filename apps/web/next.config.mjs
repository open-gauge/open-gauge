import { createMDX } from "fumadocs-mdx/next";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The Knowledge Center content lives in apps/docs/content/docs/guide (single source of truth,
// shared with apps/docs — see source.config.ts). In local dev that's a sibling directory
// outside this project's own root, which Turbopack refuses to resolve by default. In Docker
// the same content is instead copied *inside* this project root (see Dockerfile /
// DOCS_CONTENT_DIR), so no widening is needed there — and widening unnecessarily shifts where
// the standalone build's server.js ends up.
const siblingDocsContent = path.join(__dirname, "..", "docs", "content", "docs", "guide");
const needsWidenedRoot = !process.env.DOCS_CONTENT_DIR && existsSync(siblingDocsContent);

// Demo mode builds a fully static export (no backend, no Node server) so it can be hosted as
// static files — see apps/web/src/lib/demo/. Every other build (Docker/self-hosted) keeps the
// existing "standalone" output untouched.
const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isDemoMode ? "export" : "standalone",
  ...(isDemoMode ? { images: { unoptimized: true } } : {}),
  ...(needsWidenedRoot ? { turbopack: { root: path.join(__dirname, "..") } } : {}),
};

const withMDX = createMDX();

export default withMDX(nextConfig);
