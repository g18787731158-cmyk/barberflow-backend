#!/usr/bin/env bash
set -euo pipefail

if [ "${NODE_ENV:-}" != "production" ]; then
  echo "Refusing to run migrate deploy outside production."
  exit 1
fi

if [ "${ALLOW_DB_MIGRATIONS:-}" != "1" ]; then
  echo "Refusing to run migrate deploy. Set ALLOW_DB_MIGRATIONS=1."
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set."
  exit 1
fi

echo "About to run prisma migrate deploy (production). Ensure DB backup exists."
npx prisma migrate deploy
