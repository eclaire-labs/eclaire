# Production Dockerfile for Eclaire (unified backend + frontend)
# --- Base runtime kept minimal; build tools live in builder only

# Patchright version for browser installation (keep in sync with package.json)
ARG PATCHRIGHT_VERSION=1.57.0

FROM node:24-bookworm-slim AS base
WORKDIR /app

# Install only what runtime truly needs (curl for healthcheck, dumb-init for PID1)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl dumb-init ca-certificates \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd -r nodeapp && useradd -r -g nodeapp -m -d /home/nodeapp nodeapp

# ===== Browser Cache Stage =====
# Isolated from dependency changes - only rebuilds when patchright version changes
FROM node:24-bookworm-slim AS browser-installer
ARG PATCHRIGHT_VERSION
WORKDIR /browsers

# Install only patchright at specific version for browser download
RUN npm init -y && npm install patchright@${PATCHRIGHT_VERSION}

# Download chromium browser
RUN npx patchright install chromium

# ===== Frontend Builder Stage =====
FROM node:24-bookworm-slim AS frontend-builder
WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.21.0 --activate

# Copy workspace root files and frontend package.json
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/frontend/package.json ./apps/frontend/

# Install frontend dependencies
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter=@eclaire/frontend...

# Copy frontend source and build
COPY apps/frontend ./apps/frontend/
WORKDIR /app/apps/frontend
RUN pnpm build

# ===== Backend Builder Stage =====
# Includes build toolchain for native modules & TS compile + worker dependencies
FROM node:24-bookworm-slim AS builder
WORKDIR /app

# Build tools needed to compile native deps + worker processing tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    # Document & image tooling needed at build-time:
    libreoffice libreoffice-writer libreoffice-calc libreoffice-impress \
    graphicsmagick imagemagick ghostscript poppler-utils libheif1 \
    # Playwright deps
    libnss3 libnspr4 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libxss1 libasound2 \
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
# Copy workspace root files and package.json files
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/db/package.json ./packages/db/
COPY packages/queue/package.json ./packages/queue/
COPY packages/core/package.json ./packages/core/
COPY packages/logger/package.json ./packages/logger/
COPY packages/storage/package.json ./packages/storage/
COPY packages/ai/package.json ./packages/ai/

# Install dependencies for backend workspace (includes workspace packages)
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    SHARP_IGNORE_GLOBAL_LIBVIPS=1 pnpm install --frozen-lockfile --filter=@eclaire/backend...

# Copy source code
COPY apps/backend ./apps/backend/
COPY packages ./packages/
WORKDIR /app/apps/backend
# If you generate code (e.g., drizzle generate/prisma generate), do it here before build
# RUN pnpm run db:generate

# Build workspace packages first (backend depends on their compiled dist/ output)
RUN pnpm --filter @eclaire/core build && \
    pnpm --filter @eclaire/logger build && \
    pnpm --filter @eclaire/storage build && \
    pnpm --filter @eclaire/ai build && \
    pnpm --filter @eclaire/db build && \
    pnpm --filter @eclaire/queue build

RUN pnpm build

# ===== Production deps (pruned) =====
FROM builder AS prod-deps

# At this point, /app/apps/backend/dist already exists from builder
# Deploy the standalone backend with prod dependencies (now includes worker deps)
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm deploy --filter=@eclaire/backend --prod /deploy

# ===== Runner Stage =====
FROM base AS runner
WORKDIR /app

# Install runtime dependencies FIRST (cached unless package list changes)
# This layer is isolated from code changes in COPY commands below
RUN apt-get update && apt-get install -y --no-install-recommends \
    # LibreOffice for document processing
    libreoffice libreoffice-writer libreoffice-calc libreoffice-impress \
    # Image processing tools
    graphicsmagick imagemagick ghostscript poppler-utils libheif1 \
    # Playwright browser runtime dependencies
    libatk1.0-0 libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 \
    libgbm1 libxkbcommon0 libasound2 libnss3 libnspr4 libatk-bridge2.0-0 \
    libdrm2 libxrandr2 libxss1 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# ImageMagick security policy (allow PDF read-only + resource limits)
