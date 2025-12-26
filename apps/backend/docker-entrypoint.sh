#!/bin/sh
set -e

# Set runtime context (defaults, can be overridden by compose/env)
export ECLAIRE_RUNTIME="${ECLAIRE_RUNTIME:-container}"
export ECLAIRE_HOME="${ECLAIRE_HOME:-/app}"

case "${1:-}" in
  upgrade)
    echo "[entrypoint] Running upgrade..."
    exec node dist/src/scripts/upgrade.js
    ;;
  upgrade-check)
    exec node dist/src/scripts/upgrade-check.js "${@:2}"
    ;;
  *)
    echo "[entrypoint] Runtime: $ECLAIRE_RUNTIME, Home: $ECLAIRE_HOME"

    # Check if upgrade is needed
    # Exit codes: 0 = up-to-date, 1 = upgrade needed, 2 = downgrade detected
    # Use || to prevent set -e from exiting on non-zero return
    upgrade_result=0
    node dist/src/scripts/upgrade-check.js --quiet 2>/dev/null || upgrade_result=$?

    if [ $upgrade_result -eq 2 ]; then
      echo ""
      echo "========================================================"
      echo "  FATAL: Version downgrade detected."
      echo "  The app version is older than the database version."
      echo "  Running an older version may cause data corruption."
      echo "  Please use a newer container image."
      echo "========================================================"
      echo ""
      exit 1
    elif [ $upgrade_result -eq 1 ]; then
      echo ""
      echo "================================================"
      echo "  Upgrade required before starting."
      echo "  Run: docker compose run --rm backend upgrade"
      echo "================================================"
      echo ""
      exit 1
    fi

    echo "[entrypoint] Starting backend..."
    exec node dist/src/index.js "$@"
    ;;
esac
