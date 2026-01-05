#!/bin/sh
set -e

# Eclaire Self-Hosted Setup Script
# Usage: mkdir eclaire && cd eclaire && curl -fsSL https://raw.githubusercontent.com/eclaire-labs/eclaire/main/setup.sh | sh

REPO_URL="https://raw.githubusercontent.com/eclaire-labs/eclaire/main"

# Colors (if terminal supports them)
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  CYAN=''
  BOLD=''
  NC=''
fi

info() { printf "${CYAN}→${NC} %s\n" "$1"; }
success() { printf "${GREEN}✓${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}!${NC} %s\n" "$1"; }
error() { printf "${RED}✗${NC} %s\n" "$1"; exit 1; }

# Generate a random 32-byte hex string
generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  elif [ -r /dev/urandom ]; then
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  else
    error "Cannot generate secrets: neither openssl nor /dev/urandom available"
  fi
}

# Check for existing installation
check_existing_installation() {
  if [ -f ".env" ] || [ -d "data" ] || [ -d "config" ]; then
    printf "\n${YELLOW}Existing installation detected.${NC}\n\n"
    printf "Found: "
    [ -f ".env" ] && printf ".env "
    [ -d "data" ] && printf "data/ "
    [ -d "config" ] && printf "config/ "
    printf "\n\n"
    printf "To upgrade an existing installation:\n"
    printf "  ${CYAN}docker compose pull${NC}\n"
    printf "  ${CYAN}docker compose run --rm eclaire upgrade${NC}\n"
    printf "  ${CYAN}docker compose up -d${NC}\n\n"
    printf "To start fresh, remove existing files first.\n"
    exit 1
  fi
}

# Check prerequisites
check_prerequisites() {
  info "Checking prerequisites..."

  if ! command -v docker >/dev/null 2>&1; then
    error "Docker is required but not installed. Install it from https://docs.docker.com/get-docker/"
  fi

  if ! docker compose version >/dev/null 2>&1; then
    error "Docker Compose is required but not available. Make sure you have Docker Compose v2+."
  fi

  success "Docker and Docker Compose found"
}

# Download files from repository
download_files() {
  info "Downloading files..."

  mkdir -p config/ai data/postgres

  curl -fsSL "$REPO_URL/compose.yaml" -o compose.yaml
  curl -fsSL "$REPO_URL/.env.example" -o .env
  curl -fsSL "$REPO_URL/config/ai/providers.json.example" -o config/ai/providers.json
  curl -fsSL "$REPO_URL/config/ai/models.json.example" -o config/ai/models.json
  curl -fsSL "$REPO_URL/config/ai/selection.json.example" -o config/ai/selection.json

  success "Downloaded configuration files"
}

# Generate and inject secrets into .env
configure_secrets() {
  info "Generating secrets..."

  SECRET1=$(generate_secret)
  SECRET2=$(generate_secret)
  SECRET3=$(generate_secret)

  # Replace empty secret values in .env
  if [ "$(uname)" = "Darwin" ]; then
    # macOS sed requires empty string for -i
    sed -i '' "s/^BETTER_AUTH_SECRET=$/BETTER_AUTH_SECRET=$SECRET1/" .env
    sed -i '' "s/^MASTER_ENCRYPTION_KEY=$/MASTER_ENCRYPTION_KEY=$SECRET2/" .env
    sed -i '' "s/^API_KEY_HMAC_KEY_V1=$/API_KEY_HMAC_KEY_V1=$SECRET3/" .env
  else
    sed -i "s/^BETTER_AUTH_SECRET=$/BETTER_AUTH_SECRET=$SECRET1/" .env
    sed -i "s/^MASTER_ENCRYPTION_KEY=$/MASTER_ENCRYPTION_KEY=$SECRET2/" .env
    sed -i "s/^API_KEY_HMAC_KEY_V1=$/API_KEY_HMAC_KEY_V1=$SECRET3/" .env
  fi

  success "Generated and configured secrets"
}

# Pull Docker images
pull_images() {
  info "Pulling Docker images (this may take a few minutes)..."
  docker compose pull
  success "Docker images pulled"
}

# Initialize database
initialize_database() {
  info "Starting database..."
  docker compose up -d postgres

  info "Waiting for database to be ready..."
  timeout=30
  while ! docker compose exec postgres pg_isready -U eclaire >/dev/null 2>&1; do
    timeout=$((timeout - 1))
    if [ $timeout -le 0 ]; then
      error "Database failed to start"
    fi
    sleep 1
  done

  # Verify actual database connection works
  sleep 2
  docker compose exec postgres psql -U eclaire -d eclaire -c "SELECT 1" >/dev/null 2>&1 || sleep 3

  info "Running migrations..."
  docker compose run --rm --no-deps eclaire upgrade

  docker compose stop postgres >/dev/null 2>&1

  success "Database initialized"
}

# Print next steps
print_next_steps() {
  printf "\n${GREEN}${BOLD}Setup complete!${NC}\n\n"

  printf "${BOLD}Next steps:${NC}\n\n"

  printf "1. Download models (if not already cached):\n"
  printf "   ${CYAN}llama-cli --hf-repo unsloth/Qwen3-14B-GGUF:Q4_K_XL --prompt \"hi\" -n 0 --no-warmup --single-turn${NC}\n"
  printf "   ${CYAN}llama-cli --hf-repo unsloth/gemma-3-4b-it-qat-GGUF:Q4_K_XL --prompt \"hi\" -n 0 --no-warmup --single-turn${NC}\n\n"

  printf "2. Start your LLM server (in a separate terminal):\n"
  printf "   ${CYAN}llama-server --port 11500${NC}\n\n"

  printf "3. Start Eclaire:\n"
  printf "   ${CYAN}docker compose up -d${NC}\n\n"

  printf "4. Open ${CYAN}http://localhost:3000${NC} and register an account.\n\n"

  printf "For AI model configuration, see: ${CYAN}docs/ai-models.md${NC}\n\n"
}

# Main
main() {
  printf "\n${BOLD}Eclaire Self-Hosted Setup${NC}\n\n"

  check_existing_installation
  check_prerequisites
  download_files
  configure_secrets
  pull_images
  initialize_database
  print_next_steps
}

main
