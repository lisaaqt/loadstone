#!/bin/sh
set -e

if [ "${MIGRATE_ON_START:-true}" = "true" ]; then
  echo "[entrypoint] applying database migrations"
  node /app/node_modules/prisma/build/index.js migrate deploy
fi

exec "$@"
