#!/bin/bash

# Eclaire Frontend - Production Build

set -e

echo "🔨 Building Eclaire Frontend (Production)..."

# Copy CHANGELOG.md from project root for Docker build context
echo "📋 Copying CHANGELOG.md from project root..."
cp ../../CHANGELOG.md ./CHANGELOG.md

# Parse optional BACKEND_URL override for build-time API docs generation
BACKEND_URL_OVERRIDE=""
if [[ $# -ge 1 ]]; then
    BACKEND_URL_OVERRIDE="$1"
    echo "🔧 Using custom BACKEND_URL for build: $BACKEND_URL_OVERRIDE"
fi

# Define constants
DOCKERFILE="Dockerfile"
BASE_IMAGE_TAG="eclaire-frontend"

# Get version and build metadata from environment (set by build.sh) or defaults
VERSION=${VERSION:-"dev"}                    # Semantic version (0.1.0)
FULL_VERSION=${FULL_VERSION:-"dev"}          # Full version with build (0.1.0+build.38)
MAJOR=${MAJOR:-"0"}
MINOR=${MINOR:-"0"}
PATCH=${PATCH:-"0"}
BUILD=${BUILD:-"1"}
BUILD_TIMESTAMP=${BUILD_TIMESTAMP:-$(date -u +'%Y-%m-%dT%H:%M:%SZ')}
GIT_HASH=${GIT_HASH:-"unknown"}              # Git hash injected at build time

# Prepare build arguments with build metadata
BUILD_ARGS=(
    --build-arg "APP_VERSION=$VERSION"
    --build-arg "APP_FULL_VERSION=$FULL_VERSION"
    --build-arg "APP_BUILD_NUMBER=$BUILD"
    --build-arg "APP_BUILD_TIMESTAMP=$BUILD_TIMESTAMP"
    --build-arg "APP_GIT_HASH=$GIT_HASH"
)
if [[ -n "$BACKEND_URL_OVERRIDE" ]]; then
    BUILD_ARGS+=(--build-arg "BACKEND_URL=$BACKEND_URL_OVERRIDE")
fi

# Build the Docker image with multiple tags
docker build \
    -f "$DOCKERFILE" \
    -t "${BASE_IMAGE_TAG}:${VERSION}" \
    -t "${BASE_IMAGE_TAG}:${VERSION}-build.${BUILD}" \
    -t "${BASE_IMAGE_TAG}:${MAJOR}.${MINOR}" \
    -t "${BASE_IMAGE_TAG}:latest" \
    "${BUILD_ARGS[@]}" \
    .

echo "✅ Production build completed!"
echo "📋 Images tagged as:"
echo "   - ${BASE_IMAGE_TAG}:${VERSION} (semantic version)"
echo "   - ${BASE_IMAGE_TAG}:${VERSION}-build.${BUILD} (with build metadata)"
echo "   - ${BASE_IMAGE_TAG}:${MAJOR}.${MINOR} (minor version)"
echo "   - ${BASE_IMAGE_TAG}:latest"
if [[ -n "$BACKEND_URL_OVERRIDE" ]]; then
    echo "🔧 Backend URL: $BACKEND_URL_OVERRIDE"
fi

echo ""
echo "🚀 To run: docker compose up"