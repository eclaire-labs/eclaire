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
    shift  # Remove "upgrade-check" from args, pass rest to script
    exec node dist/src/scripts/upgrade-check.js "$@"
    ;;
  *)
    echo "[entrypoint] Runtime: $ECLAIRE_RUNTIME, Home: $ECLAIRE_HOME"

    # Check if upgrade is needed
    # Exit codes: 0 = up-to-date, 1 = manual upgrade needed, 2 = downgrade, 3 = fresh install, 4 = safe auto-upgrade
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
      # Sleep forever to prevent restart loops - container will show as running but unhealthy
      exec sleep infinity
    elif [ $upgrade_result -eq 3 ]; then
      # Fresh install - auto-initialize
      echo ""
      echo "================================================"
      echo "  Fresh installation detected."
      echo "  Running automatic initialization..."
      echo "================================================"
      echo ""
      node dist/src/scripts/upgrade.js
      init_result=$?
      if [ $init_result -ne 0 ]; then
        echo ""
        echo "================================================"
        echo "  Initialization failed (exit code: $init_result)"
        echo "  Check logs above for details."
        echo "================================================"
        echo ""
        exec sleep infinity
      fi
      echo ""
      echo "  Initialization complete."
      echo ""
    elif [ $upgrade_result -eq 4 ]; then
      # Safe upgrade - auto-apply without user intervention
      echo ""
      echo "================================================"
      echo "  Safe upgrade detected."
      echo "  Running automatic upgrade..."
      echo "================================================"
      echo ""
      node dist/src/scripts/upgrade.js
      upgrade_run_result=$?
      if [ $upgrade_run_result -ne 0 ]; then
        echo ""
        echo "================================================"
        echo "  Auto-upgrade failed (exit code: $upgrade_run_result)"
        echo "  Check logs above for details."
        echo "================================================"
        echo ""
        exec sleep infinity
      fi
      echo ""
      echo "  Auto-upgrade complete."
      echo ""
    elif [ $upgrade_result -eq 1 ]; then
      echo ""
      echo "================================================"
      echo "  Upgrade required before starting."
      echo "  This version has breaking changes that require manual upgrade."
      if [ "${ECLAIRE_LOCAL_BUILD:-}" = "true" ]; then
        echo "  Run: docker compose -f compose.yaml -f compose.local.yaml run --rm eclaire upgrade"
      else
        echo "  Run: docker compose run --rm eclaire upgrade"
      fi
      echo "================================================"
      echo ""
      # Sleep forever to prevent restart loops - container will show as running but unhealthy
      exec sleep infinity
    fi

    echo "[entrypoint] Starting backend..."
    exec node dist/src/index.js "$@"
    ;;
esac
