#!/usr/bin/env bash
#
# Upgrade/Migration Test Script
#
# Tests upgrade checks and migrations for both contributors (pnpm dev)
# and self-hosters (docker compose).
#
# Usage:
#   ./tests/upgrade-scenarios.sh --dev           # Test contributor scenarios
#   ./tests/upgrade-scenarios.sh --container     # Test self-hoster scenarios (pulls from registry)
#   ./tests/upgrade-scenarios.sh --container --local  # Use locally built image
#

set -euo pipefail

# Colors (use $'...' to interpret escape codes at definition time)
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
NC=$'\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Cross-platform timeout function (works on macOS and Linux)
run_with_timeout() {
  local timeout_seconds=$1
  shift

  if command -v timeout &> /dev/null; then
    # Linux: use native timeout
    timeout "$timeout_seconds" "$@"
  else
    # macOS: use perl with signal handler to exit cleanly (no "Alarm clock" message)
    perl -e '
      $SIG{ALRM} = sub { exit 124 };
      alarm shift;
      exec @ARGV;
    ' "$timeout_seconds" "$@"
  fi
}

# Arguments
MODE=""
USE_LOCAL=false

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
  echo -e "\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${CYAN}  $1${NC}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_scenario() {
  echo -e "\n${BOLD}${BLUE}▶ SCENARIO: $1${NC}"
  echo -e "${BLUE}─────────────────────────────────────────────────────────────────────────────${NC}\n"
}

print_step() {
  echo -e "${YELLOW}→ $1${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

print_info() {
  echo -e "${CYAN}ℹ $1${NC}"
}

wait_for_user() {
  local message="${1:-Press Enter to continue...}"
  echo -e "\n${BLUE}${message}${NC}"
  read -r
}

# ============================================================================
# Database Detection and Reset
# ============================================================================

detect_database_type() {
  if [[ -f "$PROJECT_ROOT/.env" ]]; then
    local db_type
    db_type=$(grep -E "^DATABASE_TYPE=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || echo "")
    if [[ -n "$db_type" ]]; then
      echo "$db_type"
      return
    fi
  fi
  echo "sqlite"
}

reset_sqlite() {
  local db_path="$PROJECT_ROOT/data/sqlite/sqlite.db"
  if [[ -f "$db_path" ]]; then
    print_step "Deleting SQLite database: $db_path"
    rm -f "$db_path"
    rm -f "${db_path}-shm" "${db_path}-wal" 2>/dev/null || true
  fi
}

reset_pglite() {
  local pglite_path="$PROJECT_ROOT/data/pglite"
  if [[ -d "$pglite_path" ]]; then
    print_step "Deleting PGlite data directory: $pglite_path"
    rm -rf "$pglite_path"
  fi
}

reset_postgres() {
  # Load env vars if available
  if [[ -f "$PROJECT_ROOT/.env" ]]; then
    # shellcheck disable=SC1091
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
  fi

  local db_name="${DATABASE_NAME:-eclaire}"
  local db_user="${DATABASE_USER:-postgres}"

  print_step "Resetting PostgreSQL database: $db_name"

  # Check if eclaire-postgres container exists
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "eclaire-postgres"; then
    # Make sure the container is running
    if ! docker ps --format '{{.Names}}' | grep -q "eclaire-postgres"; then
      print_step "Starting eclaire-postgres container..."
      docker start eclaire-postgres
      sleep 2
    fi
    docker exec eclaire-postgres psql -U "$db_user" -c "DROP DATABASE IF EXISTS $db_name;" 2>/dev/null || true
    docker exec eclaire-postgres psql -U "$db_user" -c "CREATE DATABASE $db_name;" 2>/dev/null || true
  else
    print_info "No eclaire-postgres container found, skipping PostgreSQL reset"
  fi
}

reset_database() {
  local db_type
  db_type=$(detect_database_type)

  print_step "Detected database type: $db_type"

  case "$db_type" in
    sqlite)
      reset_sqlite
      ;;
    pglite)
      reset_pglite
      ;;
    postgresql|postgres)
      reset_postgres
      ;;
    *)
      print_info "Unknown database type: $db_type, attempting to reset all"
      reset_sqlite
      reset_pglite
      ;;
  esac
}

