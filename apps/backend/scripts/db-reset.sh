#!/bin/bash
# Simple database reset for local development
# Usage: ./db-reset.sh [--demo]
#
# This script:
# 1. Detects DATABASE_TYPE from .env
# 2. Deletes all data (db-type aware)
# 3. Runs migrations via pnpm app:upgrade
# 4. Optionally seeds demo data (if --demo flag is passed)

set -e

# Get script directory and move to repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${CYAN}→${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

# Parse arguments
SEED_DEMO=false
for arg in "$@"; do
    case $arg in
        --demo)
            SEED_DEMO=true
            shift
            ;;
    esac
done

# Load DATABASE_TYPE from .env
if [ -f "$REPO_ROOT/.env" ]; then
    export $(grep -v '^[[:space:]]*#' "$REPO_ROOT/.env" | grep -E '^DATABASE_TYPE=' | xargs 2>/dev/null) || true
    export $(grep -v '^[[:space:]]*#' "$REPO_ROOT/.env" | grep -E '^SQLITE_DATA_DIR=' | xargs 2>/dev/null) || true
    export $(grep -v '^[[:space:]]*#' "$REPO_ROOT/.env" | grep -E '^PGLITE_DATA_DIR=' | xargs 2>/dev/null) || true
fi

DB_TYPE="${DATABASE_TYPE:-postgres}"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           Database Reset (Local Dev)         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""
info "Database type: $DB_TYPE"
info "Seed demo data: $SEED_DEMO"
echo ""
echo -e "${YELLOW}⚠️  WARNING: This will DELETE all data and reset the database!${NC}"
echo ""
read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    warn "Database reset cancelled."
    exit 0
fi
echo ""

# Step 1: Delete data based on database type
info "Step 1: Deleting database data..."

case "$DB_TYPE" in
    postgres|postgresql)
        # Check if postgres container is running
        if ! docker ps --format "table {{.Names}}" | grep -q "^eclaire-postgres$"; then
            error "PostgreSQL container 'eclaire-postgres' is not running. Start it with: docker compose -f compose.yaml -f compose.dev.yaml up -d postgres"
        fi

        # Drop and recreate database
        info "Dropping and recreating database 'eclaire'..."
        docker exec eclaire-postgres psql -U eclaire -d postgres -c "DROP DATABASE IF EXISTS eclaire;" 2>/dev/null || true
        docker exec eclaire-postgres psql -U eclaire -d postgres -c "CREATE DATABASE eclaire;"
        success "PostgreSQL database reset"
        ;;

    sqlite)
        SQLITE_DIR="${SQLITE_DATA_DIR:-$REPO_ROOT/data/sqlite}"
        SQLITE_PATH="$SQLITE_DIR/sqlite.db"

        info "Deleting SQLite database at $SQLITE_PATH..."
        rm -f "$SQLITE_PATH" "$SQLITE_PATH-wal" "$SQLITE_PATH-shm" 2>/dev/null || true
        mkdir -p "$SQLITE_DIR"
        success "SQLite database deleted"
        ;;

    pglite)
        PGLITE_DIR="${PGLITE_DATA_DIR:-$REPO_ROOT/data/pglite}"

        info "Deleting PGlite data directory at $PGLITE_DIR..."
        rm -rf "$PGLITE_DIR" 2>/dev/null || true
        mkdir -p "$PGLITE_DIR"
        success "PGlite data directory deleted"
        ;;

    *)
        error "Unknown DATABASE_TYPE: $DB_TYPE. Supported: postgres, sqlite, pglite"
        ;;
esac

# Step 2: Run migrations
info "Step 2: Running migrations via app:upgrade..."
pnpm app:upgrade
success "Migrations applied"

# Step 3: Optionally seed demo data
if [ "$SEED_DEMO" = true ]; then
    info "Step 3: Seeding demo data..."
    pnpm --filter @eclaire/backend db:seed:demo
    success "Demo data seeded"
else
    info "Step 3: Skipping seeding (no --demo flag)"
fi

echo ""
success "Database reset complete!"
