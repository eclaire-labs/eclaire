#!/usr/bin/env bash
set -euo pipefail

# Unified restart helper for PM2 apps and Docker Compose services.
# - Rotates logs to timestamped files before restarting.
# - For Compose services, assumes you run PM2 "log tailers" named logs:<svc>
#   that write to ./data/logs/<svc>.log (or whatever your PM2 config sets).
#
# Usage:
#   scripts/pm2-restart.sh all
#   scripts/pm2-restart.sh pm2 <app> [<app>...]
#   scripts/pm2-restart.sh compose <svc> [<svc>...]
#   scripts/pm2-restart.sh <name> [<name>...]          # auto-detect per name
#
# Env:
#   COMPOSE_FILE   (default: compose.prod.yml)
#   LOG_DIR        (default: ./data/logs)

COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yml}"
LOG_DIR="${LOG_DIR:-./data/logs}"

# ---- utilities --------------------------------------------------------------

ts() { date +"%Y-%m-%dT%H-%M-%S%z"; }  # portable (no colons in filename)
have() { command -v "$1" >/dev/null 2>&1; }
die() { echo "ERR: $*" >&2; exit 1; }

# Get array of PM2 app names
get_pm2_apps() {
  if have jq; then
    pm2 jlist | jq -r '.[].name'
  else
    pm2 jlist | sed -n 's/.*"name":"\([^"]\+\)".*/\1/p'
  fi
}

# Get array of Compose service names (prefer config; fallback to running)
get_compose_services() {
  if docker compose -f "$COMPOSE_FILE" config --services >/dev/null 2>&1; then
    docker compose -f "$COMPOSE_FILE" config --services
  else
    docker compose -f "$COMPOSE_FILE" ps --services
  fi
}

pm2_app_exists() {
  local name="$1"
  if have jq; then
    pm2 jlist | jq -e --arg n "$name" 'any(.[]; .name==$n)' >/dev/null
  else
    get_pm2_apps | awk -v n="$name" '($0==n){found=1} END{exit !found}'
  fi
}

compose_service_exists() {
  local name="$1"
  get_compose_services | awk -v n="$name" '($0==n){found=1} END{exit !found}'
}

# ---- log rotation primitives ------------------------------------------------

# Rotate a single file path if it exists
rotate_file() {
  local path="$1"
  [[ -f "$path" ]] || return 0
  local dir base ext new
  dir="$(dirname "$path")"
  base="$(basename "$path")"
  ext=""; [[ "$base" == *.log ]] && ext=".log" && base="${base%.log}"
  new="${dir}/${base}-$(ts)${ext}"
  mv "$path" "$new"
  echo "moved: $path -> $new"
}

# Rotate all PM2 logs (out/err) for an app, deduping if they’re the same file
rotate_pm2_logs_for() {
  local app="$1"
  local -A SEEN_PATHS=()
  mkdir -p "$LOG_DIR"

  if have jq; then
    # pull actual files from pm2 jlist
    while IFS= read -r p; do
      [[ -z "$p" ]] && continue
      [[ -n "${SEEN_PATHS[$p]:-}" ]] && continue
      SEEN_PATHS["$p"]=1
      rotate_file "$p"
    done < <(
      pm2 jlist \
        | jq -r --arg NAME "$app" '
            .[] | select(.name==$NAME) |
            [ .pm2_env.pm_out_log_path, .pm2_env.pm_err_log_path ]
            | unique | .[] | select(. != null and . != "")
          ' | sort -u
    )
  else
    # fallback to conventional path
    rotate_file "${LOG_DIR}/${app}.log"
  fi
}

# Rotate the PM2 tailer log for a compose service.
# Prefers PM2 app "logs:<svc>"; falls back to LOG_DIR/<svc>.log.
rotate_compose_tailer_log() {
  local svc="$1"
  local tailer="logs:${svc}"

  if pm2_app_exists "$tailer"; then
    rotate_pm2_logs_for "$tailer"
  else
    rotate_file "${LOG_DIR}/${svc}.log"
  fi
}

