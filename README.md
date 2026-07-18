<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/assets/Logo%20light.png">
    <source media="(prefers-color-scheme: light)" srcset="apps/web/public/assets/Logo%20dark.png">
    <img alt="Open Gauge" src="apps/web/public/assets/Logo%20dark.png" width="360">
  </picture>
</p>

<p align="center">Version control for metrology — self-hosted sensor, calibration, and traceability management.</p>

<p align="center">
  <a href="LICENSE"><img alt="License: AGPL v3" src="https://img.shields.io/github/license/open-gauge/open-gauge"></a>
  <a href="https://github.com/open-gauge/open-gauge/actions/workflows/docs.yml"><img alt="Docs build status" src="https://img.shields.io/github/actions/workflow/status/open-gauge/open-gauge/docs.yml?label=docs"></a>
  <img alt="Self-hosted with Docker" src="https://img.shields.io/badge/self--hosted-docker-2496ED?logo=docker&logoColor=white">
  <a href="docs/CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
</p>

---

Open Gauge is a self-hosted platform for managing industrial sensors, instrumentation assets,
calibration records, calibration coefficients, certificates, and traceability data — built on
JCGM 100:2008 (GUM) and ISO/IEC 17025:2017 methodology.

* **Git-style history** for every coefficient and calibration change
* **Cryptographically signed** calibration certificates
* **Live telemetry & drift monitoring** across sensors and DAQs
* **API-first**, so every workflow in the UI is also scriptable
* **Docker-first**, self-hosted on your own infrastructure — your data never leaves your network

## Quick start

Requires Docker and Docker Compose.

```bash
git clone https://github.com/open-gauge/open-gauge.git
cd open-gauge/infrastructure/docker
docker compose up -d
```

| Service | URL |
|---|---|
| App | http://localhost:3000 |
| API (OpenAPI schema at `/openapi.json`, Swagger UI at `/docs`) | http://localhost:8000 |
| Documentation site | http://localhost:3002 |

## Configuration

All configuration for the Docker Compose deployment lives in one file:
[`infrastructure/docker/.env`](infrastructure/docker/.env). Edit it before deploying anywhere
other than a local trial — in particular, change every password/secret and set `HOST_IP` (or
`FRONTEND_URL`/`NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_DOCS_URL` individually) to your production
domain. `docker-compose.yml` reads every credential and URL from this file via `${VAR}`
substitution — nothing is hardcoded in the compose file itself.

| Variable | Used by | Purpose |
|---|---|---|
| `HOST_IP` | web, docs, minio URLs | Hostname/IP the app is reachable at; used to derive the URLs below |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | db, api | PostgreSQL credentials and database name |
| `SECRET_KEY` | api | Signs auth tokens — set a long random value in production |
| `FRONTEND_URL` | api | Public app URL; encoded into generated QR codes and asset labels |
| `CORS_ORIGINS` | api | Origins allowed to call the API |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | minio, api | MinIO (S3-compatible file storage) credentials |
| `MINIO_BUCKET` | api | Bucket used for calibration certificates, datasheets, and uploads |
| `MINIO_PUBLIC_URL` | api | URL browsers use to fetch files directly from MinIO |
| `NEXT_PUBLIC_API_URL` | web | API URL baked into the frontend build |
| `NEXT_PUBLIC_DOCS_URL` | web | Documentation site URL baked into the frontend build |

Running the API or web app outside Docker (e.g. for local development)? See
[`apps/api/.env.example`](apps/api/.env.example) instead — Compose does not read that file.

## Structure

* [`apps/api`](apps/api) — FastAPI backend
* [`apps/web`](apps/web) — Next.js frontend
* [`apps/docs`](apps/docs) — [Fumadocs](https://fumadocs.dev) documentation site (Knowledge Center + API Reference)
* [`infrastructure/docker`](infrastructure/docker) — Docker Compose configurations
* [`docs`](docs) — contributor guide ([`CONTRIBUTING.md`](docs/CONTRIBUTING.md))
* [`scripts`](scripts) — management scripts

See [`docs/README.md`](docs/README.md) for the full project philosophy and a deeper walkthrough
of how the documentation site and in-app Knowledge Center relate to each other.

## Documentation

* [Knowledge Center & API Reference](apps/docs) — self-hosting guides, operational workflows,
  the full calibration math, and the data model/schema reference, also rendered inline inside
  the app at `/documentation`.

## Contributing

Contributions are welcome — see [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) for the workflow,
code style, and architectural principles to follow.

## License

Open Gauge is licensed under the [GNU Affero General Public License v3.0](LICENSE).
