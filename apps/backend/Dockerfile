# Production Dockerfile for Eclaire Backend
# --- Base runtime kept minimal; build tools live in builder only
FROM node:24-bookworm-slim AS base
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
FROM node:24-bookworm-slim AS builder
WORKDIR /app

# Build tools needed to compile native deps; psql only if your build/migrate runs at build-time
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.21.0 --activate

# Build metadata (optional)
ARG APP_VERSION=N/A
ARG APP_FULL_VERSION=N/A
ARG APP_COMMITS_SINCE_TAG=0
ARG APP_BUILD_TIMESTAMP=N/A
ARG APP_GIT_HASH=N/A
ENV APP_VERSION=${APP_VERSION} \
    APP_FULL_VERSION=${APP_FULL_VERSION} \
    APP_COMMITS_SINCE_TAG=${APP_COMMITS_SINCE_TAG} \
    APP_BUILD_TIMESTAMP=${APP_BUILD_TIMESTAMP} \
    APP_GIT_HASH=${APP_GIT_HASH}

# Install all deps (including dev) with cache
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# Copy the rest and build
COPY . .
# If you generate code (e.g., drizzle generate/prisma generate), do it here before build
# RUN pnpm run db:generate
RUN pnpm build

# ===== Production deps (pruned) =====
FROM node:24-bookworm-slim AS prod-deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.21.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod

# ===== Runner Stage =====
FROM base AS runner
WORKDIR /app

# Build metadata (kept in final image for observability)
ARG APP_VERSION=N/A
ARG APP_FULL_VERSION=N/A
ARG APP_COMMITS_SINCE_TAG=0
ARG APP_BUILD_TIMESTAMP=N/A
ARG APP_GIT_HASH=N/A
ARG APP_SERVICE=backend
ARG APP_ORIGIN=local
ARG APP_CHANNEL=unknown
ARG APP_CHANNEL_TAG=unknown
ARG APP_GIT_DIRTY=false
ARG APP_CI_RUN_ID=""
ARG APP_CI_RUN_NUMBER=""

ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    APP_FULL_VERSION=${APP_FULL_VERSION} \
    APP_COMMITS_SINCE_TAG=${APP_COMMITS_SINCE_TAG} \
    APP_BUILD_TIMESTAMP=${APP_BUILD_TIMESTAMP} \
    APP_GIT_HASH=${APP_GIT_HASH} \
    PORT=3001 \
    HOST=0.0.0.0 \
    NODE_OPTIONS=--enable-source-maps

# OCI Labels for provenance
LABEL org.opencontainers.image.title="Eclaire Backend" \
      org.opencontainers.image.description="Eclaire Backend Service" \
      org.opencontainers.image.source="https://github.com/eclaire-labs/eclaire" \
      org.opencontainers.image.url="https://eclaire.co" \
      org.opencontainers.image.documentation="https://eclaire.co/docs/" \
      org.opencontainers.image.authors="Eclaire Labs <https://github.com/eclaire-labs/>" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version=$APP_FULL_VERSION \
      org.opencontainers.image.revision=$APP_GIT_HASH \
      org.opencontainers.image.created=$APP_BUILD_TIMESTAMP \
      org.opencontainers.image.vendor="Eclaire Labs" \
      co.eclaire.service=$APP_SERVICE \
      co.eclaire.origin=$APP_ORIGIN \
      co.eclaire.channel=$APP_CHANNEL \
      co.eclaire.channel_tag=$APP_CHANNEL_TAG \
      co.eclaire.git_dirty=$APP_GIT_DIRTY \
      co.eclaire.ci_run_id=$APP_CI_RUN_ID \
      co.eclaire.ci_run_number=$APP_CI_RUN_NUMBER

# Copy dumb-init for PID1
COPY --from=base /usr/bin/dumb-init /usr/bin/dumb-init

# Copy pruned production node_modules and runtime files
COPY --from=prod-deps --chown=nodeapp:nodeapp /app/node_modules ./node_modules
COPY --from=builder  --chown=nodeapp:nodeapp /app/package.json ./
COPY --from=builder  --chown=nodeapp:nodeapp /app/pnpm-lock.yaml ./
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
