FROM python:3.11-slim

WORKDIR /app

# Pinned Tectonic release — downloaded as a plain tarball and checksum-verified
# (not piped from a curl|sh installer) so the exact binary is reproducible and
# auditable. Bump both the URL and TECTONIC_SHA256 together to upgrade.
ARG TECTONIC_VERSION=0.16.9
ARG TECTONIC_SHA256=f3c825128095dc3399ea11c08c18035b33050a216930c295c79e8eb11bd21de4

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    apt-get update && apt-get install -y --no-install-recommends curl fonts-dejavu-core ca-certificates libgraphite2-3 fontconfig gnupg lsb-release && \
    curl -fsSL -o /tmp/tectonic.tar.gz \
      "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-gnu.tar.gz" && \
    echo "${TECTONIC_SHA256}  /tmp/tectonic.tar.gz" | sha256sum -c - && \
    tar -xzf /tmp/tectonic.tar.gz -C /usr/local/bin tectonic && \
    rm /tmp/tectonic.tar.gz && \
    # postgresql-client pinned to 15 via the PGDG repo, matching the `db` service's
    # postgres:15-alpine server exactly. Debian's own default repo ships a newer
    # client whose pg_restore issues session-setup GUCs a v15 server doesn't
    # recognize (e.g. "unrecognized configuration parameter transaction_timeout",
    # introduced in v17), breaking Admin -> Dashboard -> Dangerous zone's database
    # import. Bump this alongside the `db` service's image tag if that ever changes.
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /tmp/pgdg.asc && \
    gpg --dearmor -o /usr/share/keyrings/postgresql.gpg /tmp/pgdg.asc && \
    rm /tmp/pgdg.asc && \
    echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && apt-get install -y --no-install-recommends postgresql-client-15 && \
    rm -rf /var/lib/apt/lists/*

# Fixed, image-baked cache path (not a volume) so Tectonic's fetched LaTeX
# package bundle survives without any persistent mount.
ENV TECTONIC_CACHE_DIR=/opt/tectonic-cache

COPY . .

# Pre-warm the Tectonic package cache at build time by compiling the built-in
# certificate template once with placeholder data, so no network fetch is
# attempted at container runtime (self-hosted / air-gapped requirement).
RUN python -c "from app.services.latex_service import warm_cache; warm_cache()"

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
