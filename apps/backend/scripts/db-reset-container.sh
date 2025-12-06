#!/bin/bash
# Unified Database Reset Script (for container environments)
# This script is designed to be called via 'docker exec' or run inside a container.

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

# --- Argument Check ---
SEED_TYPE="$1"
if [ "$SEED_TYPE" != "essential" ] && [ "$SEED_TYPE" != "demo" ]; then
    echo "❌ Error: Invalid or missing argument for seed type."
    echo "   Usage: $0 <essential|demo>"
    exit 1
fi

# Load environment variables to check DATABASE_TYPE
for envfile in ".env.prod" ".env"; do
    if [ -f "$envfile" ]; then
        export $(grep -v '^#' "$envfile" | grep DATABASE_TYPE | xargs)
        break
    fi
done

# Detect database type (default to postgresql if not set)
DB_TYPE="${DATABASE_TYPE:-postgresql}"

echo "🔄 Resetting database with '$SEED_TYPE' data (container mode)..."
echo "📊 Database type: $DB_TYPE"
echo ""

# PGlite
if [ "$DB_TYPE" = "pglite" ]; then
    echo "🔀 Detected PGlite, using PGlite reset script..."
    export RUNNING_IN_CONTAINER=true
    exec "$SCRIPT_DIR/db-reset-pglite.sh" "$SEED_TYPE"
fi

# SQLite
if [ "$DB_TYPE" = "sqlite" ]; then
    echo "🔀 Detected SQLite, using SQLite reset script..."
    export RUNNING_IN_CONTAINER=true
    exec "$SCRIPT_DIR/db-reset-sqlite.sh" "$SEED_TYPE"
fi

# PostgreSQL (default)
if [ "$DB_TYPE" = "postgresql" ] || [ -z "$DB_TYPE" ]; then
    echo "🔀 Detected PostgreSQL, using PostgreSQL reset script..."
    export RUNNING_IN_CONTAINER=true
    exec "$SCRIPT_DIR/db-reset-postgres.sh" "$SEED_TYPE"
fi

# Unknown type
echo "❌ Error: Unknown DATABASE_TYPE: $DB_TYPE"
echo "   Supported types: pglite, sqlite, postgresql"
exit 1

