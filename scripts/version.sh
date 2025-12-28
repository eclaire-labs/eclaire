#!/usr/bin/env bash
# scripts/version.sh
set -euo pipefail

# Outputs (exported):
#   SEMVER, MAJOR, MINOR, PATCH  -> base semver (from package.json for dev, git tag for release)
#   RELEASE_MODE                 -> "true" iff exactly on a vX.Y.Z tag
#   COMMITS_SINCE_TAG            -> commits since last version tag (both CI and local)
#   GIT_HASH                     -> full 40-char SHA
#   SHORT_SHA                    -> 7-char SHA
#   BUILD_TIMESTAMP              -> UTC ISO8601
#   FULL_VERSION                 -> SemVer (may include '+'): e.g.
#                                   - release: 0.3.1+sha.1a2b3c4d...
#                                   - prerelease: 0.3.2-main+sha.1a2b3c4d...
#   DOCKER_TAG                   -> Primary Docker tag (simple form):
#                                   - release: 0.3.1
#                                   - main: main
#                                   - feature: feature-xyz
#                                   - local: dev-branch
#   DOCKER_TAGS                  -> Space-separated list of all tags for this build
#   CHANNEL                      -> branch/tag/sha label (raw-ish)
#   CHANNEL_SAFE                 -> sanitized channel (allowed chars: [A–Z a–z 0–9 . -])
#   CHANNEL_TAG_SAFE             -> CHANNEL_SAFE with '.' converted to '-' (friendlier for tags)

# --- locate latest semver tag vX.Y.Z (or default) ---
LATEST_TAG="$(git describe --tags --match 'v[0-9]*' --abbrev=0 2>/dev/null || echo 'v0.0.0')"
TAG_NO_V="${LATEST_TAG#v}"
IFS='.' read -r MAJOR MINOR PATCH <<< "${TAG_NO_V}"

# --- git info ---
GIT_HASH="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short=7 HEAD)"
BUILD_TIMESTAMP="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

# --- release detection (strict: only vX.Y.Z counts) ---
CURRENT_TAG="$(git describe --tags --exact-match 2>/dev/null || echo '')"
if [[ "$CURRENT_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  RELEASE_MODE=true
else
  RELEASE_MODE=false
fi

# --- commits since tag (both CI and local) ---
# If the repo actually has LATEST_TAG, count since it; otherwise count all commits
if git rev-parse -q --verify "refs/tags/${LATEST_TAG}" >/dev/null 2>&1; then
  COMMITS_SINCE_TAG="$(git rev-list --count "${LATEST_TAG}..HEAD" 2>/dev/null || echo 0)"
else
  COMMITS_SINCE_TAG="$(git rev-list --count HEAD 2>/dev/null || echo 0)"
fi

# --- stable channel (branch/tag/sha) for prereleases ---
RAW_REF="${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')}"
# 'git rev-parse --abbrev-ref HEAD' returns 'HEAD' when detached; treat as empty
[[ "$RAW_REF" == "HEAD" ]] && RAW_REF=""

if [[ -n "$RAW_REF" ]] && git rev-parse --verify -q "refs/heads/${RAW_REF}" >/dev/null; then
  CHANNEL="$RAW_REF"
elif [[ -n "$RAW_REF" ]] && git rev-parse --verify -q "refs/tags/${RAW_REF}" >/dev/null; then
  CHANNEL="tag-${RAW_REF}"
else
  CHANNEL="sha-$(git rev-parse --short HEAD)"
fi

# Sanitize: map '/', ' ', '_' -> '-' and then allow only alnum . -
CHANNEL_SAFE="$(echo "$CHANNEL" | tr '/ _' '---' | tr -cd '[:alnum:].-')"
# Docker-friendly variant: replace '.' with '-'
CHANNEL_TAG_SAFE="${CHANNEL_SAFE//./-}"

# Extract clean feature name from feature/* branches
if [[ "$CHANNEL" == feature/* ]]; then
  FEATURE_NAME="${CHANNEL#feature/}"
  CHANNEL_TAG_SAFE="feature-${FEATURE_NAME//\//-}"
fi

# --- for non-release builds, use package.json version ---
# This ensures dev/local builds use the version from package.json (e.g., 0.6.0)
# rather than bumping the last git tag (e.g., 0.5.2 -> 0.5.3)
if [[ "$RELEASE_MODE" != "true" ]]; then
  PKG_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "")
  if [[ -n "$PKG_VERSION" ]]; then
    IFS='.' read -r MAJOR MINOR PATCH <<< "$PKG_VERSION"
  fi
fi

SEMVER="${MAJOR}.${MINOR}.${PATCH}"

# --- check for uncommitted changes ---
if git diff-index --quiet HEAD -- 2>/dev/null; then
  GIT_DIRTY=false
else
  GIT_DIRTY=true
fi

# --- compute final versions and tags ---
if [[ "$RELEASE_MODE" == "true" ]]; then
  # Release: X.Y.Z, X.Y, latest, sha-<7>
  FULL_VERSION="${SEMVER}+sha.${GIT_HASH}"
  DOCKER_TAG="${SEMVER}"
  DOCKER_TAGS="${SEMVER} ${MAJOR}.${MINOR} latest sha-${SHORT_SHA}"
else
  # Prerelease: base is the *next* version; append channel
  FULL_VERSION="${SEMVER}-${CHANNEL_SAFE}+sha.${GIT_HASH}"

  # Detect if running locally (not in CI)
  if [[ -z "${CI:-}" && -z "${GITHUB_ACTIONS:-}" ]]; then
    # Local: dev-<branch> and detailed tag
    DOCKER_TAG="dev-${CHANNEL_TAG_SAFE}"
    DOCKER_TAGS="${DOCKER_TAG} ${SEMVER}-${CHANNEL_TAG_SAFE}-sha-${SHORT_SHA}"
  else
    # CI (main/feature): simple branch name and sha-<7>, optionally detailed tag
    DOCKER_TAG="${CHANNEL_TAG_SAFE}"
    DOCKER_TAGS="${CHANNEL_TAG_SAFE} sha-${SHORT_SHA} ${SEMVER}-${CHANNEL_TAG_SAFE}-sha-${SHORT_SHA}"
  fi
fi

export SEMVER MAJOR MINOR PATCH RELEASE_MODE COMMITS_SINCE_TAG GIT_HASH SHORT_SHA BUILD_TIMESTAMP \
       CHANNEL CHANNEL_SAFE CHANNEL_TAG_SAFE FULL_VERSION DOCKER_TAG DOCKER_TAGS GIT_DIRTY
