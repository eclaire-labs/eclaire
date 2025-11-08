#!/bin/bash
# PGlite Database Reset Script (for local development)

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

echo "🔄 Resetting PGlite database with '$SEED_TYPE' data..."
echo ""
echo "⚠️  WARNING: This will completely DELETE the PGlite database directory!"
echo "   All existing data will be permanently lost."
echo ""
read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Database reset cancelled."
    exit 0
fi
echo ""

# Get PGlite data directory from environment or use default
PGLITE_DIR="${PGLITE_DATA_DIR:-../../data/db/pglite}"
echo "📂 PGlite directory: $PGLITE_DIR"

# 1. Delete the PGlite database directory
echo "🗑️  Step 1: Deleting PGlite database directory..."
if [ -d "$PGLITE_DIR" ]; then
    rm -rf "$PGLITE_DIR"
    echo "✅ PGlite database directory deleted"
else
    echo "ℹ️  PGlite database directory doesn't exist (fresh start)"
fi

# 2. Clear old migration files
MIGRATIONS_DIR="src/db/migrations-postgres"
echo "🗑️  Step 2: Deleting and recreating migrations directory '$MIGRATIONS_DIR'..."
rm -rf "$MIGRATIONS_DIR"
mkdir -p "$MIGRATIONS_DIR"
touch "$MIGRATIONS_DIR/.gitkeep"
echo "✅ Migrations directory is now clean."

# 3. Generate a new baseline migration from schema.ts
echo "🏗️  Step 3: Generating new baseline migration..."
DATABASE_TYPE=pglite npm run db:migrate:generate

# 4. Apply the new baseline migration
echo "✅ Step 4: Applying baseline migration to the database..."
DATABASE_TYPE=pglite npm run db:migrate:apply

# 5. Seed the database
echo "🌱 Step 5: Seeding with '$SEED_TYPE' data..."
DATABASE_TYPE=pglite npm run "db:seed:$SEED_TYPE"

echo ""
echo "✅ PGlite database reset complete!"
echo "💡 PGlite database is ready at: $PGLITE_DIR"
