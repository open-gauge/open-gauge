# MAR (Measurement Asset Registry)

MAR is a self-hosted platform for managing industrial sensors, instrumentation assets, calibration records, calibration coefficients, certificates, and audit trails.

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
* `/docs`: Project documentation
  * `ARCHITECTURE.md`: Technical design overview
  * `DATABASE.md`: Schema hierarchies and persistence rules
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

* **Documentation** (`/docs/guide`) — the Knowledge Center: how MAR works, self-hosting,
  and the operational workflows (adding sensors/DAQs, locations, procedures, running a
  calibration, the full calibration math with worked examples, health scoring).
* **API Reference** (`/docs/api`) — generated directly from the API's live OpenAPI schema.

In-app tooltips (the ⓘ icons throughout the UI) link directly into the matching section of
this site.

Local development:

```bash
cd apps/docs
npm install
API_INTERNAL_URL=http://localhost:8000 npm run dev   # fetches the API Reference content first
```

The API Reference content is regenerated from the live API before every `dev`/`build` (see
`apps/docs/scripts/`) — the `api` service must be reachable. See `CALIBRATION.md` and
`CALIBRATION_EXAMPLES.md` for the source material the calibration pages are built from.