modify_installed_version() {
  local version="$1"
  local db_type
  db_type=$(detect_database_type)

  print_step "Setting installed_version to $version in database"

  case "$db_type" in
    sqlite)
      local db_path="$PROJECT_ROOT/data/sqlite/sqlite.db"
      if [[ -f "$db_path" ]]; then
        sqlite3 "$db_path" "UPDATE _app_meta SET value='$version' WHERE key='installed_version';"
      else
        print_error "SQLite database not found"
        return 1
      fi
      ;;
    postgresql|postgres)
      local db_name="${DATABASE_NAME:-eclaire}"
      local db_user="${DATABASE_USER:-postgres}"
      if docker ps --format '{{.Names}}' | grep -q "eclaire-postgres"; then
        docker exec eclaire-postgres psql -U "$db_user" -d "$db_name" \
          -c "UPDATE _app_meta SET value='$version' WHERE key='installed_version';"
      else
        print_error "PostgreSQL container not running"
        return 1
      fi
      ;;
    *)
      print_error "Cannot modify version for database type: $db_type"
      return 1
      ;;
  esac
}

# ============================================================================
# Docker Helpers
# ============================================================================

get_compose_command() {
  if [[ "$USE_LOCAL" == true ]]; then
    echo "docker compose -f compose.yaml -f compose.local.yaml"
  else
    echo "docker compose -f compose.yaml"
  fi
}

stop_containers() {
  print_step "Stopping Docker containers..."

  cd "$PROJECT_ROOT"

  # Stop containers
  docker compose down 2>/dev/null || true

  # Remove specific containers if they exist
  for container in eclaire eclaire-postgres eclaire-redis eclaire-docling; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
      docker rm -f "$container" 2>/dev/null || true
    fi
  done
}

# ============================================================================
# State Reset
# ============================================================================

show_reset_warning() {
  echo -e "\n${BOLD}${YELLOW}⚠️  WARNING: This script will delete/reset the following:${NC}\n"

  echo -e "${RED}Files to delete:${NC}"
  echo "  - .env"
  [[ "$MODE" == "dev" ]] && echo "  - .env.local"

  echo -e "\n${RED}Data directories to delete:${NC}"
  echo "  - data/logs/"
  echo "  - data/users/"
  echo "  - data/browser-data/"
  echo "  - data/pglite/"
  echo "  - data/sqlite/"
  echo "  - data/redis/"
  echo "  (data/postgres/ is kept - uses Docker volume)"

  # Check multiple sources for PostgreSQL usage
  local db_type
  db_type=$(detect_database_type)
  local has_postgres_container=false
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "eclaire-postgres"; then
    has_postgres_container=true
  fi

  # Show PostgreSQL warning if: detected in .env, container exists, or running in container mode
  if [[ "$db_type" == "postgresql" || "$db_type" == "postgres" || "$has_postgres_container" == true || "$MODE" == "container" ]]; then
    echo -e "\n${RED}PostgreSQL:${NC}"
    echo "  - Database will be dropped and recreated (if using PostgreSQL)"
  fi

  if [[ "$MODE" == "container" ]]; then
    echo -e "\n${RED}Docker:${NC}"
    echo "  - Containers: eclaire, eclaire-postgres, eclaire-redis, eclaire-docling"
    echo "  - Note: Docker volumes are NOT deleted (data preserved between tests)"
  fi

  echo ""
}

confirm_reset() {
  show_reset_warning

  echo -e "${BOLD}Are you sure you want to proceed? This cannot be undone.${NC}"
  echo -n "Type 'yes' to confirm: "
  read -r response

  if [[ "$response" != "yes" ]]; then
    echo -e "\n${YELLOW}Aborted.${NC}"
    exit 0
  fi

  echo ""
}

