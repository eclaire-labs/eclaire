#!/bin/bash

# Eclaire – Global Build Script (Production Only)
# ----------------------------------------------------
# This script builds the Docker images for the different Eclaire services (backend, frontend, workers)
# by delegating to each service's own docker-build.sh helper.
#
# Since the project has migrated to production-only containers, this script only builds production images.
#
# Usage:
#   ./build.sh [service ...] [--backend-url BACKEND_URL] [--release]
#
# Arguments:
#   1+. Service names (optional) – Any combination of "backend", "frontend", "workers".
#       If no service names are provided, all services will be built.
#   --backend-url BACKEND_URL (optional) – Override the backend URL for frontend builds (build-time operations).
#   --release (optional) – Enforce git validation checks for production releases.
#
# Examples:
#   ./build.sh                 # Build ALL services for development
#   ./build.sh backend         # Build only the backend
#   ./build.sh backend frontend  # Build backend & frontend
#   ./build.sh --backend-url http://backend:3001  # Build all with custom backend URL
#   ./build.sh frontend --backend-url http://backend:3001  # Build frontend with custom backend URL
#   ./build.sh --release       # Build all services with git validation for release
#   ./build.sh backend --release  # Build backend with git validation
#
# For Docker cleanup, use: ./scripts/docker-cleanup.sh [options]

set -euo pipefail

# Initialize variables
RELEASE_MODE=false

# Version management: Read versions.json and build number from separate files
VERSION_FILE="versions.json"
BUILD_NUMBER_FILE=".build_number"

if [[ ! -f "$VERSION_FILE" ]]; then
  echo "❌ Error: $VERSION_FILE not found. Please create it with major, minor, and patch versions."
  exit 1
fi

if [[ ! -f "$BUILD_NUMBER_FILE" ]]; then
  echo "❌ Error: $BUILD_NUMBER_FILE not found. Please create it with initial build number."
  exit 1
fi

# Get version info
MAJOR=$(jq -r '.major' "$VERSION_FILE")
MINOR=$(jq -r '.minor' "$VERSION_FILE")
PATCH=$(jq -r '.patch' "$VERSION_FILE")
SEMANTIC_VERSION="${MAJOR}.${MINOR}.${PATCH}"
EXPECTED_TAG="v${SEMANTIC_VERSION}"

# Git validation checks (only for release builds)
if [ "$RELEASE_MODE" = true ]; then
  # 1. Check if working directory is clean (no uncommitted changes)
  if ! git diff-index --quiet HEAD --; then
    echo "❌ ERROR: Uncommitted changes detected."
    echo "Please commit or stash your changes before creating a release build."
    git status --short # Show the user what is uncommitted
    exit 1
  fi
  echo "✅ Git working directory is clean."

  # 2. Check if the current commit hash matches the version tag's hash
  # Get the commit hash that the tag points to. Suppress errors if tag doesn't exist.
  TAG_HASH=$(git rev-parse "$EXPECTED_TAG^{commit}" 2>/dev/null || true)
  HEAD_HASH=$(git rev-parse HEAD)

  if [ -z "$TAG_HASH" ]; then
    echo "❌ ERROR: Release tag '${EXPECTED_TAG}' not found."
    echo "Please create and push the tag for version ${SEMANTIC_VERSION} before building."
    echo "Run: git tag ${EXPECTED_TAG} && git push origin main --tags"
    exit 1
  fi

  if [ "$TAG_HASH" != "$HEAD_HASH" ]; then
    echo "❌ ERROR: Git HEAD does not match the '${EXPECTED_TAG}' tag."
    echo "You must be on the exact commit that was tagged for a release build."
    echo "  - Commit for tag '${EXPECTED_TAG}': ${TAG_HASH}"
    echo "  - Current HEAD commit:          ${HEAD_HASH}"
    echo "Run 'git checkout ${EXPECTED_TAG}' to fix this."
    exit 1
  fi
  echo "✅ Git HEAD matches the release tag '${EXPECTED_TAG}'."
else
  echo "ℹ️  Skipping git validation checks (use --release flag to enable)"
fi

# Read and increment build number
BUILD=$(cat "$BUILD_NUMBER_FILE")
BUILD=$((BUILD + 1))

# Update build number file
echo "$BUILD" > "$BUILD_NUMBER_FILE"

# Generate build metadata
BUILD_TIMESTAMP=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
FULL_VERSION="${SEMANTIC_VERSION}+build.${BUILD}"
GIT_HASH=$(git rev-parse --short HEAD)
BUILD_HOST=$(hostname)

