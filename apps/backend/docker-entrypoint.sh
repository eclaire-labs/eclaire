#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
node node_modules/@eclaire/db/dist/scripts/migrate.js --force

echo "[entrypoint] Starting backend..."
exec node dist/src/index.js "$@"
