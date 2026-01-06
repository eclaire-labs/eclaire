#!/bin/bash
set -e

# =============================================================================
# API Integration Test Runner
# =============================================================================
# Orchestrates the full API test workflow:
#   1. Ensures Postgres is running
#   2. Runs migrations
#   3. Seeds demo data
#   4. Starts the backend server
#   5. Runs API tests
#   6. Cleans up
#
# This guarantees that seeded API key hashes match the running server's HMAC key.
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

# Cleanup function
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    info "Stopping backend server (PID: $SERVER_PID)..."
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    success "Server stopped"
  fi
}

trap cleanup EXIT

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

# Seed demo data
seed_data() {
  info "Seeding demo data..."
  pnpm --filter @eclaire/backend db:seed:demo
  success "Demo data seeded"
}

# Start backend server
start_server() {
  info "Starting backend server..."

  # Start server in background using the proper entry point
  cd apps/backend
  NODE_ENV=development NODE_OPTIONS='--conditions=development' pnpm tsx src/startup.ts &
  SERVER_PID=$!
  cd ../..

  # Wait for server to be ready
  info "Waiting for server to be ready..."
  timeout=30
  while ! curl -fsS http://127.0.0.1:3001/health &>/dev/null; do
    timeout=$((timeout - 1))
    if [ $timeout -le 0 ]; then
      error "Server failed to start"
    fi
    sleep 1
  done

  success "Backend server running on http://127.0.0.1:3001"
}

# Run API tests
run_tests() {
  info "Running API integration tests..."
  pnpm --filter @eclaire/backend vitest run src/tests/api/
  success "API tests complete"
}

# Main
main() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║          API Integration Test Runner         ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
  echo ""

  check_prerequisites
  ensure_postgres
  run_migrations
  seed_data
  start_server
  run_tests

  echo ""
  success "All API tests passed!"
}

main "$@"