echo "🏗️  Building Eclaire v${SEMANTIC_VERSION} (build ${BUILD}, ${GIT_HASH})"
echo "📦 Semantic version: ${SEMANTIC_VERSION}"
echo "🔧 Full version: ${FULL_VERSION}"
echo "📅 Build timestamp: $BUILD_TIMESTAMP"

# Create build-info.json for backup CLI and other tools
cat > build-info.json << EOF
{
  "version": "${SEMANTIC_VERSION}",
  "fullVersion": "${FULL_VERSION}",
  "major": ${MAJOR},
  "minor": ${MINOR},
  "patch": ${PATCH},
  "build": ${BUILD},
  "buildTimestamp": "${BUILD_TIMESTAMP}",
  "gitHash": "${GIT_HASH}",
  "buildHost": "${BUILD_HOST}",
  "releaseMode": ${RELEASE_MODE},
  "createdAt": "${BUILD_TIMESTAMP}",
  "buildTool": "build.sh"
}
EOF

echo "📄 Created build-info.json with build metadata"

# Parse arguments for backend URL override and release flag
BACKEND_URL_OVERRIDE=""
PARSED_ARGS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    --backend-url)
      BACKEND_URL_OVERRIDE="$2"
      shift 2
      ;;
    --release)
      RELEASE_MODE=true
      shift
      ;;
    *)
      PARSED_ARGS+=("$1")
      shift
      ;;
  esac
done

# Restore parsed arguments
if [[ ${#PARSED_ARGS[@]} -gt 0 ]]; then
  set -- "${PARSED_ARGS[@]}"
else
  set --
fi

# Array of all supported services
ALL_SERVICES=(backend frontend workers)
# If the user provided specific service names, use those; otherwise, build all.
if [[ $# -gt 0 ]]; then
  SERVICES=("$@")
else
  SERVICES=("${ALL_SERVICES[@]}")
fi

# Validate service names
for svc in "${SERVICES[@]}"; do
  if [[ ! " ${ALL_SERVICES[*]} " =~ " ${svc} " ]]; then
    echo "❌ Error: Unknown service '${svc}'. Valid options are: ${ALL_SERVICES[*]}"
    exit 1
  fi
done

# Display override info
if [[ -n "$BACKEND_URL_OVERRIDE" ]]; then
  echo "🔧 Backend URL Override: $BACKEND_URL_OVERRIDE"
fi

# Build each requested service
for svc in "${SERVICES[@]}"; do
  SCRIPT_PATH="apps/${svc}/docker-build.sh"
  if [[ -x "$SCRIPT_PATH" ]]; then
    # Use printf for portable newlines and avoid Bash 4 string substitution
    printf "\n==============================\n"
    printf "Building %s v%s (Production)\n" "$svc" "$FULL_VERSION"
    printf "==============================\n"
    
    # Update package.json version before building (use semantic version)
    PACKAGE_JSON="apps/${svc}/package.json"
    if [[ -f "$PACKAGE_JSON" ]]; then
      jq --arg version "$SEMANTIC_VERSION" '.version = $version' "$PACKAGE_JSON" > "${PACKAGE_JSON}.tmp" && mv "${PACKAGE_JSON}.tmp" "$PACKAGE_JSON"
      echo "📦 Updated ${svc} package.json to v${SEMANTIC_VERSION}"
    fi
    
    # Pass version and build metadata to build scripts
    export VERSION="$SEMANTIC_VERSION"
    export FULL_VERSION="$FULL_VERSION"
    export MAJOR="$MAJOR"
    export MINOR="$MINOR"
    export PATCH="$PATCH"
    export BUILD="$BUILD"
    export BUILD_TIMESTAMP="$BUILD_TIMESTAMP"
    export GIT_HASH="$GIT_HASH"
    
    # Pass backend URL override to frontend builds
    if [[ "$svc" == "frontend" && -n "$BACKEND_URL_OVERRIDE" ]]; then
      (cd "apps/${svc}" && ./docker-build.sh "$BACKEND_URL_OVERRIDE")
    else
      (cd "apps/${svc}" && ./docker-build.sh)
    fi
  else
    echo "⚠️  Skipping ${svc}: build script not found or not executable at ${SCRIPT_PATH}"
  fi
done

echo "\n✅ Global build completed for production environment"
echo "🎯 Built version: ${SEMANTIC_VERSION} (build ${BUILD}, ${GIT_HASH})"
echo "🐳 Docker images tagged with: ${SEMANTIC_VERSION}, ${MAJOR}.${MINOR}, latest" 