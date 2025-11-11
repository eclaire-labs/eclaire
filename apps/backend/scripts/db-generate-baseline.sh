#!/bin/bash
# Generates a single, new baseline migration from the current schema.ts

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

MIGRATIONS_DIR="src/db/migrations"

echo "🔥 This will delete all existing migrations and generate a new baseline."
read -p "Are you sure you want to continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    exit 1
fi

# 1. Clear old migration files
echo "🗑️  Deleting old migrations from '$MIGRATIONS_DIR'..."
if [ -d "$MIGRATIONS_DIR" ]; then
    # Ensure the directory exists after cleaning
    rm -rf "$MIGRATIONS_DIR"
    mkdir -p "$MIGRATIONS_DIR"
    # Add a .gitkeep file so the empty directory can be committed
    touch "$MIGRATIONS_DIR/.gitkeep"
else
    mkdir -p "$MIGRATIONS_DIR"
    touch "$MIGRATIONS_DIR/.gitkeep"
fi
echo "✅ Old migrations cleared."

# 2. Generate a new baseline migration from schema.ts
echo "🏗️  Generating new baseline migration..."
pnpm run db:migrate:generate

echo ""
echo "✅ New baseline migration generated successfully!"
echo "💡 Next Steps:"
echo "   1. Commit the new migration file in 'src/db/migrations' to Git."
echo "   2. Deploy your application to staging."
echo "   3. Run the staging reset script on your staging server."