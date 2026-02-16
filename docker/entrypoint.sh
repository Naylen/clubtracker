#!/bin/sh
set -e

if [ -n "${DATABASE_URL:-}" ]; then
  if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
    echo "[entrypoint] node_modules missing, running npm install"
    npm install
  fi

  echo "[entrypoint] waiting for postgres"
  until pg_isready \
    -h "${POSTGRES_HOST:-db}" \
    -p "${POSTGRES_PORT:-5432}" \
    -U "${POSTGRES_USER:-clubtracker}" \
    -d "${POSTGRES_DB:-clubtracker}" >/dev/null 2>&1; do
    sleep 2
  done

  echo "[entrypoint] generating prisma client"
  npx prisma generate

  echo "[entrypoint] running prisma migrate deploy"
  npx prisma migrate deploy

  echo "[entrypoint] running admin bootstrap (create-if-missing; rotate only when enabled)"
  npm run admin:bootstrap

  if [ "${SEED_ON_START:-false}" = "true" ]; then
    echo "[entrypoint] running prisma db seed"
    npx prisma db seed
  fi
fi

exec "$@"
