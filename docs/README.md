# Open Gauge

Open Gauge is a self-hosted platform for managing industrial sensors, instrumentation assets, calibration records, calibration coefficients, certificates, and audit trails.

## Philosophy

* API-first
* Self-hosted first
* Open-source friendly
* Docker-first
* PostgreSQL as source of truth
* Simple architecture
* Long-term maintainability
* Traceability above convenience

## Structure

* `/apps/api`: FastAPI backend
* `/apps/web`: Next.js frontend
* `/apps/docs`: Fumadocs documentation site (Knowledge Center + API Reference), see below
* `/infrastructure/docker`: Docker compose configurations
* `/docs`: Contributor guide (`CONTRIBUTING.md`) — technical/schema reference lives in
  `apps/docs` now, not as separate root-level Markdown files
* `/scripts`: Management scripts

## Getting Started

1. Set up Docker and Docker Compose.
2. Spin up the infrastructure: `cd infrastructure/docker && docker-compose up -d`
3. Check the respective apps' READMEs for local development setup.
4. Once running: the app is at `http://localhost:3000`, the API at `http://localhost:8000`
   (OpenAPI schema at `/openapi.json`, Swagger UI at `/docs`), and the documentation site at
   `http://localhost:3002`.

## Documentation site (`apps/docs`)

A [Fumadocs](https://fumadocs.dev)-based site with two sections, switchable from the sidebar
dropdown:

* **Documentation** (`/docs/guide`) — the Knowledge Center: how Open Gauge works, self-hosting,
  and the operational workflows (adding sensors/DAQs, locations, procedures, running a
  calibration, the full calibration math with worked examples, health scoring).
* **API Reference** (`/docs/api`) — generated directly from the API's live OpenAPI schema.

In-app tooltips (the ⓘ icons throughout the UI) link into the Knowledge Center *inside*
`apps/web` (see below) rather than opening this standalone site, so clicking one never leaves
the app.

Local development:

```bash
cd apps/docs
npm install
API_INTERNAL_URL=http://localhost:8000 npm run dev   # fetches the API Reference content first
```

The API Reference content is regenerated from the live API before every `dev`/`build` (see
`apps/docs/scripts/`) when the `api` service is reachable. `apps/docs/openapi.json` is
committed as a fallback snapshot for hosts that build this site without a route to a live
API (e.g. Cloudflare Pages) — `fetch-openapi.mjs` falls back to it instead of failing the
build. Refresh the snapshot by running `API_INTERNAL_URL=http://localhost:8000 node
scripts/fetch-openapi.mjs` from `apps/docs` against a live API and committing the result
whenever the API schema changes. The calibration pages under
`apps/docs/content/docs/guide/calibration/` are themselves the source material — there's no
separate Markdown reference they're built from.

## The Knowledge Center, embedded in the app

The Knowledge Center (not the API Reference — see above) also renders *inline inside
`apps/web`*, at `/documentation`, wrapped in the app's own Sidebar/TopBar and reusing Fumadocs'
real components — same content, same markup, styled with Open Gauge's own design tokens instead of
Fumadocs' default theme (see `apps/web/src/app/globals.css`'s `--color-fd-*` remap). This is
the single source of truth for the content: `apps/web/source.config.ts` reads the exact same
`apps/docs/content/docs/guide` directory apps/docs does — nothing is duplicated.

* Sidebar — the "Documentation" entry expands into the real Fumadocs page tree, nested under
  the app's own navigation (`apps/web/src/components/docs-nav-tree.tsx`).
* Search — the topbar's asset search also searches this content
  (`apps/web/src/app/api/docs-search/route.ts`), showing a merged results dropdown.
* Tooltips — `apps/web/src/lib/docs-links.ts`'s `docsUrl()` builds in-app `/documentation/...`
  links; `externalDocsUrl()` is still used for the one thing that stays external, the API
  Reference (its interactive "Try it" playground isn't embedded).

Because `apps/web` reads content from outside its own project directory in local dev
(`../docs/content/docs/guide`), Turbopack needs a widened root — see the `turbopack.root`
logic in `apps/web/next.config.mjs`. In Docker, the content is copied *inside* the image
instead (`apps/web/Dockerfile`), and the `web` service's Docker build context is the **repo
root**, not `apps/web`, specifically so that copy step can reach `apps/docs/content` (see
`infrastructure/docker/docker-compose.yml`).
