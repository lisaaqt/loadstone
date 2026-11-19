# Loadstone Panel — agent notes

npm workspaces monorepo: `apps/panel` (Next.js 16 App Router + custom `server.ts` WS gateway + BullMQ `worker.ts`), `apps/agent` (Fastify node agent, Docker via dockerode), `packages/shared` (TS source, consumed directly).
Stack: Node 26 LTS images, Prisma 7 (`prisma-client` generator → `apps/panel/src/generated/prisma`, import from `@/generated/prisma/client`; config in `apps/panel/prisma.config.ts`; `PrismaPg` adapter in `src/lib/db.ts`), Zod 4, TypeScript 6, Postgres 18, Redis 8. Next 16 uses `src/proxy.ts` (not middleware). Server/worker/cli and the agent are bundled by esbuild (`build.mjs` in each app).

## Commands
- Install: `npm install --before=<date 7+ days ago>` (pin new deps to versions older than 7 days)
- Typecheck all: `npm run typecheck`
- Build all: `npm run build` (panel build needs `DATABASE_URL` and `APP_SECRET` set to any placeholder)
- Dev services: `docker compose -f docker-compose.dev.yml up -d`
- Migrations: `npm run db:deploy`; new migration after schema edit: `npm run db:migrate`
  (or as SQL against the dev DB, in apps/panel: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`). Prisma 7 no longer auto-generates: run `npx prisma generate` (part of `db:migrate` and `build`).
- Dev: `npm run dev` (panel; this machine uses :3100 via `PORT` in apps/panel/.env because :3000 is taken by another container), `npm run dev:worker`, `npm run dev:agent` (needs `LOADSTONE_TOKEN`, local agent runs on 127.0.0.1:8090)
- After source changes, regenerate the deployment bundle with `npm run server-bundle` (writes `SERVER_UPLOAD/`, never edit it by hand); templates for update.sh/DEPLOY.md live in `deploy/`. `deploy/update.sh` is POSIX sh (check with `sh -n`); the server config is `.env.docker` (template `.env.docker.example`).
- New server-needed files that are gitignored must be added to `EXTRA_FILES` in `scripts/build-server-upload.mjs`; files removed from `apps/`/`packages/` are cleaned up on the server via `.bundle-files` (add to `KNOWN_REMOVED` in `deploy/update.sh` if they must go even without the manifest).
- Registry deploy: images `lisaaqt/loadstone-{panel,worker,agent}` on Docker Hub (`-Registry`/`-Prefix` in the push script, `LOADSTONE_REGISTRY` in registry-deploy/.env) (tags `latest` + the root package.json version, linux/amd64). Build + push all with `npm run push-images` (`scripts/push-images.ps1`; options `-NoBuild`, `-SkipLatest`, `-Only agent`, `-Login`, `-Registry`, `-DryRun`), or manually from the repo root with `docker buildx build --platform linux/amd64 -f apps/<app>/Dockerfile [--target worker] -t <image>:<tag> --load .` (panel = default target, worker = `--target worker` of apps/panel/Dockerfile) then `docker push`. Test cleanup must never filter containers by `io.loadstone.managed` / `loadstone-` name: the dev Minecraft containers match too. Server-side compose for these images: `registry-deploy/docker-compose.yml` + `.env.example` (excluded from the SERVER_UPLOAD bundle). Never write registry credentials into files; log in with `--password-stdin`.
- User preference (keep verification fast): after a change, typecheck only the changed workspace(s) (`npm run typecheck -w @loadstone/panel` / `-w @loadstone/agent`; changes in `packages/shared` → both). Skip the full `npm run build` for small UI changes. Rebuild the Docker images and run container end-to-end tests only when the user asks or is about to push. Prefer short targeted checks over full container stacks, and run slow steps in the background while continuing other work. When polling background commands, use short reads (≤30 s) instead of long blocking waits.
- Never run `update.sh` against the real Docker on this PC; verify deploy scripts statically and with a stubbed `docker` in a temp dir.
- Docker Desktop occasionally stops on this machine; if the DB is unreachable, restart it and `docker compose -f docker-compose.dev.yml up -d postgres redis`.

## Conventions
- API routes use `handler()` from `src/lib/api.ts` (auth, RBAC, rate limit, CSRF origin check, zod errors → JSON).
- Server access always goes through `getServerForUser` / `serverWithAgent` in `src/lib/access.ts`.
- Panel never touches Docker or files directly; it calls the agent via `AgentClient`.
- Agent paths must go through `resolveSafe()` in `apps/agent/src/paths.ts`.
- Route files may only export HTTP method handlers (Next.js restriction).
- Panel `.env` lives in `apps/panel/.env` (loaded by Next, Prisma, server.ts and worker.ts).
