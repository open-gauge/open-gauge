FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --prefer-offline
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

# The API Reference section is generated from the live MAR API's OpenAPI schema
# (scripts/fetch-openapi.mjs + scripts/generate-openapi.mjs), and fumadocs-mdx compiles
# content at `next build` time — not on each request. Since Docker Compose only makes the
# `api` service reachable once containers are *running* (not during `docker build`), the
# build has to happen at container start, after `api` reports healthy, rather than as a
# separate image-build stage the way apps/web does it.
CMD ["sh", "-c", "node scripts/fetch-openapi.mjs && node scripts/generate-openapi.mjs && npm run build && npm run start"]
