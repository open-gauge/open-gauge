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
* `/infrastructure/docker`: Docker compose configurations
* `/docs`: Project documentation
  * `ARCHITECTURE.md`: Technical design overview
  * `DATABASE.md`: Schema hierarchies and persistence rules
* `/scripts`: Management scripts

## Getting Started

1. Set up Docker and Docker Compose.
2. Spin up the infrastructure: `cd infrastructure/docker && docker-compose up -d`
3. Check the respective apps' READMEs for local development setup.
