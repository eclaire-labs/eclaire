#!/bin/bash
# SQLite Database Reset Script (for local development)

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

# Determine seed type (demo or essential)
SEED_TYPE="$1"
if [ "$SEED_TYPE" != "essential" ] && [ "$SEED_TYPE" != "demo" ]; then
    echo "❌ Error: Invalid or missing argument. Use 'essential' or 'demo'."
    exit 1
fi

echo "🔄 Resetting SQLite database with '$SEED_TYPE' data..."
echo ""
echo "⚠️  WARNING: This will completely DELETE the SQLite database file!"
echo "   All existing data will be permanently lost."
echo ""
read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Database reset cancelled."
    exit 0
fi
echo ""

# Get SQLite database path from environment or use default
SQLITE_PATH="${SQLITE_DATA_DIR:-../../data/db/sqlite.db}"
echo "📂 SQLite database: $SQLITE_PATH"

# 1. Delete the SQLite database file
echo "🗑️  Step 1: Deleting SQLite database file..."
if [ -f "$SQLITE_PATH" ]; then
    rm -f "$SQLITE_PATH"
    echo "✅ SQLite database file deleted"
else
    echo "ℹ️  SQLite database file doesn't exist (fresh start)"
fi

# Also delete WAL and SHM files if they exist
if [ -f "$SQLITE_PATH-wal" ]; then
    rm -f "$SQLITE_PATH-wal"
    echo "✅ Deleted WAL file"
fi
if [ -f "$SQLITE_PATH-shm" ]; then
    rm -f "$SQLITE_PATH-shm"
    echo "✅ Deleted SHM file"
fi

# 2. Clear old migration files
MIGRATIONS_DIR="src/db/migrations-sqlite"
echo "🗑️  Step 2: Deleting and recreating migrations directory '$MIGRATIONS_DIR'..."
rm -rf "$MIGRATIONS_DIR"
mkdir -p "$MIGRATIONS_DIR"
touch "$MIGRATIONS_DIR/.gitkeep"
echo "✅ Migrations directory is now clean."

# 3. Generate a new baseline migration from schema/sqlite.ts
echo "🏗️  Step 3: Generating new baseline migration..."
DATABASE_TYPE=sqlite npm run db:migrate:generate

# 4. Apply the new baseline migration
echo "✅ Step 4: Applying baseline migration to the database..."
DATABASE_TYPE=sqlite npm run db:migrate:apply

# 5. Seed the database
echo "🌱 Step 5: Seeding with '$SEED_TYPE' data..."
DATABASE_TYPE=sqlite npm run "db:seed:$SEED_TYPE"

echo ""
echo "✅ SQLite database reset complete!"
echo "💡 SQLite database is ready at: $SQLITE_PATH"
