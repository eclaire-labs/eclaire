#!/bin/bash
# Unified Database Reset Script (for local development)

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

echo "🔄 Resetting database with '$SEED_TYPE' data..."
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

# 1. Check PostgreSQL container connectivity
echo "🔍 Step 1: Checking PostgreSQL container..."
# Check if container is running
if ! docker ps --format "table {{.Names}}" | grep -q "^eclaire-postgres$"; then
    echo "❌ Error: PostgreSQL container 'eclaire-postgres' is not running"
    echo "   Make sure PostgreSQL is running (try: overmind start -f Procfile.deps -l postgres)"
    exit 1
fi

# Test connection to container
if ! docker exec eclaire-postgres psql -U eclaire -d postgres -c '\q' 2>/dev/null; then
    echo "❌ Error: Cannot connect to PostgreSQL inside container"
    echo "   Container is running but database is not ready"
    exit 1
fi
echo "✅ PostgreSQL container is running and accessible"

# 2. Clean the database using SQL commands
echo "🧹 Step 2: Cleaning database using DROP/CREATE..."
echo "   Dropping database 'eclaire'..."
docker exec eclaire-postgres psql -U eclaire -d postgres -c "DROP DATABASE IF EXISTS eclaire;"
echo "   Creating fresh database 'eclaire'..."
docker exec eclaire-postgres psql -U eclaire -d postgres -c "CREATE DATABASE eclaire;"
echo "✅ Database reset complete"

# 3. Clear old migration files (THE CORRECTED WAY)
MIGRATIONS_DIR="src/db/migrations"
echo "🗑️  Step 3: Deleting and recreating migrations directory '$MIGRATIONS_DIR'..."
# Forcefully remove the entire directory and its contents
rm -rf "$MIGRATIONS_DIR"
# Recreate the directory to ensure it exists for drizzle-kit
mkdir -p "$MIGRATIONS_DIR"
# Optional but recommended: Add a .gitkeep file so the empty dir can be committed
touch "$MIGRATIONS_DIR/.gitkeep"
echo "✅ Migrations directory is now clean."


# 4. Generate a new baseline migration from schema.ts
echo "🏗️  Step 4: Generating new baseline migration..."
pnpm run db:migrate:generate

# 5. Apply the new baseline migration
echo "✅ Step 5: Applying baseline migration to the database..."
pnpm run db:migrate:apply

# 6. Seed the database
echo "🌱 Step 6: Seeding with '$SEED_TYPE' data..."
pnpm run "db:seed:$SEED_TYPE"

echo ""
echo "✅ Database reset complete!"
echo "💡 PostgreSQL is still running and ready to use."