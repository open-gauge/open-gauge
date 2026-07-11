# Contributing to Open Gauge

Thanks for taking the time to contribute. This document covers the workflow, code style, and
architectural principles the project follows.

## Principles

* **API-first** — every workflow exposed in the UI must exist as an API endpoint first; the UI
  is a client of the API, not the other way around.
* **Self-hosted first** — features must work fully offline, on infrastructure the operator
  controls. No hidden calls to hosted services.
* **Docker-first** — anything you build should run through `infrastructure/docker/docker-compose.yml`
  without extra undocumented setup.
* **PostgreSQL as source of truth** — no secondary datastore holds data PostgreSQL doesn't also have.
* **Traceability above convenience** — calibration and coefficient history is append-only and
  auditable; never favor a shortcut that loses history or weakens signature/certificate integrity.
* **Simple architecture, long-term maintainability** — prefer the explicit, boring solution over
  a clever abstraction. See the [Architecture overview](../apps/docs/content/docs/guide/overview/architecture.mdx)
  in the Knowledge Center for how the pieces fit together.

## Local development

```bash
cd infrastructure/docker
docker compose up -d
```

This brings up Postgres, the API (`localhost:8000`), the web app (`localhost:3000`), MinIO, and
Adminer. For iterating on a single app without rebuilding its container, run that app locally
(see its `package.json`/`requirements.txt`) against the Dockerized `db`/`api` services — see
[`docs/README.md`](README.md#documentation-site-appsdocs) for how to run the documentation site
against a live API.

## Code style

* **`apps/api`** (Python/FastAPI) — keep endpoints thin; business logic belongs in services, not
  route handlers. Follow existing module layout under `app/`.
* **`apps/web`** (TypeScript/Next.js) — match existing component conventions; reuse design tokens
  from `globals.css` rather than hardcoding colors.
* **`apps/docs`** (Fumadocs) — the Knowledge Center content under `apps/docs/content/docs/guide`
  is the single source of truth; `apps/web` renders the same files inline, so don't duplicate
  content between the two.

## Submitting changes

1. Open an issue first for anything beyond a small fix, so the approach can be discussed before
   you invest the time.
2. Keep pull requests focused — one logical change per PR.
3. Write commit messages that explain *why*, not just *what*.
4. Make sure the app you touched still builds and, where applicable, passes lint
   (`npm run lint` in `apps/web`/`apps/docs`).
5. If your change touches calibration math, coefficient history, or certificate signing, call
   that out explicitly in the PR description — these paths get extra scrutiny given the
   traceability guarantees Open Gauge makes.

## Reporting bugs

Open a GitHub issue with steps to reproduce, what you expected, and what happened instead.
For anything touching calibration correctness, include the inputs and expected numeric result —
see the worked examples under
[`apps/docs/content/docs/guide/calibration/examples/`](../apps/docs/content/docs/guide/calibration/examples/)
for the format they use.
