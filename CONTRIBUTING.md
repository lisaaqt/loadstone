# Contributing to Loadstone

Thanks for helping! Bug reports, ideas and pull requests are all welcome.

## Reporting bugs and ideas

- Search the [existing issues](https://github.com/lisaaqt/loadstone/issues) first.
- Use the issue templates and include your Loadstone version (shown in the panel's account menu), how you run it, and logs (`docker compose logs panel worker`, `docker logs loadstone-agent`).
- **Security problems:** please don't open a public issue — see [SECURITY.md](SECURITY.md).

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Set up the project as described in [docs/development.md](docs/development.md).
3. Keep changes focused; follow the existing code style and conventions.
4. If you change the database schema, add a migration (`npm run db:migrate`).
5. Make sure these pass before opening the PR:

   ```bash
   npm run typecheck
   npm run build
   ```

6. Describe what changed and why, and how you tested it.

By contributing, you agree that your contributions are licensed under the [AGPL-3.0](LICENSE).