# ---- restart actions --------------------------------------------------------

restart_pm2_apps() {
  local -a names=("$@")
  [[ ${#names[@]} -gt 0 ]] || return 0

  # rotate logs, then restart
  for n in "${names[@]}"; do
    rotate_pm2_logs_for "$n" || true
  done
  pm2 restart "${names[@]}"
}

restart_compose_services() {
  local -a svcs=("$@")
  [[ ${#svcs[@]} -gt 0 ]] || return 0

  mkdir -p "$LOG_DIR"
  for s in "${svcs[@]}"; do
    rotate_compose_tailer_log "$s" || true
    echo "docker compose -f ${COMPOSE_FILE} restart ${s}"
    docker compose -f "${COMPOSE_FILE}" restart "${s}"
    # restart tailer if it exists so PM2 reopens a fresh file
    if pm2_app_exists "logs:${s}"; then
      pm2 restart "logs:${s}" >/dev/null
    fi
    echo "done: ${s}"
  done
}

# ---- argument parsing / routing --------------------------------------------

[[ $# -ge 1 ]] || die "Usage: $(basename "$0") all | pm2 <app...> | compose <svc...> | <name...>"

mode="auto"
case "${1:-}" in
  all) mode="all"; shift ;;
  pm2) mode="pm2"; shift ;;
  compose) mode="compose"; shift ;;
esac

mkdir -p "$LOG_DIR"

case "$mode" in
  all)
    # Compose services first (if docker is available)
    if have docker; then
      mapfile -t all_svcs < <(get_compose_services || true)
      [[ ${#all_svcs[@]} -gt 0 ]] && restart_compose_services "${all_svcs[@]}"
    fi
    # PM2 apps next, excluding log tailers (logs:*)
    mapfile -t all_pm2 < <(get_pm2_apps || true)
    if [[ ${#all_pm2[@]} -gt 0 ]]; then
      # filter out tailers
      mapfile -t pm2_real < <(printf "%s\n" "${all_pm2[@]}" | awk '!/^logs:/')
      [[ ${#pm2_real[@]} -gt 0 ]] && restart_pm2_apps "${pm2_real[@]}"
    fi
    ;;

  pm2)
    [[ $# -ge 1 ]] || die "Provide at least one PM2 app name"
    restart_pm2_apps "$@"
    ;;

  compose)
    [[ $# -ge 1 ]] || die "Provide at least one Compose service name"
    have docker || die "docker not found"
    restart_compose_services "$@"
    ;;

  auto)
    have docker && mapfile -t svcs_all < <(get_compose_services || true) || svcs_all=()
    mapfile -t pm2_all < <(get_pm2_apps || true)

    declare -a pm2_targets=()
    declare -a compose_targets=()

    for arg in "$@"; do
      case "$arg" in
        pm2:*) pm2_targets+=("${arg#pm2:}") ;;
        compose:*) compose_targets+=("${arg#compose:}") ;;
        *)
          # prefer compose match, then pm2, else warn
          if printf "%s\n" "${svcs_all[@]}" | awk -v n="$arg" '($0==n){found=1} END{exit !found}'; then
            compose_targets+=("$arg")
          elif printf "%s\n" "${pm2_all[@]}" | awk -v n="$arg" '($0==n){found=1} END{exit !found}'; then
            pm2_targets+=("$arg")
          else
            echo "WARN: '$arg' not found as compose service or pm2 app; skipping" >&2
          fi
          ;;
      esac
    done

    [[ ${#compose_targets[@]} -gt 0 ]] && restart_compose_services "${compose_targets[@]}"
    [[ ${#pm2_targets[@]} -gt 0 ]] && restart_pm2_apps "${pm2_targets[@]}"
    ;;
esac

echo "Done."
