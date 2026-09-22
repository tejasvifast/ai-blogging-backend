#!/bin/sh
set -e

# Apply pending migrations before starting — the API service should own this
# (set RUN_MIGRATIONS=false on the worker service so they don't race).
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "→ Applying database migrations (prisma migrate deploy)..."
  npx prisma migrate deploy
fi

exec "$@"
