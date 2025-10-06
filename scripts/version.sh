#!/usr/bin/env bash
set -euo pipefail

# Outputs (exported):
#   SEMVER            -> 0.3.2
#   MAJOR, MINOR, PATCH
#   BUILD             -> CI run number OR local .build_number OR commits-since-tag
#   FULL_VERSION      -> 0.3.2+build.123 (or 0.3.2-<branch>+g<sha> for non-tag)
#   GIT_HASH          -> short sha
#   BUILD_TIMESTAMP   -> UTC ISO8601
#   RELEASE_MODE      -> "true" if exactly on a tag, else "false"

# --- locate latest semver tag vX.Y.Z (or default) ---
LATEST_TAG=$(git describe --tags --match 'v[0-9]*' --abbrev=0 2>/dev/null || echo "v0.0.0")
TAG_NO_V="${LATEST_TAG#v}"

IFS='.' read -r MAJOR MINOR PATCH <<< "${TAG_NO_V}"

# --- git info ---
GIT_HASH="$(git rev-parse --short HEAD)"
COMMITS_SINCE_TAG=$(git rev-list --count "${LATEST_TAG}..HEAD" 2>/dev/null || echo "0")
ON_EXACT_TAG=false
if git describe --tags --exact-match >/dev/null 2>&1; then
  ON_EXACT_TAG=true
fi

# --- build timestamp ---
BUILD_TIMESTAMP="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

# --- decide build number ---
# 1) CI number if available
if [[ "${GITHUB_RUN_NUMBER:-}" != "" ]]; then
  BUILD="${GITHUB_RUN_NUMBER}"
# 2) local .build_number if present
elif [[ -f ".build_number" ]]; then
  BUILD="$(cat .build_number 2>/dev/null || echo 0)"
  # increment for local builds; ignore errors if file is not writable
  BUILD=$((BUILD + 1)) || true
  { echo "${BUILD}" > .build_number; } || true
# 3) fallback to commits since tag (monotonic per-branch)
else
  BUILD="${COMMITS_SINCE_TAG}"
fi

# --- compute SEMVER and FULL_VERSION ---
SEMVER="${MAJOR}.${MINOR}.${PATCH}"

# If we’re exactly on a tag, it’s an official release
if $ON_EXACT_TAG; then
  RELEASE_MODE=true
  FULL_VERSION="${SEMVER}+build.${BUILD}"
else
  RELEASE_MODE=false
  # make a friendly prerelease identifier from the branch name (if any)
  BRANCH="${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'detached')}"
  # sanitize for docker tags
  BRANCH_SAFE="$(echo "$BRANCH" | tr '/ _' '---' | tr -cd '[:alnum:].-')"
  FULL_VERSION="${SEMVER}-${BRANCH_SAFE}+g${GIT_HASH}.build.${BUILD}"
fi

export MAJOR MINOR PATCH SEMVER BUILD FULL_VERSION GIT_HASH BUILD_TIMESTAMP RELEASE_MODE

