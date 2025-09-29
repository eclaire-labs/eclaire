#!/bin/bash

# Eclaire Backend - Production Build

set -e

echo "🔨 Building Eclaire Backend (Production)..."

# Copy versions.json from project root for Docker build context
echo "📋 Copying versions.json from project root..."
cp ../../versions.json ./versions.json


# Define constants
DOCKERFILE="Dockerfile"
BASE_IMAGE_TAG="eclaire-backend"

# Get version and build metadata from environment (set by build.sh) or defaults
VERSION=${VERSION:-"dev"}                    # Semantic version (0.1.0)
FULL_VERSION=${FULL_VERSION:-"dev"}          # Full version with build (0.1.0+build.38)
MAJOR=${MAJOR:-"0"}
MINOR=${MINOR:-"0"}
PATCH=${PATCH:-"0"}
BUILD=${BUILD:-"1"}
BUILD_TIMESTAMP=${BUILD_TIMESTAMP:-$(date -u +'%Y-%m-%dT%H:%M:%SZ')}
GIT_HASH=${GIT_HASH:-"unknown"}              # Git hash injected at build time

# Build the Docker image with multiple tags and build metadata
docker build \
    -f "$DOCKERFILE" \
    --build-arg APP_VERSION="$VERSION" \
    --build-arg APP_FULL_VERSION="$FULL_VERSION" \
    --build-arg APP_BUILD_NUMBER="$BUILD" \
    --build-arg APP_BUILD_TIMESTAMP="$BUILD_TIMESTAMP" \
    --build-arg APP_GIT_HASH="$GIT_HASH" \
    -t "${BASE_IMAGE_TAG}:${VERSION}" \
    -t "${BASE_IMAGE_TAG}:${VERSION}-build.${BUILD}" \
    -t "${BASE_IMAGE_TAG}:${MAJOR}.${MINOR}" \
    -t "${BASE_IMAGE_TAG}:latest" \
    .

echo "✅ Production build completed!"
echo "📋 Images tagged as:"
echo "   - ${BASE_IMAGE_TAG}:${VERSION} (semantic version)"
echo "   - ${BASE_IMAGE_TAG}:${VERSION}-build.${BUILD} (with build metadata)"
echo "   - ${BASE_IMAGE_TAG}:${MAJOR}.${MINOR} (minor version)"
echo "   - ${BASE_IMAGE_TAG}:latest"
echo ""
echo "🚀 To run: docker compose up" 