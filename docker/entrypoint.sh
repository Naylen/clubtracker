#!/bin/sh
set -e

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] waiting for postgres"
  until pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; do
    sleep 2
  done

  echo "[entrypoint] running prisma migrate deploy"
  npx prisma migrate deploy

  if [ "${SEED_ON_START:-false}" = "true" ]; then
    echo "[entrypoint] running seed"
    npm run db:seed
  fi
fi

exec "$@"
