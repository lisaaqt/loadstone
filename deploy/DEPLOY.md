# Deploying Loadstone

This folder is a deployment bundle: exactly the files needed to build and run Loadstone with Docker.
It is generated on the development machine with `npm run server-bundle` (output: `SERVER_UPLOAD/`).
Everything is built on the server inside Docker; nothing has to be built locally.

**Server requirements:** 64-bit Linux (x86_64 or arm64), Docker Engine with the Compose plugin
(`curl -fsSL https://get.docker.com | sh`), root or a user in the `docker` group, internet access,
about 2.5 GB RAM + swap for the build, and open TCP ports for the panel (`APP_PORT`, default 3000)
and the Minecraft port range (`NODE_PORT_START`-`NODE_PORT_END`, default 25565-25665).

## First install

1. Upload the **contents** of `SERVER_UPLOAD/` to a folder on the server, e.g. `/opt/loadstone`
   (see [Uploading](#uploading)).
2. Create the configuration and fill in every value marked "required":

   ```sh
   cd /opt/loadstone
   cp .env.docker.example .env.docker
   nano .env.docker            # generate secrets with: openssl rand -hex 32
   ```

3. Build and start everything:

   ```sh
   sudo sh update.sh
   ```

4. Open `APP_URL/setup` in the browser and create the administrator account.

With the `agent` profile (the default), the script also registers this server as a node and checks that the panel can reach it.

## Every update

1. On the development machine: `npm run server-bundle`.
2. Upload **all** files of `SERVER_UPLOAD/` over the previous upload, **including hidden files**
   (`.bundle-files`, `.env.docker.example`, `.dockerignore`).
3. On the server: `sudo sh update.sh`.

`update.sh` then:

1. checks `.env.docker`,
2. deletes files in `apps/` and `packages/` that are not listed in `.bundle-files` (left over from older
   uploads; an upload never deletes anything by itself), plus a short list of known removed paths,
3. pulls the latest `postgres` / `redis` images, rebuilds the panel, worker and agent on the latest
   patched Node base image (`build --pull`) and starts everything (`up -d`),
4. recreates any container that is still running an outdated, untagged image,
5. waits for the panel health check (migrations run on start), refreshes the node registration,
6. prunes dangling images and prints the status.

If it warns that `.bundle-files` is missing, your upload tool skipped hidden files. Enable them
(FileZilla: *Server → Force showing hidden files*; WinSCP: *Preferences → Panels → Show hidden files*)
and upload again.

## What is never touched

| Data | Where |
| --- | --- |
| Configuration and secrets | `.env.docker` (bundle folder) |
| Database, Redis | Docker volumes `loadstone_postgres`, `loadstone_redis` (and `loadstone_minio`) |
| Minecraft server files, local backups | `/var/lib/loadstone` on the host |
| Database dumps (`db-backup` profile) | `./backups` (bundle folder) |

`update.sh` only ever deletes files inside `apps/` and `packages/`, and never `.env*` files.
Don't run `docker compose down -v`: `-v` deletes the volumes.

## Uploading

From Windows (PowerShell, in the project folder). `tar` keeps hidden files and line endings:

```powershell
npm run server-bundle
tar -czf loadstone-bundle.tgz -C SERVER_UPLOAD .
scp loadstone-bundle.tgz root@your-server:/tmp/
ssh root@your-server "mkdir -p /opt/loadstone && tar -xzf /tmp/loadstone-bundle.tgz -C /opt/loadstone && rm /tmp/loadstone-bundle.tgz && cd /opt/loadstone && sh update.sh"
```

From Linux/macOS: `rsync -av SERVER_UPLOAD/ root@your-server:/opt/loadstone/` (no `--delete`).

FileZilla / WinSCP work too, as long as hidden files are shown and uploaded.

## Environment variables (`.env.docker`)

| Variable | Default | Description |
| --- | --- | --- |
| `APP_PORT` | `3000` | Host port the panel is published on (the container always listens on 3000). |
| `APP_URL` | required | URL people open the panel with. `https://` makes session cookies Secure. |
| `APP_SECRET` | required | 32+ random characters. Encrypts node tokens and S3 secrets. Never change it later. |
| `ALLOWED_ORIGINS` | empty | Extra origins (comma-separated) allowed to send changes, if the panel is reached under more than one address. |
| `TRUST_PROXY` | `false` | `true` only behind a reverse proxy that sets `X-Forwarded-For`. |
| `POSTGRES_PASSWORD` | required | Password of the bundled PostgreSQL. Set before the first start; changing it later breaks the connection. |
| `COMPOSE_PROFILES` | `agent,db-backup` | Optional services: `agent`, `db-backup`, `s3`. |
| `LOADSTONE_AGENT_TOKEN` | required with `agent` | 32+ random characters shared by panel and agent. |
| `NODE_NAME` | hostname | Name of this server's node in the panel. |
| `NODE_PUBLIC_HOST` | required with `agent` | IP or domain players use to connect. |
| `NODE_PORT_START`, `NODE_PORT_END` | `25565`, `25665` | Port range for Minecraft servers on new nodes. |
| `DB_BACKUP_INTERVAL_SECONDS` | `86400` | Seconds between database dumps (`db-backup`). |
| `DB_BACKUP_KEEP` | `7` | Number of dumps kept in `./backups`. |
| `MINIO_IMAGE` | `minio/minio:latest` | MinIO image (`s3`). The official image is no longer on Docker Hub; set one you can pull. |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | `loadstone`, required with `s3` | MinIO credentials. Console on `127.0.0.1:9001`; endpoint for the panel: `http://minio:9000`. |

For HTTPS, put a reverse proxy (Caddy, nginx, Traefik) in front of `APP_PORT`, set `APP_URL=https://…`
and `TRUST_PROXY=true`.

## Troubleshooting

All commands run in the bundle folder.

- **Logs:** `docker compose --env-file .env.docker logs -f panel worker agent`
- **Status:** `docker compose --env-file .env.docker ps`
- **Health check:** `curl -fsS http://127.0.0.1:3000/api/health` (use your `APP_PORT`).
- **`$'\r': command not found`:** the script got Windows line endings (an upload tool in text mode).
  Fix with `sed -i 's/\r$//' update.sh` and upload in binary mode.
- **`Permission denied` for `./update.sh`:** run `sh update.sh`, or `chmod +x update.sh` once.
- **Port already allocated:** another program uses `APP_PORT`; change it in `.env.docker` and run `update.sh` again.
- **Build stops with `Killed`:** out of memory. Add swap:
  `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`
- **Node offline:** check `docker compose --env-file .env.docker logs agent`; `LOADSTONE_AGENT_TOKEN`
  must be at least 32 characters. Run `update.sh` again after fixing it.
- **Restore a database dump:**
  `gunzip -c backups/loadstone-<date>.sql.gz | docker compose --env-file .env.docker exec -T postgres psql -U loadstone loadstone`
  (into an empty database).
