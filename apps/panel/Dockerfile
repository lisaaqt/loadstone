# syntax=docker/dockerfile:1.7
# Build context: repository root (docker build -f apps/panel/Dockerfile .)

FROM node:26-trixie-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/panel/package.json apps/panel/
COPY apps/panel/scripts apps/panel/scripts
COPY apps/agent/package.json apps/agent/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace @loadstone/panel --include-workspace-root --no-audit --no-fund

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/panel apps/panel
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/app/apps/panel/.next/cache \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    APP_SECRET=build-time-placeholder-secret-not-used-at-runtime \
    npm run build -w @loadstone/panel

# Background worker image (docker build --target worker): installs, backups, schedules, node health.
FROM node:26-trixie-slim AS worker
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/panel/package.json ./apps/panel/package.json
COPY --from=build --chown=node:node /app/apps/panel/dist ./apps/panel/dist
WORKDIR /app/apps/panel
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/worker.js"]

# Panel image (default target): web UI, API and console gateway; applies migrations on start.
FROM node:26-trixie-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOST=0.0.0.0
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/panel ./apps/panel
WORKDIR /app/apps/panel
USER node
EXPOSE 3000
# docker-entrypoint.sh applies Prisma migrations (unless MIGRATE_ON_START=false), then runs CMD.
ENTRYPOINT ["/usr/bin/tini", "--", "sh", "/app/apps/panel/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
