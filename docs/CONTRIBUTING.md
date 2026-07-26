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

## Testing

Every feature ships with tests before it's considered complete: API integration tests for each new
endpoint (happy path and error cases), business-logic tests for repository functions with
non-trivial logic, and a regression test for every bug fix (failing before the fix, passing
after). Tests live in `apps/api/tests/` and run against a real PostgreSQL instance — the database
is never mocked. Run the suite via `docker compose -f infrastructure/docker/docker-compose.yml exec api pytest`.

## Versioning

Open Gauge tracks one version number across the frontend and backend (shown at the bottom-left of
the sidebar, e.g. `v3.2.1 · self-hosted`). Every feature or fix bumps it per
[semantic versioning](https://semver.org/) in both `apps/web/package.json` and
`apps/api/app/core/config.py`, with a matching entry in
[`VERSIONS.md`](https://github.com/open-gauge/open-gauge/blob/main/VERSIONS.md) at the repo root
(mirrored into the docs site's Reference → Versions page) describing what changed and why.

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

## Compliance documentation workflow

`apps/docs/content/docs/guide/compliance/` holds one page per regulatory/certification standard
(ISO/IEC 17025, etc.), each with a clause-by-clause table of what Open Gauge does and doesn't
address yet, sourced from the PDFs in the git-ignored `references/` folder at the repo root.

When a `references/<Standard>/` source document is added or replaced with a new edition:

1. Re-run the extraction for the changed clauses only — read the new/changed text, then grep the
   current codebase (don't trust a prior page's claims; re-verify against the code as it stands
   now) before updating any status.
2. Update the page's compliance table and the corresponding detail section(s). Never mark a
   clause "Met" without pointing at the specific model/service/UI that satisfies it.
3. Bump the "Verified against..." footer date at the bottom of the page.
4. No `VERSIONS.md`/app-version bump is needed for a docs-only update — only when the underlying
   feature itself changed (see `AGENTS.md`'s versioning rule).

Adding a standard not yet covered follows the same page template — see any existing page under
`compliance/` for the structure (Summary → Compliance table → Detail, one quoted excerpt and
explanation per clause) — and gets added to `compliance/meta.json` and the summary table in
`compliance/overview.mdx`.

## Reporting bugs

Open a GitHub issue with steps to reproduce, what you expected, and what happened instead.
For anything touching calibration correctness, include the inputs and expected numeric result —
see the worked examples under
[`apps/docs/content/docs/guide/calibration/examples/`](../apps/docs/content/docs/guide/calibration/examples/)
for the format they use.
