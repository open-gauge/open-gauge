# Built with repo-root context (see infrastructure/docker/docker-compose.yml) so this stage
# can also copy in apps/docs/content/docs/guide — the Knowledge Center is rendered inline at
# /documentation using the same content apps/docs serves standalone (source.config.ts).
FROM node:20-alpine AS deps
WORKDIR /app
COPY apps/web/package*.json ./
RUN npm install --prefer-offline

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web/. .
# Copied *inside* the project root (not a sibling directory, unlike local dev) so Next's
# standalone output tracing doesn't need to widen its root and shift where server.js lands.
COPY apps/docs/content/docs/guide ./docs-content
ENV DOCS_CONTENT_DIR=/app/docs-content
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DOCS_URL=http://localhost:3002
ENV NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
