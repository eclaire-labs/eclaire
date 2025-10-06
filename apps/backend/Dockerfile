# Production Dockerfile for Eclaire Backend
# --- Base runtime kept minimal; build tools live in builder only
FROM node:22-bookworm-slim AS base
WORKDIR /app

# Install only what runtime truly needs (curl for healthcheck, dumb-init for PID1)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl dumb-init ca-certificates \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd -r nodeapp && useradd -r -g nodeapp -m -d /home/nodeapp nodeapp

# ===== Builder Stage =====
# Includes build toolchain for native modules & TS compile
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Build tools needed to compile native deps; psql only if your build/migrate runs at build-time
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Pin npm to match your lockfile version for reproducibility
RUN corepack enable && corepack prepare npm@11.5.1 --activate

# Build metadata (optional)
ARG APP_VERSION=N/A
ARG APP_FULL_VERSION=N/A
ARG APP_BUILD_NUMBER=N/A
ARG APP_BUILD_TIMESTAMP=N/A
ARG APP_GIT_HASH=N/A
ENV APP_VERSION=${APP_VERSION} \
    APP_FULL_VERSION=${APP_FULL_VERSION} \
    APP_BUILD_NUMBER=${APP_BUILD_NUMBER} \
    APP_BUILD_TIMESTAMP=${APP_BUILD_TIMESTAMP} \
    APP_GIT_HASH=${APP_GIT_HASH}

# Install all deps (including dev) with cache
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Copy the rest and build
COPY . .
# If you generate code (e.g., drizzle generate/prisma generate), do it here before build
# RUN npm run db:generate
RUN npm run build

# ===== Production deps (pruned) =====
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ===== Runner Stage =====
FROM base AS runner
WORKDIR /app

# Build metadata (kept in final image for observability)
ARG APP_VERSION=N/A
ARG APP_FULL_VERSION=N/A
ARG APP_BUILD_NUMBER=N/A
ARG APP_BUILD_TIMESTAMP=N/A
ARG APP_GIT_HASH=N/A

ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    APP_FULL_VERSION=${APP_FULL_VERSION} \
    APP_BUILD_NUMBER=${APP_BUILD_NUMBER} \
    APP_BUILD_TIMESTAMP=${APP_BUILD_TIMESTAMP} \
    APP_GIT_HASH=${APP_GIT_HASH} \
    PORT=3001 \
    HOST=0.0.0.0 \
    NODE_OPTIONS=--enable-source-maps

# OCI Labels for provenance
LABEL org.opencontainers.image.title="Eclaire Backend" \
      org.opencontainers.image.description="Eclaire Backend Service" \
      org.opencontainers.image.source="https://github.com/eclaire-labs/eclaire" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version=$APP_FULL_VERSION \
      org.opencontainers.image.revision=$APP_GIT_HASH \
      org.opencontainers.image.created=$APP_BUILD_TIMESTAMP \
      org.opencontainers.image.vendor="Eclaire Labs"

# Copy dumb-init for PID1
COPY --from=base /usr/bin/dumb-init /usr/bin/dumb-init

# Copy pruned production node_modules and runtime files
COPY --from=prod-deps --chown=nodeapp:nodeapp /app/node_modules ./node_modules
COPY --from=builder  --chown=nodeapp:nodeapp /app/package*.json ./
COPY --from=builder  --chown=nodeapp:nodeapp /app/dist ./dist
COPY --from=builder  --chown=nodeapp:nodeapp /app/tool-signatures.json ./

# --- Optional runtime DB tooling (only if used at container runtime) ---
# If your entrypoint or ops scripts call these, keep them; otherwise omit.
COPY --from=builder  --chown=nodeapp:nodeapp /app/scripts ./scripts
COPY --from=builder  --chown=nodeapp:nodeapp /app/src/db/migrations ./src/db/migrations
COPY --from=builder  --chown=nodeapp:nodeapp /app/drizzle.config.ts ./

# Permissions
RUN mkdir -p /app/data /app/logs \
 && chown -R nodeapp:nodeapp /app

USER nodeapp
EXPOSE 3001

# Healthcheck (give app time to boot)
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD curl -fsS -A "Docker-Health-Check" http://localhost:3001/health 2>/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/index.js"]