reset_state() {
  print_header "Resetting Application State"

  cd "$PROJECT_ROOT"

  # Stop containers first (for container mode)
  if [[ "$MODE" == "container" ]]; then
    stop_containers
  fi

  # Delete config files
  if [[ -f ".env" ]]; then
    print_step "Deleting .env"
    rm -f ".env"
  fi

  if [[ -f ".env.local" ]]; then
    print_step "Deleting .env.local"
    rm -f ".env.local"
  fi

  # Delete all data subdirectories except postgres (which uses Docker volume)
  local data_dirs=("logs" "users" "browser-data" "pglite" "sqlite" "redis")
  for dir in "${data_dirs[@]}"; do
    local dir_path="$PROJECT_ROOT/data/$dir"
    if [[ -d "$dir_path" ]]; then
      print_step "Deleting data/$dir/"
      rm -rf "$dir_path"
    fi
  done

  # Reset PostgreSQL database (drop and recreate)
  reset_postgres

  print_success "State reset complete"
}

# ============================================================================
# Dev Mode Scenarios
# ============================================================================

run_dev_scenarios() {
  print_header "Dev Mode Test Scenarios (pnpm dev)"

  cd "$PROJECT_ROOT"

  local OUTPUT
  local EXIT_CODE

  # Scenario 1: Fresh install - verify setup prompt appears
  print_scenario "1. Fresh Install - Setup Detection"

  reset_state

  wait_for_user "Press Enter to run 'pnpm dev:nowatch' (should detect missing DB)..."

  print_step "Running 'pnpm dev:nowatch' without setup (brief run to detect error)..."
  print_info "Expected: Should detect missing DB and show error message"
  echo ""

  # Run backend without watch mode - exits immediately on error
  local TEMP_OUTPUT="/tmp/eclaire-test-output-$$.txt"
  set +e
  run_with_timeout 15 pnpm dev:backend:nowatch 2>&1 | tee "$TEMP_OUTPUT"
  EXIT_CODE=${PIPESTATUS[0]}
  OUTPUT=$(cat "$TEMP_OUTPUT" 2>/dev/null || echo "")
  rm -f "$TEMP_OUTPUT"
  set -e

  echo ""

  # Check for expected message
  if echo "$OUTPUT" | grep -q "DATABASE NOT INITIALIZED"; then
    print_success "Detected: DATABASE NOT INITIALIZED message"

    # Prompt user in the test script (this works because test script has TTY)
    wait_for_user "Press Enter to run 'pnpm setup:dev'..."

    print_step "Running 'pnpm setup:dev'..."
    pnpm setup:dev

    print_success "Setup complete!"
    echo ""

    # Now verify pnpm dev works
    wait_for_user "Press Enter to run 'pnpm dev' and verify it starts correctly..."

    print_step "Verifying 'pnpm dev' starts correctly..."
    print_info "Will run for 10 seconds then stop"

    set +e
    run_with_timeout 15 pnpm dev &
    DEV_PID=$!
    sleep 10

    if kill -0 $DEV_PID 2>/dev/null; then
      print_success "App is running successfully!"
      kill $DEV_PID 2>/dev/null || true
      wait $DEV_PID 2>/dev/null || true
    else
      print_info "App exited (may be normal if no LLM server running)"
    fi
    set -e
  else
    print_error "Missing: DATABASE NOT INITIALIZED message"
    print_info "Something unexpected happened. Check output above."
  fi

  wait_for_user "Press Enter to continue to next scenario..."

  # Scenario 2: Fresh install - explicit setup, then dev
  print_scenario "2. Fresh Install - Explicit Setup First"

  reset_state

  print_step "Running 'pnpm setup:dev'..."
  pnpm setup:dev

  wait_for_user "Press Enter to run 'pnpm dev' and verify it starts correctly..."

  print_step "Now running 'pnpm dev' (should start without prompts)..."
  print_info "Will run for 10 seconds then stop"

  # Run in background with timeout
  set +e
  run_with_timeout 15 pnpm dev &
  DEV_PID=$!
  sleep 10

  if kill -0 $DEV_PID 2>/dev/null; then
    print_success "App is running (started successfully)"
    kill $DEV_PID 2>/dev/null || true
    wait $DEV_PID 2>/dev/null || true
  else
    wait $DEV_PID 2>/dev/null
    EXIT_CODE=$?
    if [[ $EXIT_CODE -eq 124 ]]; then
      print_success "App ran until timeout (success)"
    else
      print_error "App exited with code $EXIT_CODE"
    fi
  fi
  set -e

  wait_for_user "Press Enter to continue to next scenario..."

  # Scenario 3: Upgrade needed - fake older version in DB
  # NOTE: We use APP_VERSION to override the app version so the upgrade path
  # does NOT cross a blocking step (0.6.0 and 0.7.0 both block).
  # Setting installed_version=0.7.0 and APP_VERSION=0.7.1 creates a safe upgrade path.
  print_scenario "3. Upgrade Needed (older version in DB)"

  # Ensure app is set up
  if [[ ! -f ".env" ]]; then
    print_step "Setting up app first..."
    pnpm setup:dev
  fi

  # Fake an older installed version (past the blocking steps)
  modify_installed_version "0.7.0"
  print_success "Set installed_version to 0.7.0 (older than APP_VERSION=0.7.1)"

  wait_for_user "Press Enter to run 'pnpm dev:nowatch' with APP_VERSION=0.7.1 (should detect upgrade needed)..."

  print_step "Running 'pnpm dev:nowatch' with APP_VERSION=0.7.1..."
  print_info "Expected: Should detect upgrade needed (safe auto-upgrade or manual upgrade)"
  echo ""

  # Run backend without watch mode - exits immediately on error
  local TEMP_OUTPUT="/tmp/eclaire-test-output-$$.txt"
  set +e
  APP_VERSION=0.7.1 run_with_timeout 15 pnpm dev:backend:nowatch 2>&1 | tee "$TEMP_OUTPUT"
  EXIT_CODE=${PIPESTATUS[0]}
  OUTPUT=$(cat "$TEMP_OUTPUT" 2>/dev/null || echo "")
  rm -f "$TEMP_OUTPUT"
  set -e

  echo ""

  if echo "$OUTPUT" | grep -q "UPGRADE REQUIRED\|AUTO-UPGRADE"; then
    print_success "Detected: Upgrade message"

    # Prompt user in the test script
    wait_for_user "Press Enter to run 'pnpm app:upgrade'..."

    print_step "Running 'APP_VERSION=0.7.1 pnpm app:upgrade'..."
    APP_VERSION=0.7.1 pnpm app:upgrade

    print_success "Upgrade complete!"
    echo ""

    # Now verify pnpm dev works
    wait_for_user "Press Enter to run 'pnpm dev' and verify it starts correctly..."

    print_step "Verifying 'pnpm dev' starts correctly..."
    print_info "Will run for 10 seconds then stop"

    set +e
    run_with_timeout 15 pnpm dev &
    DEV_PID=$!
    sleep 10

    if kill -0 $DEV_PID 2>/dev/null; then
      print_success "App is running successfully!"
      kill $DEV_PID 2>/dev/null || true
      wait $DEV_PID 2>/dev/null || true
    else
      print_info "App exited (may be normal if no LLM server running)"
    fi
    set -e
  else
    print_error "Missing: Upgrade message"
    print_info "Something unexpected happened. Check output above."
  fi

  wait_for_user "Press Enter to continue..."

  # Scenario 4: Blocked upgrade (pre-blocking version -> current)
  print_scenario "4. Blocked Upgrade (version too old for migration)"

  # Ensure app is set up
  if [[ ! -f ".env" ]]; then
    print_step "Setting up app first..."
    pnpm setup:dev
  fi

  # Fake a version before the blocking step
  modify_installed_version "0.6.1"
  print_success "Set installed_version to 0.6.1 (before 0.7.0 blocking step)"

  wait_for_user "Press Enter to run 'pnpm dev:nowatch' (should detect blocked upgrade)..."

  print_step "Running 'pnpm dev:nowatch' (brief run to detect blocked upgrade)..."
  print_info "Expected: Should show UPGRADE FROM PRIOR VERSIONS NOT SUPPORTED"
  echo ""

  # Run backend without watch mode - exits immediately on error
  local TEMP_OUTPUT="/tmp/eclaire-test-output-$$.txt"
  set +e
  run_with_timeout 15 pnpm dev:backend:nowatch 2>&1 | tee "$TEMP_OUTPUT"
  EXIT_CODE=${PIPESTATUS[0]}
  OUTPUT=$(cat "$TEMP_OUTPUT" 2>/dev/null || echo "")
  rm -f "$TEMP_OUTPUT"
  set -e

  echo ""

  if echo "$OUTPUT" | grep -q "UPGRADE FROM PRIOR VERSIONS NOT SUPPORTED\|no automated upgrade path"; then
    print_success "Detected: Blocked upgrade message"
  else
    print_error "Missing: Blocked upgrade message"
    print_info "Something unexpected happened. Check output above."
  fi

  if [[ $EXIT_CODE -ne 0 ]]; then
    print_success "App refused to start (exit code: $EXIT_CODE)"
  else
    print_error "App should have exited with non-zero code"
  fi

  # Restore version for subsequent scenarios
  modify_installed_version "$(node -e "console.log(require('./package.json').version)")"

  wait_for_user "Press Enter to continue..."

  # Scenario 5: Downgrade blocked
  print_scenario "5. Downgrade Blocked (app version older than DB)"

  # Ensure we have current version in DB
  if [[ ! -f ".env" ]]; then
    pnpm setup:dev
  fi

  wait_for_user "Press Enter to run 'pnpm dev:nowatch' with APP_VERSION=0.4.0 (should detect downgrade)..."

  print_step "Running 'pnpm dev:nowatch' with APP_VERSION=0.4.0..."
  print_info "Expected: Should refuse to start with VERSION DOWNGRADE DETECTED"
  echo ""

  # Run backend without watch mode - exits immediately on error
  local TEMP_OUTPUT="/tmp/eclaire-test-output-$$.txt"
  set +e
  APP_VERSION=0.4.0 run_with_timeout 15 pnpm dev:backend:nowatch 2>&1 | tee "$TEMP_OUTPUT"
  EXIT_CODE=${PIPESTATUS[0]}
  OUTPUT=$(cat "$TEMP_OUTPUT" 2>/dev/null || echo "")
  rm -f "$TEMP_OUTPUT"
  set -e

  echo ""

  if echo "$OUTPUT" | grep -q "VERSION DOWNGRADE DETECTED\|DOWNGRADE"; then
    print_success "Detected: Downgrade was blocked!"
  else
    print_error "Missing: Downgrade warning"
  fi

  if [[ $EXIT_CODE -ne 0 ]]; then
    print_success "App refused to start (exit code: $EXIT_CODE)"
  else
    print_error "App should have exited with non-zero code"
  fi

  wait_for_user "Press Enter to finish dev mode tests..."

  print_success "Dev mode scenarios complete!"
}

