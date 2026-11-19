# Development

Loadstone is an npm workspaces monorepo:

| Package | Description |
| --- | --- |
| `apps/panel` | Next.js app (UI + REST API), WebSocket console gateway (`server.ts`) and BullMQ worker (`worker.ts`) |
| `apps/agent` | Fastify agent that runs on each Docker host; the only part that touches Docker and server files |
| `packages/shared` | Software catalog, agent protocol types and validation schemas shared by both |

## Requirements

- Node.js 26 LTS (≥ 22.18 works)
- Docker (Docker Desktop on Windows/macOS)

## Getting started

```bash
npm install
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL, Redis, MinIO

cp apps/panel/.env.example apps/panel/.env       # set APP_SECRET
npm run db:deploy                                # apply database migrations

npm run dev           # panel on http://localhost:3000
npm run dev:worker    # background jobs
```

To run a local agent, register a node in the panel with host `localhost` and port `8080`, then:

```bash
LOADSTONE_TOKEN=<token from the panel> npm run dev:agent
```

## Useful commands

| Command | Description |
| --- | --- |
| `npm run typecheck` | Strict TypeScript checks for all workspaces |
| `npm run build` | Production build of the agent, panel, server and worker |
| `npm run db:migrate` | Create a migration after editing `apps/panel/prisma/schema.prisma` |
| `npm run db:deploy` | Apply pending migrations |
| `npm run push-images` | Build and push the Docker images (Windows, see `scripts/push-images.ps1`) |
| `npm run server-bundle` | Create the `SERVER_UPLOAD/` folder for building on a server |

## Releasing

1. Raise `"version"` in the root `package.json` (the panel and agent read it from there).
2. `npm run push-images` builds `lisaaqt/loadstone-{panel,worker,agent}` and pushes the version tag and `latest`.
3. Running panels show an update notice within a few hours.

## Conventions

- API routes use `handler()` from `apps/panel/src/lib/api.ts` (auth, RBAC, rate limits, CSRF checks, validation).
- Server access always goes through `getServerForUser` / `serverWithAgent` (`apps/panel/src/lib/access.ts`).
- The panel never touches Docker or files directly; it calls the agent.
- Agent file paths always go through `resolveSafe()` (`apps/agent/src/paths.ts`).
