#!/usr/bin/env bash
set -euo pipefail

RELEASE_MODE_FLAG=false
NO_CACHE_FLAG=false
CACHED_FLAG=false
PARSED_ARGS=()

# Parse CLI
while [[ $# -gt 0 ]]; do
  case $1 in
    --release)     RELEASE_MODE_FLAG=true; shift ;;
    --no-cache)    NO_CACHE_FLAG=true; shift ;;
    --cached)      CACHED_FLAG=true; shift ;;
    *)             PARSED_ARGS+=("$1"); shift ;;
  esac
done
if [[ ${#PARSED_ARGS[@]} -gt 0 ]]; then set -- "${PARSED_ARGS[@]}"; else set --; fi

# Compute version/build from git (and optionally CI env)
source ./scripts/version.sh

# Default to dev mode unless --release was explicitly passed
if [ "$RELEASE_MODE_FLAG" = "true" ]; then
  RELEASE_MODE=true
else
  RELEASE_MODE=false
fi

# Gather additional build metadata
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
GIT_BRANCH="${GIT_BRANCH:-${CHANNEL}}"

# Detect origin and CI provider
if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  ORIGIN="ci"
  CI_PROVIDER="github"
  CI_RUN_ID="${GITHUB_RUN_ID:-}"
  CI_RUN_NUMBER="${GITHUB_RUN_NUMBER:-}"
  CI_WORKFLOW="${GITHUB_WORKFLOW:-}"
  CI_REF="${GITHUB_REF:-}"
  CI_ACTOR="${GITHUB_ACTOR:-}"
  BUILDER="github-actions"
elif [[ -n "${CI:-}" ]]; then
  ORIGIN="ci"
  CI_PROVIDER="unknown"
  CI_RUN_ID=""
  CI_RUN_NUMBER=""
  CI_WORKFLOW=""
  CI_REF=""
  CI_ACTOR=""
  BUILDER="ci"
else
  ORIGIN="local"
  CI_PROVIDER=""
  CI_RUN_ID=""
  CI_RUN_NUMBER=""
  CI_WORKFLOW=""
  CI_REF=""
  CI_ACTOR=""
  BUILDER="$(whoami)@$(hostname)"
fi

# GIT_DIRTY is already set by version.sh

# If --release, enforce your existing clean/tag checks (re-using SEMVER)
if [ "$RELEASE_MODE" = true ]; then
  if [ "$GIT_DIRTY" = true ]; then
    echo "❌ Uncommitted changes."; git status --short; exit 1
  fi
  EXPECTED_TAG="v${SEMVER}"
  TAG_HASH=$(git rev-parse "$EXPECTED_TAG^{commit}" 2>/dev/null || true)
  HEAD_HASH=$(git rev-parse HEAD)
  if [ -z "$TAG_HASH" ] || [ "$TAG_HASH" != "$HEAD_HASH" ]; then
    echo "❌ HEAD must match ${EXPECTED_TAG} for a release build."; exit 1
  fi
fi

# Convert DOCKER_TAGS to JSON array format
DOCKER_TAGS_JSON="["
first=true
for tag in $DOCKER_TAGS; do
  if [ "$first" = true ]; then
    DOCKER_TAGS_JSON+="\"${tag}\""
    first=false
  else
    DOCKER_TAGS_JSON+=",\"${tag}\""
  fi
done
DOCKER_TAGS_JSON+="]"

# Build-info for your tooling
cat > build-info.json << EOF
{
  "version": "${SEMVER}",
  "fullVersion": "${FULL_VERSION}",
  "major": ${MAJOR},
  "minor": ${MINOR},
  "patch": ${PATCH},
  "commitsSinceTag": ${COMMITS_SINCE_TAG},
  "buildTimestamp": "${BUILD_TIMESTAMP}",
  "gitHash": "${GIT_HASH}",
  "shortSha": "${SHORT_SHA}",
  "gitBranch": "${GIT_BRANCH}",
  "gitDirty": ${GIT_DIRTY},
  "channel": "${CHANNEL}",
  "channelSafe": "${CHANNEL_SAFE}",
  "channelTagSafe": "${CHANNEL_TAG_SAFE}",
  "dockerTag": "${DOCKER_TAG}",
  "dockerTags": ${DOCKER_TAGS_JSON},
  "releaseMode": ${RELEASE_MODE},
  "origin": "${ORIGIN}",
  "ciProvider": "${CI_PROVIDER}",
  "ciRunId": "${CI_RUN_ID}",
  "ciRunNumber": "${CI_RUN_NUMBER}",
  "ciWorkflow": "${CI_WORKFLOW}",
  "ciRef": "${CI_REF}",
  "ciActor": "${CI_ACTOR}",
  "builder": "${BUILDER}",
  "service": "",
  "createdAt": "${BUILD_TIMESTAMP}",
  "buildTool": "build.sh"
}
EOF

echo "========================================="
echo "Building v${SEMVER} (${COMMITS_SINCE_TAG} commits since tag, sha ${SHORT_SHA})"
echo "========================================="

ALL_SERVICES=(backend)
if [[ $# -gt 0 ]]; then SERVICES=("$@"); else SERVICES=("${ALL_SERVICES[@]}"); fi

for svc in "${SERVICES[@]}"; do
  echo -e ""
  echo "--------------------------------------------------------------------------------------------------"
  printf "Building %s %s\n" "$svc" "$FULL_VERSION"
  echo "--------------------------------------------------------------------------------------------------"

  # Determine base image tag (single consolidated image)
  BASE_IMAGE_TAG="eclaire"

  # Build tags array
  TAGS=()
  if [[ "$RELEASE_MODE" == "true" ]]; then
    TAGS+=( -t "${BASE_IMAGE_TAG}:${SEMVER}" )
    TAGS+=( -t "${BASE_IMAGE_TAG}:${MAJOR}.${MINOR}" )
    TAGS+=( -t "${BASE_IMAGE_TAG}:latest" )
  else
    for tag in $DOCKER_TAGS; do
      TAGS+=( -t "${BASE_IMAGE_TAG}:${tag}" )
    done
  fi

  # Build args array
  BUILD_ARGS=(
    --build-arg "APP_VERSION=${SEMVER}"
    --build-arg "APP_FULL_VERSION=${FULL_VERSION}"
    --build-arg "APP_COMMITS_SINCE_TAG=${COMMITS_SINCE_TAG}"
    --build-arg "APP_BUILD_TIMESTAMP=${BUILD_TIMESTAMP}"
    --build-arg "APP_GIT_HASH=${GIT_HASH}"
    --build-arg "APP_SERVICE=${svc}"
    --build-arg "APP_ORIGIN=${ORIGIN}"
    --build-arg "APP_CHANNEL=${CHANNEL_SAFE}"
    --build-arg "APP_CHANNEL_TAG=${CHANNEL_TAG_SAFE}"
    --build-arg "APP_GIT_DIRTY=${GIT_DIRTY}"
    --build-arg "APP_CI_RUN_ID=${CI_RUN_ID}"
    --build-arg "APP_CI_RUN_NUMBER=${CI_RUN_NUMBER}"
  )

  # Build the image from root context (for monorepo with shared pnpm-lock.yaml)
  # Default: bust source stages to prevent stale builds, keep slow deps cached
  CACHE_FLAG=()
  if [[ "$NO_CACHE_FLAG" == "true" ]]; then
    # Full rebuild, no caching at all
    CACHE_FLAG=(--no-cache)
  elif [[ "$CACHED_FLAG" == "true" ]]; then
    # Use full Docker cache (risky - may serve stale builds)
    CACHE_FLAG=()
  else
    # DEFAULT: Bust source stages only, keep base/browser-installer/runner apt cached
    CACHE_FLAG=(
      --no-cache-filter=frontend-builder
      --no-cache-filter=builder
      --no-cache-filter=prod-deps
    )
  fi

  docker build \
    -f "apps/${svc}/Dockerfile" \
    "${TAGS[@]}" \
    "${BUILD_ARGS[@]}" \
    "${CACHE_FLAG[@]}" \
    . || { echo "❌ ${svc} build failed"; exit 1; }

  echo "✅ ${svc} done."
  echo "📋 Images tagged as:"
  for tag in "${TAGS[@]}"; do
    [[ "$tag" != "-t" ]] && echo "   ${tag}"
  done
done

# Generate compose.local.yaml with the built image tags
echo "📝 Generating compose.local.yaml..."
cat > compose.local.yaml << EOF
# Auto-generated by scripts/build.sh - DO NOT EDIT
# Built on: ${BUILD_TIMESTAMP}
# Version: ${FULL_VERSION}

services:
EOF

cat >> compose.local.yaml << EOF
  eclaire:
    image: eclaire:${DOCKER_TAG}
    environment:
      ECLAIRE_LOCAL_BUILD: "true"
EOF

echo -e "\n✅ Build complete: ${SEMVER} (${COMMITS_SINCE_TAG} commits since tag, sha ${SHORT_SHA})"
echo -e "\n📦 Local images tagged:"
for tag in $DOCKER_TAGS; do
  echo "   - eclaire:${tag}"
done
echo -e "\n📝 Created compose.local.yaml with local image tags"
echo -e "\n🚀 To run with local images, use:"
echo "   docker compose -f compose.yaml -f compose.dev.yaml -f compose.local.yaml up"
echo -e "\n"