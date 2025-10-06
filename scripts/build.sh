#!/usr/bin/env bash
set -euo pipefail

RELEASE_MODE=false
BACKEND_URL_OVERRIDE=""
PARSED_ARGS=()

# Parse CLI
while [[ $# -gt 0 ]]; do
  case $1 in
    --backend-url) BACKEND_URL_OVERRIDE="$2"; shift 2 ;;
    --release)     RELEASE_MODE=true; shift ;;
    *)             PARSED_ARGS+=("$1"); shift ;;
  esac
done
if [[ ${#PARSED_ARGS[@]} -gt 0 ]]; then set -- "${PARSED_ARGS[@]}"; else set --; fi

# Compute version/build from git (and optionally .build_number or CI env)
source ./scripts/version.sh

# If --release, enforce your existing clean/tag checks (re-using SEMVER)
if [ "$RELEASE_MODE" = true ]; then
  if ! git diff-index --quiet HEAD --; then
    echo "❌ Uncommitted changes."; git status --short; exit 1
  fi
  EXPECTED_TAG="v${SEMVER}"
  TAG_HASH=$(git rev-parse "$EXPECTED_TAG^{commit}" 2>/dev/null || true)
  HEAD_HASH=$(git rev-parse HEAD)
  if [ -z "$TAG_HASH" ] || [ "$TAG_HASH" != "$HEAD_HASH" ]; then
    echo "❌ HEAD must match ${EXPECTED_TAG} for a release build."; exit 1
  fi
fi

# Recreate versions.json (generated) for any Dockerfile expecting it
cat > versions.json << EOF
{ "major": ${MAJOR}, "minor": ${MINOR}, "patch": ${PATCH} }
EOF

# Build-info for your tooling
cat > build-info.json << EOF
{
  "version": "${SEMVER}",
  "fullVersion": "${FULL_VERSION}",
  "major": ${MAJOR},
  "minor": ${MINOR},
  "patch": ${PATCH},
  "build": ${BUILD},
  "buildTimestamp": "${BUILD_TIMESTAMP}",
  "gitHash": "${GIT_HASH}",
  "releaseMode": ${RELEASE_MODE},
  "createdAt": "${BUILD_TIMESTAMP}",
  "buildTool": "build.sh"
}
EOF

echo "🏗️  Building v${SEMVER} (build ${BUILD}, ${GIT_HASH})"
[[ -n "$BACKEND_URL_OVERRIDE" ]] && echo "🔧 Backend URL override: $BACKEND_URL_OVERRIDE"

ALL_SERVICES=(backend frontend workers)
if [[ $# -gt 0 ]]; then SERVICES=("$@"); else SERVICES=("${ALL_SERVICES[@]}"); fi

for svc in "${SERVICES[@]}"; do
  path="apps/${svc}/docker-build.sh"
  [[ -x "$path" ]] || { echo "⚠️  Missing $path"; continue; }

  printf "\n==============================\nBuilding %s %s\n==============================\n" "$svc" "$FULL_VERSION"

  pkg="apps/${svc}/package.json"
  if [[ -f "$pkg" ]]; then
    jq --arg version "$SEMVER" '.version = $version' "$pkg" > "${pkg}.tmp" && mv "${pkg}.tmp" "$pkg"
    echo "📦 Updated ${svc} package.json to ${SEMVER}"
  fi

  export VERSION="$SEMVER" FULL_VERSION="$FULL_VERSION" MAJOR="$MAJOR" MINOR="$MINOR" PATCH="$PATCH" BUILD="$BUILD" BUILD_TIMESTAMP="$BUILD_TIMESTAMP" GIT_HASH="$GIT_HASH"

  if [[ "$svc" == "frontend" && -n "$BACKEND_URL_OVERRIDE" ]]; then
    (cd "apps/${svc}" && ./docker-build.sh "$BACKEND_URL_OVERRIDE")
  else
    (cd "apps/${svc}" && ./docker-build.sh)
  fi
done

echo -e "\n✅ Build complete: ${SEMVER} (build ${BUILD}, ${GIT_HASH})"
