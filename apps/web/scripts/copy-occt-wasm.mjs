// Copies occt-import-js's WASM binary into public/wasm/ so the CAD tab can fetch it from a
// plain, well-known static URL at runtime (see src/lib/cad-loader.ts) instead of relying on a
// bundler-specific `new URL(pkg-specifier, import.meta.url)` static-asset resolution — that
// pattern isn't reliably picked up by Turbopack production builds (verified: `pdfjs-dist`'s
// worker file, which uses the same pattern elsewhere in this repo, also doesn't end up in
// `.next/static` after `next build`). Copying into public/ sidesteps bundler asset detection
// entirely and works identically in dev, `next build`, Docker, and the static demo export.
//
// Runs via `predev` and `prebuild` (not `postinstall` — Docker's `deps` stage only copies
// package*.json before `npm install`, so a postinstall hook can't see this script or the repo
// source yet; `prebuild`/`predev` instead run in the `builder` stage / local dev, once the
// full source tree is present).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "..", "node_modules", "occt-import-js", "dist", "occt-import-js.wasm");
const destDir = path.join(__dirname, "..", "public", "wasm");
const dest = path.join(destDir, "occt-import-js.wasm");

if (!existsSync(src)) {
  // node_modules not installed yet in this context (e.g. a bare `npm ci --omit=dev` step
  // that runs before occt-import-js resolves) — the other hook (postinstall/prebuild) will
  // catch it.
  console.warn(`[copy-occt-wasm] source not found, skipping: ${src}`);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-occt-wasm] copied to ${dest}`);
