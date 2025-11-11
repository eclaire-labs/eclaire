# Production Dockerfile for Eclaire Workers
# Goal: heavy deps only in builder; slim, non-root runner

# ===== Base runtime (slim) =====
FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init curl ca-certificates fontconfig \
    fonts-liberation fonts-dejavu-core fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*
RUN groupadd -r nodeapp && useradd -r -g nodeapp -m -d /home/nodeapp nodeapp

# ===== Builder (heavy deps + browsers installed once) =====
FROM node:24-bookworm-slim AS builder
WORKDIR /app

# Build tools (only here)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    # Document & image tooling needed at build-time or to stage into runtime:
    libreoffice libreoffice-writer libreoffice-calc libreoffice-impress \
    graphicsmagick imagemagick ghostscript poppler-utils libheif1 \
    # Playwright deps (single shot via playwright's script)
    libnss3 libnspr4 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libxss1 libasound2 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Optional: If you prefer, replace all the specific Playwright libs with:
# RUN npx playwright install-deps

# (Optional) tighten ImageMagick policy instead of fully removing PDF deny rules
# COPY ./docker/imagemagick-policy.xml /etc/ImageMagick-6/policy.xml

# Install deps (dev included) with cache
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10.21.0 --activate
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# Install patchright browsers (needed for workers)
RUN pnpm dlx patchright install chromium

# Copy source and build
COPY . .
# Do NOT set NODE_ENV=production in builder; you need devDeps to build
ARG APP_VERSION=N/A
ARG APP_FULL_VERSION=N/A
ARG APP_COMMITS_SINCE_TAG=0
ARG APP_BUILD_TIMESTAMP=N/A
ARG APP_GIT_HASH=N/A
ENV NEXT_TELEMETRY_DISABLED=1 \
    APP_VERSION=${APP_VERSION} \
    APP_FULL_VERSION=${APP_FULL_VERSION} \
    APP_COMMITS_SINCE_TAG=${APP_COMMITS_SINCE_TAG} \
    APP_BUILD_TIMESTAMP=${APP_BUILD_TIMESTAMP} \
    APP_GIT_HASH=${APP_GIT_HASH}
RUN pnpm build

# ===== Production deps (pruned) =====
FROM node:24-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10.21.0 --activate
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod

# ===== Runner (slim) =====
FROM base AS runner
WORKDIR /app

# Build metadata
ARG APP_VERSION=N/A
ARG APP_FULL_VERSION=N/A
ARG APP_COMMITS_SINCE_TAG=0
ARG APP_BUILD_TIMESTAMP=N/A
ARG APP_GIT_HASH=N/A
ARG APP_SERVICE=workers
ARG APP_ORIGIN=local
ARG APP_CHANNEL=unknown
ARG APP_CHANNEL_TAG=unknown
ARG APP_GIT_DIRTY=false
ARG APP_CI_RUN_ID=""
ARG APP_CI_RUN_NUMBER=""

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    APP_VERSION=${APP_VERSION} \
    APP_FULL_VERSION=${APP_FULL_VERSION} \
    APP_COMMITS_SINCE_TAG=${APP_COMMITS_SINCE_TAG} \
    APP_BUILD_TIMESTAMP=${APP_BUILD_TIMESTAMP} \
    APP_GIT_HASH=${APP_GIT_HASH} \
    HOST=0.0.0.0 \
    PLAYWRIGHT_BROWSERS_PATH=/home/nodeapp/.cache/ms-playwright \
    NODE_OPTIONS=--enable-source-maps

# OCI labels (consistent with frontend)
LABEL org.opencontainers.image.title="Eclaire Workers" \
      org.opencontainers.image.description="Eclaire background/queue workers" \
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

# PID1
COPY --from=base /usr/bin/dumb-init /usr/bin/dumb-init

# Prod deps and app
COPY --from=prod-deps --chown=nodeapp:nodeapp /app/node_modules ./node_modules
COPY --from=builder   --chown=nodeapp:nodeapp /app/package*.json ./
COPY --from=builder   --chown=nodeapp:nodeapp /app/dist ./dist
COPY --from=builder   --chown=nodeapp:nodeapp /root/.cache/ms-playwright /home/nodeapp/.cache/ms-playwright

# Install runtime dependencies for document/image processing and Playwright browsers
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

# Replace ImageMagick policy with PDF read-only + resource limits for security
RUN printf '%s\n' "\
<policymap>\n\
  <!-- Resource limits to mitigate DoS -->\n\
  <policy domain=\"resource\" name=\"memory\" value=\"512MiB\"/>\n\
  <policy domain=\"resource\" name=\"map\"    value=\"1GiB\"/>\n\
  <policy domain=\"resource\" name=\"area\"   value=\"256MiB\"/>\n\
  <policy domain=\"resource\" name=\"disk\"   value=\"2GiB\"/>\n\
  <!-- Allow PDF decoding only; keep PS/EPS/XPS denied -->\n\
  <policy domain=\"coder\" rights=\"read\" pattern=\"PDF\"/>\n\
</policymap>\n" > /etc/ImageMagick-6/policy.xml

# Create necessary directories and set permissions (consistent with old Dockerfile)
RUN mkdir -p /app/logs /app/tmp /app/data/browser-data /app/tools && \
    chown -R nodeapp:nodeapp /app /home/nodeapp && \
    # Ensure /tmp is writable for temp file operations
    chmod 1777 /tmp
USER nodeapp

# Workers expose Bull Board UI and health endpoint
EXPOSE 3002

# Health check using HTTP endpoint (port 3002 from config)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f -A "Docker-Health-Check" http://localhost:3002/health 2>/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