# ============================================================================
# Container Mode Scenarios
# ============================================================================

run_container_scenarios() {
  print_header "Container Mode Test Scenarios (docker compose)"

  cd "$PROJECT_ROOT"

  # Check for local image requirement
  if [[ "$USE_LOCAL" == true ]]; then
    if [[ ! -f "compose.local.yaml" ]]; then
      print_error "Error: --local specified but compose.local.yaml not found"
      print_info "Run ./scripts/build.sh first to build the local image"
      exit 1
    fi
    print_info "Using locally built image (compose.local.yaml)"
  else
    print_info "Using images from registry"
  fi

  local compose_cmd
  compose_cmd=$(get_compose_command)

  # Scenario 1: Fresh install
  print_scenario "1. Fresh Install"

  reset_state

  # Create minimal .env for container mode
  print_step "Creating minimal .env from .env.example..."
  cp .env.example .env

  # Generate secrets
  print_step "Generating secrets..."
  local secrets=()
  for _ in {1..5}; do
    secrets+=("$(openssl rand -hex 32)")
  done

  # Update .env with secrets
  sed -i.bak "s/^BETTER_AUTH_SECRET=.*/BETTER_AUTH_SECRET=${secrets[0]}/" .env
  sed -i.bak "s/^MASTER_ENCRYPTION_KEY=.*/MASTER_ENCRYPTION_KEY=${secrets[1]}/" .env
  sed -i.bak "s/^API_KEY_HMAC_KEY_V1=.*/API_KEY_HMAC_KEY_V1=${secrets[2]}/" .env
  sed -i.bak "s/^INITIAL_ADMIN_PASSWORD=.*/INITIAL_ADMIN_PASSWORD=${secrets[3]}/" .env
  sed -i.bak "s/^INITIAL_USER_PASSWORD=.*/INITIAL_USER_PASSWORD=${secrets[4]}/" .env
  rm -f .env.bak

  print_step "Running upgrade (initialize database)..."
  $compose_cmd run --rm eclaire upgrade

  print_step "Starting containers..."
  $compose_cmd up -d

  print_info "Waiting for app to start..."
  sleep 5

  # Check if app is responding
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|302"; then
    print_success "App is responding at http://localhost:3000"
  else
    print_error "App not responding"
  fi

  wait_for_user "Check http://localhost:3000 in your browser. Press Enter to continue..."

  # Scenario 2: Upgrade needed
  # NOTE: The fake version must be >= 0.7.0 to avoid crossing blocking steps (0.6.0 and 0.7.0).
  # We use 0.7.0 so any container version > 0.7.0 will detect a safe upgrade.
  print_scenario "2. Upgrade Needed"

  # Stop containers but keep data
  print_step "Stopping containers..."
  $compose_cmd down

  # Fake older version
  # Need to start postgres container if using postgres
  local db_type
  db_type=$(detect_database_type)
  if [[ "$db_type" == "postgresql" || "$db_type" == "postgres" ]]; then
    print_step "Starting postgres container to modify version..."
    $compose_cmd up -d postgres
    sleep 3
  fi

  modify_installed_version "0.7.0"

  print_step "Starting containers (should detect upgrade needed)..."
  print_info "Expected: Container should detect safe upgrade and auto-apply, or show upgrade required"

  $compose_cmd up -d
  sleep 3

  print_step "Checking container logs..."
  $compose_cmd logs --tail 20 eclaire

  print_info "The backend should have detected upgrade needed"

  wait_for_user "Press Enter to run upgrade (if auto-upgrade didn't apply)..."

  $compose_cmd run --rm eclaire upgrade

  print_step "Restarting containers..."
  $compose_cmd down
  $compose_cmd up -d

  sleep 5

  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|302"; then
    print_success "App is responding after upgrade"
  else
    print_error "App not responding after upgrade"
  fi

  wait_for_user "Press Enter to continue..."

  # Scenario 3: Blocked upgrade (version too old for migration)
  print_scenario "3. Blocked Upgrade (version too old for migration)"

  # Stop containers but keep data
  print_step "Stopping containers..."
  $compose_cmd down

  # Start postgres container if needed
  if [[ "$db_type" == "postgresql" || "$db_type" == "postgres" ]]; then
    print_step "Starting postgres container to modify version..."
    $compose_cmd up -d postgres
    sleep 3
  fi

  # Set version before the 0.7.0 blocking step
  modify_installed_version "0.6.1"

  print_step "Starting containers (should detect blocked upgrade)..."
  print_info "Expected: Container should show 'upgrade from prior versions not supported' and sleep"

  $compose_cmd up -d
  sleep 5

  print_step "Checking container logs..."
  $compose_cmd logs --tail 20 eclaire

  print_info "The backend should have detected blocked upgrade path and entered sleep"

  # Restore version so subsequent scenarios work
  if [[ "$db_type" == "postgresql" || "$db_type" == "postgres" ]]; then
    # Postgres container should still be running
    true
  fi
  # Get the app version from the container
  local container_version
  container_version=$($compose_cmd run --rm eclaire upgrade-check --quiet 2>/dev/null || echo "unknown")
  print_info "Container exited with code (5 = blocked): $?"

  wait_for_user "Press Enter to continue..."

  # Stop and restore for next scenario
  $compose_cmd down

  # Scenario 4: Downgrade blocked (only for local builds)
  if [[ "$USE_LOCAL" == true ]]; then
    print_scenario "4. Downgrade Blocked"

    print_step "Building image with older APP_VERSION..."
    docker build -f apps/backend/Dockerfile \
      --build-arg APP_VERSION=0.4.0 \
      -t eclaire:downgrade-test \
      .

    print_step "Trying to start with older version..."
    print_info "Expected: Container should refuse to start with downgrade warning"

    # Temporarily use the downgrade test image
    docker run --rm --env-file .env \
      -v "$PROJECT_ROOT/data:/app/data" \
      -v "$PROJECT_ROOT/config:/app/config" \
      eclaire:downgrade-test || true

    print_info "The container should have refused to start"

    # Cleanup test image
    docker rmi eclaire:downgrade-test 2>/dev/null || true
  else
    print_scenario "4. Downgrade Blocked (SKIPPED - requires --local)"
    print_info "To test downgrade blocking, run with --local flag"
  fi

  # Cleanup
  print_step "Stopping containers..."
  $compose_cmd down

  print_success "Container mode scenarios complete!"
}

