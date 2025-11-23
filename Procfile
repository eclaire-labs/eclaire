# Procfile for Development Environment
# Application services only - external dependencies are in Procfile.deps

# 1. Backend Service (NODE_ENV=development)
backend: ./scripts/log-wrapper.sh backend "cd apps/backend && pnpm dev"

# 2. Frontend Service (NODE_ENV=development)
frontend: ./scripts/log-wrapper.sh frontend "cd apps/frontend && pnpm dev"
