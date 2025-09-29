# Procfile for Development Environment
# Application services only - external dependencies are in Procfile.deps

# 1. Backend Service (NODE_ENV=development)
backend: ./scripts/log-wrapper.sh backend "cd apps/backend && npm run dev"

# 2. Application Workers (NODE_ENV=development)
workers: ./scripts/log-wrapper.sh workers "cd apps/workers && npm run dev"

# 3. Frontend Service (NODE_ENV=development)
frontend: ./scripts/log-wrapper.sh frontend "cd apps/frontend && npm run dev"
