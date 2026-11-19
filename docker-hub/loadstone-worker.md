<p align="center"><img src="https://raw.githubusercontent.com/lisaaqt/loadstone/main/docs/logo.png" width="96" alt="Loadstone"></p>

# Loadstone Worker

The background worker of **[Loadstone](https://github.com/lisaaqt/loadstone)**, a modern self-hosted panel for running Minecraft servers in Docker.

It runs server installs, backups and restores, schedules, node health checks and email notifications. It needs the same database, Redis and secret as [`lisaaqt/loadstone-panel`](https://hub.docker.com/r/lisaaqt/loadstone-panel) and has no web interface of its own.

## Usage

The worker is part of the official compose file — you normally don't start it by hand:

```bash
curl -fsSLO https://raw.githubusercontent.com/lisaaqt/loadstone/main/registry-deploy/docker-compose.yml
```

Standalone, it needs:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Same PostgreSQL database as the panel |
| `REDIS_URL` | Same Redis as the panel |
| `APP_SECRET` | Same secret as the panel |
| `APP_URL` | Public URL of the panel (used in emails) |

Always run the worker with the **same version** as the panel. Without a running worker, server installs, backups and schedules stay pending.

## Tags

`latest` (newest release) and `x.y.z` for specific releases · `linux/amd64` · runs as an unprivileged user.

## License

[AGPL-3.0](https://github.com/lisaaqt/loadstone/blob/main/LICENSE) · Source: [github.com/lisaaqt/loadstone](https://github.com/lisaaqt/loadstone)