RUN printf '%s\n' "\
<policymap>\n\
  <policy domain=\"resource\" name=\"memory\" value=\"512MiB\"/>\n\
  <policy domain=\"resource\" name=\"map\"    value=\"1GiB\"/>\n\
  <policy domain=\"resource\" name=\"area\"   value=\"256MiB\"/>\n\
  <policy domain=\"resource\" name=\"disk\"   value=\"2GiB\"/>\n\
  <policy domain=\"coder\" rights=\"read\" pattern=\"PDF\"/>\n\
</policymap>\n" > /etc/ImageMagick-6/policy.xml

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
    PLAYWRIGHT_BROWSERS_PATH=/home/nodeapp/.cache/ms-playwright \
    NODE_OPTIONS=--enable-source-maps

# OCI Labels for provenance
LABEL org.opencontainers.image.title="Eclaire Backend" \
      org.opencontainers.image.description="Eclaire unified service - Supports backend, worker, and unified modes via SERVICE_ROLE" \
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
      co.eclaire.supports_modes="backend,worker,unified" \
      co.eclaire.origin=$APP_ORIGIN \
      co.eclaire.channel=$APP_CHANNEL \
      co.eclaire.channel_tag=$APP_CHANNEL_TAG \
      co.eclaire.git_dirty=$APP_GIT_DIRTY \
      co.eclaire.ci_run_id=$APP_CI_RUN_ID \
      co.eclaire.ci_run_number=$APP_CI_RUN_NUMBER

# Copy dumb-init for PID1
COPY --from=base /usr/bin/dumb-init /usr/bin/dumb-init

# Copy standalone deployment from pnpm deploy (includes node_modules, package.json, and dist)
COPY --from=prod-deps --chown=nodeapp:nodeapp /deploy ./
# Copy browser cache from browser-installer (isolated from dependency changes)
COPY --from=browser-installer --chown=nodeapp:nodeapp /root/.cache/ms-playwright /home/nodeapp/.cache/ms-playwright

# Copy frontend dist for SPA serving
COPY --from=frontend-builder --chown=nodeapp:nodeapp /app/apps/frontend/dist ./frontend-dist
ENV FRONTEND_DIST_PATH=/app/frontend-dist

# Copy additional runtime files
COPY --from=builder  --chown=nodeapp:nodeapp /app/apps/backend/tool-signatures.json ./

# --- Optional runtime DB tooling (only if used at container runtime) ---
# If your entrypoint or ops scripts call these, keep them; otherwise omit.
COPY --from=builder  --chown=nodeapp:nodeapp /app/apps/backend/scripts ./scripts
# Note: Migrations are bundled in @eclaire/db package via pnpm deploy (node_modules/@eclaire/db/src/migrations/)
# These copies provide fallback/explicit access if needed by scripts
COPY --from=builder  --chown=nodeapp:nodeapp /app/packages/db/src/migrations/postgres ./migrations/postgres
COPY --from=builder  --chown=nodeapp:nodeapp /app/packages/db/src/migrations/sqlite ./migrations/sqlite

# Permissions (include browser-data for worker mode)
RUN mkdir -p /app/data /app/logs /app/browser-data /app/tmp \
 && chown -R nodeapp:nodeapp /app /home/nodeapp \
 && chmod 1777 /tmp

# Copy entrypoint script (path relative to repo root - the build context)
COPY --chown=nodeapp:nodeapp apps/backend/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nodeapp
EXPOSE 3000
# Also expose 3002 for Bull Board when SERVICE_ROLE=worker
EXPOSE 3002

# Healthcheck (give app time to boot)
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD curl -fsS -A "Docker-Health-Check" http://127.0.0.1:3000/health 2>/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--", "/app/docker-entrypoint.sh"]
CMD []
