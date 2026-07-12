// Windows-safe way to set NEXT_PUBLIC_DEMO_MODE=true before running `next build`, without
// adding a `cross-env` dependency — `VAR=true next build` doesn't work in PowerShell/cmd, but
// setting process.env here and shelling out does.
//
// It also works around a hard Next.js constraint: route segment config exports (`dynamic`,
// `revalidate`, etc.) must be static string literals parsed straight from the source AST — they
// can never be a computed/conditional expression such as a ternary on NEXT_PUBLIC_DEMO_MODE
// (confirmed against Next's own analysis in next/dist/build/analysis/extract-const-value.js;
// this is a permanent design constraint, not a Turbopack limitation). A few pages/routes
// legitimately need a different `dynamic` literal for the static-export build than for the
// normal self-hosted build (see the comments at each site listed in PATCHES below). This script
// patches those exact literals in place, runs `next build`, and restores the original
// (production) file content no matter what happens — so the checked-in source that `git`,
// `next dev`, and `npm run build` see is always the unmodified, self-hosted literal.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

function file(...segments) {
  return path.join(webRoot, ...segments);
}

// Each entry patches one file's `dynamic` route segment config for the static-export build.
// `find` must appear verbatim in the file (the script fails loudly if it doesn't, rather than
// silently building with the wrong config) and gets replaced with `replace`. docs-search/route.ts
// doesn't export `dynamic` at all in its normal state, so its patch inserts a new line instead
// of replacing one.
const PATCHES = [
  {
    path: file("src/app/(app)/dashboard/page.tsx"),
    find: 'export const dynamic = "force-dynamic";',
    replace: 'export const dynamic = "force-static";',
  },
  {
    path: file("src/app/(app)/documentation/api/[[...slug]]/page.tsx"),
    find: 'export const dynamic = "force-dynamic";',
    replace: 'export const dynamic = "force-static";',
  },
  {
    path: file("src/app/api/openapi-nav/route.ts"),
    find: 'export const dynamic = "force-dynamic";',
    replace: 'export const dynamic = "force-static";',
  },
  {
    path: file("src/app/api/docs-search/route.ts"),
    find: "const { GET: liveSearchGET } = createFromSource(docsSource);",
    replace:
      'export const dynamic = "force-static";\n\nconst { GET: liveSearchGET } = createFromSource(docsSource);',
  },
];

const originals = PATCHES.map(({ path: p }) => readFileSync(p, "utf8"));

function restore() {
  PATCHES.forEach(({ path: p }, i) => writeFileSync(p, originals[i]));
}

try {
  for (const { path: p, find, replace } of PATCHES) {
    const content = readFileSync(p, "utf8");
    if (!content.includes(find)) {
      throw new Error(
        `build-demo: expected to find ${JSON.stringify(find)} in ${p}, but it wasn't there — has the file changed?`
      );
    }
    writeFileSync(p, content.replace(find, replace));
  }

  process.env.NEXT_PUBLIC_DEMO_MODE = "true";
  execSync("next build", { stdio: "inherit", cwd: webRoot });
} finally {
  restore();
}
