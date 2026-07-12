FROM python:3.11-slim

WORKDIR /app

# Pinned Tectonic release — downloaded as a plain tarball and checksum-verified
# (not piped from a curl|sh installer) so the exact binary is reproducible and
# auditable. Bump both the URL and TECTONIC_SHA256 together to upgrade.
ARG TECTONIC_VERSION=0.16.9
ARG TECTONIC_SHA256=f3c825128095dc3399ea11c08c18035b33050a216930c295c79e8eb11bd21de4

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    apt-get update && apt-get install -y --no-install-recommends curl fonts-dejavu-core ca-certificates libgraphite2-3 fontconfig && \
    curl -fsSL -o /tmp/tectonic.tar.gz \
      "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-gnu.tar.gz" && \
    echo "${TECTONIC_SHA256}  /tmp/tectonic.tar.gz" | sha256sum -c - && \
    tar -xzf /tmp/tectonic.tar.gz -C /usr/local/bin tectonic && \
    rm /tmp/tectonic.tar.gz && \
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
