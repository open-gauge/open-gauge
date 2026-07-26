#!/usr/bin/env bash
#
# Verifies that Postgres and MinIO data survive a full container teardown and
# `docker compose up --build`, i.e. that the bind-mount configuration in
# infrastructure/docker/docker-compose.yml is doing its job.
#
# Runs in complete isolation from any real deployment: a throwaway Compose
# project name (-p) plus --project-directory pointed at a temp directory
# means the db/minio services it starts, and the ./data/{postgres,minio} bind
# mounts they resolve to, are entirely separate from your real
# infrastructure/docker/data/. Nothing here touches a running Open Gauge
# instance or its data.
#
# Usage: scripts/verify-media-persistence.sh
#
# Exit code 0 = data persisted correctly. Exit code 1 = it did not (this is
# the regression the fix in VERSIONS.md's high-priority media-persistence
# entries addresses — see docs/self-hosting/deployment.mdx for background).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infrastructure/docker/docker-compose.yml"
ENV_FILE="$REPO_ROOT/infrastructure/docker/.env"
PROJECT="og-persistence-check"
TMPDIR=""

log() { printf '[verify-media-persistence] %s\n' "$1"; }
fail() { printf '[verify-media-persistence] FAIL: %s\n' "$1" >&2; exit 1; }

# On a brand-new (or freshly-recreated) data dir, Postgres's own entrypoint
# runs initdb, starts a temporary server to create the app database, stops it,
# then starts the real server — a restart the container's healthcheck can
# briefly report "healthy" in the middle of (pg_isready succeeds against the
# temporary server moments before it shuts down). A psql attempt landing in
# that window fails with "the database system is shutting/starting up" even
# though nothing is actually wrong, so give it a few retries rather than
# treating the first failure as the persistence check failing.
psql_retry() {
  local attempt out
  for attempt in $(seq 1 10); do
    if out="$(compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@" 2>&1)"; then
      printf '%s\n' "$out"
      return 0
    fi
    sleep 1
  done
  printf '%s\n' "$out" >&2
  return 1
}

compose() {
  docker compose -f "$COMPOSE_FILE" -f "$TMPDIR/docker-compose.override.yml" \
    --env-file "$ENV_FILE" -p "$PROJECT" --project-directory "$TMPDIR" "$@"
}

cleanup() {
  if [ -n "$TMPDIR" ]; then
    compose down >/dev/null 2>&1 || true
    rm -rf "$TMPDIR"
  fi
}
trap cleanup EXIT

[ -f "$COMPOSE_FILE" ] || fail "compose file not found at $COMPOSE_FILE"
[ -f "$ENV_FILE" ] || fail ".env not found at $ENV_FILE (copy .env.example to .env first)"

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

TMPDIR="$(mktemp -d)"
log "isolated project dir: $TMPDIR (data/ here is throwaway, not your real deployment's)"

# Everything below talks to containers over `compose exec`, never over a
# published host port, so drop db/minio's host port bindings entirely — this
# lets the check run alongside a real, already-running Open Gauge stack
# without a "port already allocated" collision on 5432/9000/9001.
cat > "$TMPDIR/docker-compose.override.yml" <<'EOF'
services:
  db:
    ports: !override []
  minio:
    ports: !override []
EOF

log "starting db + minio (project: $PROJECT)..."
compose up -d db minio >/dev/null

log "waiting for db to become healthy..."
for _ in $(seq 1 30); do
  status="$(compose ps --format '{{.Health}}' db 2>/dev/null || true)"
  [ "$status" = "healthy" ] && break
  sleep 1
done
[ "$status" = "healthy" ] || fail "db never became healthy"

MARKER="persist-check-$(date +%s)"
log "writing marker row to Postgres and marker object to MinIO's bind-mounted data dir..."
psql_retry -c \
  "CREATE TABLE IF NOT EXISTS _persistence_check(note text); INSERT INTO _persistence_check VALUES ('$MARKER');" \
  >/dev/null
compose exec -T minio sh -c "mkdir -p /data/_persistence_check && echo '$MARKER' > /data/_persistence_check/marker.txt" \
  >/dev/null

log "tearing down containers (docker compose down)..."
compose down >/dev/null

log "rebuilding and starting again (docker compose up -d --build)..."
compose up -d --build db minio >/dev/null

log "waiting for db to become healthy again..."
for _ in $(seq 1 30); do
  status="$(compose ps --format '{{.Health}}' db 2>/dev/null || true)"
  [ "$status" = "healthy" ] && break
  sleep 1
done
[ "$status" = "healthy" ] || fail "db never became healthy after rebuild"

db_value="$(psql_retry -tA -c \
  "SELECT note FROM _persistence_check WHERE note = '$MARKER';")"
[ "$(printf '%s' "$db_value" | tr -d '[:space:]')" = "$MARKER" ] \
  || fail "Postgres marker row did not survive down + up --build — bind mount is not persisting data"

minio_value="$(compose exec -T minio sh -c 'cat /data/_persistence_check/marker.txt' 2>/dev/null || true)"
[ "$(printf '%s' "$minio_value" | tr -d '[:space:]')" = "$MARKER" ] \
  || fail "MinIO marker object did not survive down + up --build — bind mount is not persisting data"

log "PASS: Postgres and MinIO data both survived a full teardown + rebuild."
