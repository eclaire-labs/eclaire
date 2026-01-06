#!/bin/bash
set -e

# =============================================================================
# API Integration Test Server
# =============================================================================
# Sets up the environment for API integration tests:
#   1. Ensures Postgres is running
#   2. Runs migrations
#   3. Seeds test data
#   4. Starts the backend server (foreground)
#
# Run tests in another terminal with: pnpm test:integration:api
# =============================================================================

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

# Check prerequisites
check_prerequisites() {
  info "Checking prerequisites..."

  if [ ! -f ".env" ]; then
    error "Missing .env file. Run 'pnpm setup:dev' first."
  fi

  # Check if docker is available
  if ! command -v docker &>/dev/null; then
    error "Docker is required but not installed."
  fi

  success "Prerequisites OK"
}

# Ensure Postgres is running
ensure_postgres() {
  info "Checking if PostgreSQL is running..."

  if ! docker ps | grep -q eclaire-postgres; then
    info "Starting PostgreSQL via Docker Compose..."
    docker compose -f compose.yaml -f compose.dev.yaml up -d postgres

    # Wait for healthy
    info "Waiting for PostgreSQL to be ready..."
    timeout=60
    while ! docker compose exec postgres pg_isready -U eclaire -q 2>/dev/null; do
      timeout=$((timeout - 1))
      if [ $timeout -le 0 ]; then
        error "PostgreSQL failed to become ready"
      fi
      sleep 1
    done
  fi

  success "PostgreSQL is running"
}

# Run migrations
run_migrations() {
  info "Running database migrations..."
  pnpm app:upgrade
  success "Migrations complete"
}

# Seed test data
seed_data() {
  info "Seeding test data..."
  pnpm --filter @eclaire/backend db:seed:test
  success "Test data seeded"
}

# Start backend server (foreground)
start_server() {
  echo ""
  success "Setup complete. Starting backend server..."
  echo ""
  echo -e "${YELLOW}Server running at http://127.0.0.1:3001${NC}"
  echo -e "${YELLOW}Run tests in another terminal: pnpm test:integration:api${NC}"
  echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
  echo ""

  # Start server in foreground
  cd apps/backend
  NODE_ENV=development NODE_OPTIONS='--conditions=development' exec pnpm tsx src/startup.ts
}

# Main
main() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║       API Integration Test Environment       ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
  echo ""

  check_prerequisites
  ensure_postgres
  run_migrations
  seed_data
  start_server
}

main "$@"
