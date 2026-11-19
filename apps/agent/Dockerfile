# syntax=docker/dockerfile:1.7
# Build context: repository root (docker build -f apps/agent/Dockerfile .)

FROM node:26-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/agent/package.json apps/agent/
COPY apps/panel/package.json apps/panel/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace @loadstone/agent --include-workspace-root --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/agent apps/agent
RUN npm run build -w @loadstone/agent

FROM node:26-trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    LOADSTONE_DATA_DIR=/var/lib/loadstone \
    LOADSTONE_PORT=8080
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/agent/package.json ./package.json
COPY --from=build /app/apps/agent/dist ./dist
COPY apps/agent/docker-entrypoint.sh /usr/local/bin/loadstone-agent-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/loadstone-agent-entrypoint && chmod 0755 /usr/local/bin/loadstone-agent-entrypoint
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.LOADSTONE_PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/loadstone-agent-entrypoint"]
CMD ["node", "dist/index.js"]
