# Production Dockerfile for Eclaire Frontend (Next.js)
FROM node:22-bookworm-slim AS base

RUN apt-get update && apt-get install -y curl dumb-init \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Create app user for security (you could also just use the built-in `node` user)
RUN groupadd -r nextjs && useradd -r -g nextjs nextjs

# ===== Builder Stage =====
FROM base AS builder

# Build metadata
ARG BACKEND_URL
ARG APP_VERSION=N/A
ARG APP_FULL_VERSION=N/A
ARG APP_BUILD_NUMBER=N/A
ARG APP_BUILD_TIMESTAMP=N/A
ARG APP_GIT_HASH=N/A

ENV NEXT_TELEMETRY_DISABLED=1 \
    APP_VERSION=${APP_VERSION} \
    APP_FULL_VERSION=${APP_FULL_VERSION} \
    APP_BUILD_NUMBER=${APP_BUILD_NUMBER} \
    APP_BUILD_TIMESTAMP=${APP_BUILD_TIMESTAMP} \
    APP_GIT_HASH=${APP_GIT_HASH} \
    BACKEND_URL=${BACKEND_URL}

# 1) Install deps with cache
COPY package.json package-lock.json ./
# Use BuildKit cache for faster incremental builds
RUN --mount=type=cache,target=/root/.npm npm ci

# 2) Copy source
COPY . .
# Put the changelog directly where you serve it
# (Assumes CHANGELOG.md is present in context; see compose/Makefile notes)
RUN mkdir -p public && cp -f ./CHANGELOG.md ./public/changelog.md

# 3) Build
RUN npm run build

# ===== Runner Stage =====
FROM base AS runner

ARG APP_VERSION=N/A
ARG APP_FULL_VERSION=N/A
ARG APP_BUILD_NUMBER=N/A
ARG APP_BUILD_TIMESTAMP=N/A
ARG APP_GIT_HASH=N/A

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    APP_VERSION=${APP_VERSION} \
    APP_FULL_VERSION=${APP_FULL_VERSION} \
    APP_BUILD_NUMBER=${APP_BUILD_NUMBER} \
    APP_BUILD_TIMESTAMP=${APP_BUILD_TIMESTAMP} \
    APP_GIT_HASH=${APP_GIT_HASH} \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Labels for provenance
LABEL org.opencontainers.image.title="Eclaire Frontend" \
      org.opencontainers.image.description="Eclaire Frontend Application" \
      org.opencontainers.image.version=$APP_FULL_VERSION \
      org.opencontainers.image.revision=$APP_GIT_HASH \
      org.opencontainers.image.created=$APP_BUILD_TIMESTAMP \
      org.opencontainers.image.source="https://github.com/eclaire-labs/eclaire" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Eclaire Labs"

# Copy dumb-init for proper signal handling
COPY --from=base /usr/bin/dumb-init /usr/bin/dumb-init

# Copy the standalone output (includes node_modules for runtime)
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -fsS -A "Docker-Health-Check" http://localhost:3000/api/health 2>/dev/null || \
      curl -fsS -A "Docker-Health-Check" http://localhost:3000/ 2>/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
