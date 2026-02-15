#!/bin/sh
set -e

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] waiting for postgres"
  until pg_isready \
    -h "${POSTGRES_HOST:-db}" \
    -p "${POSTGRES_PORT:-5432}" \
    -U "${POSTGRES_USER:-clubtracker}" \
    -d "${POSTGRES_DB:-clubtracker}" >/dev/null 2>&1; do
    sleep 2
  done

  echo "[entrypoint] running prisma migrate deploy"
  npx prisma migrate deploy

  if [ "${ADMIN_BOOTSTRAP:-false}" = "true" ]; then
    echo "[entrypoint] running admin bootstrap"
    npm run admin:bootstrap
  fi

  if [ "${SEED_ON_START:-false}" = "true" ]; then
    echo "[entrypoint] running prisma db seed"
    npx prisma db seed
  fi
fi

exec "$@"
