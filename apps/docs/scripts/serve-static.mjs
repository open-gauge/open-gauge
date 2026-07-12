// Serves the static export produced by `next build` (next.config.mjs sets
// output: "export" for the Cloudflare Pages deploy target — see that file's
// comment). "next start" refuses to run against a static export, so the
// Docker Compose target (which needs a long-running server, not a Pages
// deploy) serves ./out itself with this small dependency-free file server —
// no npm package needed for something this bounded, and no network fetch at
// container start (self-hosted deployments may be fully offline).
import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";

const ROOT = join(process.cwd(), "out");
const PORT = Number(process.env.PORT) || 3000;

// next.config.mjs's static export also writes a Cloudflare Pages `_redirects`
// file (e.g. "/ /docs/guide/ 301") for that hosting target. Honor the same
// rules here so the self-hosted Docker Compose deployment navigates identically
// — plain "exact path -> target, status" lines only, which is all this file uses.
const REDIRECTS = loadRedirects();

function loadRedirects() {
  const path = join(ROOT, "_redirects");
  if (!existsSync(path)) return new Map();
  const rules = new Map();
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const [from, to, status] = line.trim().split(/\s+/);
    if (!from || !to) continue;
    rules.set(from.replace(/\/$/, "") || "/", { to, status: Number(status) || 302 });
  }
  return rules;
}

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

// Resolves a request path to a file under ROOT, following Next.js static
// export's layout: clean URLs map to "<path>.html" or "<path>/index.html".
function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const trimmed = decoded.replace(/\/+$/, "") || "/";
  const safePath = normalize(trimmed).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidates =
    safePath === "/" || safePath === ""
      ? [join(ROOT, "index.html")]
      : [
          join(ROOT, safePath),
          join(ROOT, `${safePath}.html`),
          join(ROOT, safePath, "index.html"),
        ];

  for (const candidate of candidates) {
    // Guard against path traversal escaping ROOT.
    if (!candidate.startsWith(ROOT + sep) && candidate !== ROOT) continue;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const server = createServer((req, res) => {
  const path = (req.url || "/").split("?")[0].replace(/\/$/, "") || "/";
  const redirect = REDIRECTS.get(path);
  if (redirect) {
    res.writeHead(redirect.status, { Location: redirect.to });
    res.end();
    return;
  }

  const file = resolveFile(req.url || "/");

  if (!file) {
    const notFound = join(ROOT, "404.html");
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    if (existsSync(notFound)) createReadStream(notFound).pipe(res);
    else res.end("404 Not Found");
    return;
  }

  res.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`[serve-static] serving ${ROOT} on :${PORT}`);
});
