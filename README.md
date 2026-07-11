<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/assets/Logo%20light.svg">
    <source media="(prefers-color-scheme: light)" srcset="apps/web/public/assets/Logo%20dark.svg">
    <img alt="Open Gauge" src="apps/web/public/assets/Logo%20dark.svg" width="360">
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

## Structure

* [`apps/api`](apps/api) — FastAPI backend
* [`apps/web`](apps/web) — Next.js frontend
* [`apps/docs`](apps/docs) — [Fumadocs](https://fumadocs.dev) documentation site (Knowledge Center + API Reference)
* [`infrastructure/docker`](infrastructure/docker) — Docker Compose configurations
* [`docs`](docs) — project documentation ([`ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`DATABASE.md`](docs/DATABASE.md))
* [`scripts`](scripts) — management scripts

See [`docs/README.md`](docs/README.md) for the full project philosophy and a deeper walkthrough
of how the documentation site and in-app Knowledge Center relate to each other.

## Documentation

* [Knowledge Center & API Reference](apps/docs) — self-hosting guides, operational workflows, and
  the full calibration math, also rendered inline inside the app at `/documentation`
* [`CALIBRATION.md`](CALIBRATION.md) — calibration and uncertainty methodology
* [`DATABASE.md`](DATABASE.md) — schema hierarchies and persistence rules
* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — technical design overview

## Contributing

Contributions are welcome — see [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) for the workflow,
code style, and architectural principles to follow.

## License

Open Gauge is licensed under the [GNU Affero General Public License v3.0](LICENSE).
