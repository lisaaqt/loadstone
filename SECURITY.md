# Security policy

## Supported versions

Security fixes are released for the latest version only. Please keep your panel and agents up to date (`docker compose pull && docker compose up -d`).

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report them privately through [GitHub Security Advisories](https://github.com/lisaaqt/loadstone/security/advisories/new) ("Report a vulnerability"). Include:

- what is affected and how it can be exploited,
- steps or a small proof of concept to reproduce it,
- the Loadstone version you tested.

You will get a reply as soon as possible. Once a fix is released, the advisory is published and you are credited unless you prefer otherwise.

## Hardening tips

- Put the panel behind HTTPS (reverse proxy) and set `APP_URL` to the `https://` address.
- Keep agent ports reachable only from the panel; access to the Docker socket is equivalent to root on that host.
- Use long random values for `APP_SECRET`, `POSTGRES_PASSWORD` and agent tokens, and never commit `.env` files.
