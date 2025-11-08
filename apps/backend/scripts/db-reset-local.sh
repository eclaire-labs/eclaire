#!/bin/bash
# Unified Database Reset Script (for local development)

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

# --- Argument Check ---
SEED_TYPE="$1"
if [ "$SEED_TYPE" != "essential" ] && [ "$SEED_TYPE" != "demo" ]; then
  echo "❌ Error: Invalid or missing argument. Use 'essential' or 'demo'."
  echo "   Usage: $0 <essential|demo>"
  exit 1
fi

# Load environment variables to check DATABASE_TYPE (from .env.dev if present)
if [ -f ".env.dev" ]; then
  # export only DATABASE_TYPE from .env.dev (ignore comments)
  export $(grep -v '^[[:space:]]*#' .env.dev | grep -E '^DATABASE_TYPE=' | xargs)
fi

# Detect database type (default to postgresql if not set)
DB_TYPE="${DATABASE_TYPE:-postgresql}"

echo "🔄 Resetting database locally with '$SEED_TYPE' data..."
echo "📊 Database type: $DB_TYPE"
echo ""

# PGlite
if [ "$DB_TYPE" = "pglite" ]; then
  echo "🔀 Detected PGlite, using PGlite local reset script..."
  exec "$SCRIPT_DIR/db-reset-pglite.sh" "$SEED_TYPE"
fi

# SQLite
if [ "$DB_TYPE" = "sqlite" ]; then
  echo "🔀 Detected SQLite, using SQLite local reset script..."
  exec "$SCRIPT_DIR/db-reset-sqlite.sh" "$SEED_TYPE"
fi

# PostgreSQL (default)
if [ "$DB_TYPE" = "postgresql" ] || [ -z "$DB_TYPE" ]; then
  echo "🔀 Detected PostgreSQL, using PostgreSQL local reset script..."
  exec "$SCRIPT_DIR/db-reset-postgres.sh" "$SEED_TYPE"
fi

# Unknown
echo "❌ Error: Unknown DATABASE_TYPE: $DB_TYPE"
echo "   Supported types: pglite, sqlite, postgresql"
exit 1