# ============================================================================
# Argument Parsing
# ============================================================================

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dev)
        MODE="dev"
        shift
        ;;
      --container)
        MODE="container"
        shift
        ;;
      --local)
        USE_LOCAL=true
        shift
        ;;
      -h|--help)
        show_help
        exit 0
        ;;
      *)
        print_error "Unknown argument: $1"
        show_help
        exit 1
        ;;
    esac
  done

  if [[ -z "$MODE" ]]; then
    print_error "Mode required: --dev or --container"
    show_help
    exit 1
  fi
}

show_help() {
  cat << EOF

${BOLD}Upgrade/Migration Test Script${NC}

Tests upgrade checks and migrations for both contributors and self-hosters.

${BOLD}Usage:${NC}
  ./tests/upgrade-scenarios.sh --dev             Test contributor scenarios (pnpm dev)
  ./tests/upgrade-scenarios.sh --container       Test self-hoster scenarios (docker compose)
  ./tests/upgrade-scenarios.sh --container --local  Use locally built image

${BOLD}Options:${NC}
  --dev         Run dev mode tests (pnpm dev)
  --container   Run container mode tests (docker compose)
  --local       Use locally built image (compose.local.yaml)
  -h, --help    Show this help message

${BOLD}Prerequisites:${NC}
  - sqlite3 CLI (for database modifications)
  - docker and docker compose (for container tests)
  - curl (for health checks)

${BOLD}Examples:${NC}
  # Test contributor workflow
  ./tests/upgrade-scenarios.sh --dev

  # Test self-hoster workflow with registry images
  ./tests/upgrade-scenarios.sh --container

  # Test with locally built image (after running ./scripts/build.sh)
  ./tests/upgrade-scenarios.sh --container --local

EOF
}

show_banner() {
  echo -e "\n${BOLD}${CYAN}"
  echo "╔═══════════════════════════════════════════════════════════════════════════╗"
  echo "║                    Upgrade/Migration Test Script                          ║"
  echo "╚═══════════════════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"

  echo -e "Mode: ${BOLD}$MODE${NC}"
  if [[ "$USE_LOCAL" == true ]]; then
    echo -e "Using: ${BOLD}Local image${NC}"
  fi
  echo ""
}

# ============================================================================
# Main
# ============================================================================

main() {
  parse_args "$@"
  show_banner
  confirm_reset

  if [[ "$MODE" == "dev" ]]; then
    run_dev_scenarios
  else
    run_container_scenarios
  fi

  print_header "All Scenarios Complete!"
  echo -e "${GREEN}Testing finished successfully.${NC}\n"
}

main "$@"
