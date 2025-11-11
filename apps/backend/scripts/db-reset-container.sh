#!/bin/bash
# Orchestrates a full database reset from within a container.
# This script is designed to be called via 'docker exec'.

set -e # Exit immediately if a command exits with a non-zero status.

# --- Argument Check ---
SEED_TYPE="$1"
if [ "$SEED_TYPE" != "essential" ] && [ "$SEED_TYPE" != "demo" ]; then
    echo "❌ Error: Invalid or missing argument for seed type."
    echo "   Usage: $0 <essential|demo>"
    exit 1
fi

echo "🔥🔥🔥 CONTAINER DATABASE RESET INITIATED 🔥🔥🔥"
echo "Seed type: $SEED_TYPE"
echo "------------------------------------------------"
echo ""
echo "⚠️  WARNING: This will completely DROP and recreate the 'eclaire' database!"
echo "   All existing data will be permanently lost."
echo ""
read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Database reset cancelled."
    exit 0
fi
echo ""

echo "🧹 Step 1: Cleaning the database..."

# Get database connection details - prioritize DATABASE_URL like TypeScript scripts
if [ -n "$DATABASE_URL" ]; then
    echo "   Using DATABASE_URL for connection"
    # Parse DATABASE_URL format: postgresql://user:password@host:port/database
    # Extract components using parameter expansion and sed
    DB_URL_NO_PROTOCOL=$(echo "$DATABASE_URL" | sed 's|^postgresql://||')
    DB_USER_PASSWORD=$(echo "$DB_URL_NO_PROTOCOL" | cut -d'@' -f1)
    DB_HOST_PORT_DB=$(echo "$DB_URL_NO_PROTOCOL" | cut -d'@' -f2)

    DB_USER=$(echo "$DB_USER_PASSWORD" | cut -d':' -f1)
    DB_PASSWORD=$(echo "$DB_USER_PASSWORD" | cut -d':' -f2)

    DB_HOST_PORT=$(echo "$DB_HOST_PORT_DB" | cut -d'/' -f1)
    DB_HOST=$(echo "$DB_HOST_PORT" | cut -d':' -f1)
    DB_PORT=$(echo "$DB_HOST_PORT" | cut -d':' -f2)
    DB_NAME=$(echo "$DB_HOST_PORT_DB" | cut -d'/' -f2)
else
    # Fall back to individual environment variables with defaults
    echo "   Using individual DB_* environment variables"
    DB_HOST="${DB_HOST:-localhost}"
    DB_USER="${DB_USER:-eclaire}"
    DB_PASSWORD="${DB_PASSWORD:-eclaire}"
    DB_NAME="${DB_NAME:-eclaire}"
    DB_PORT="${DB_PORT:-5432}"
fi

echo "   Host: $DB_HOST:$DB_PORT"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"

echo "   Dropping and recreating database '$DB_NAME'..."

# Drop and recreate database using postgres client
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"

echo "✅ Database cleaned successfully!"

echo "🏗️  Step 2: Applying database migrations..."
pnpm run db:migrate:apply:prod:force

echo "🌱 Step 3: Seeding with '$SEED_TYPE' data..."
pnpm run "db:seed:$SEED_TYPE:prod" # <-- Use the 'prod' version

echo "🎉 Staging database reset complete!"