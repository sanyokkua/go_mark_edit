#!/usr/bin/env bash

# Shared shell helpers for the repository entry points.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export REPO_ROOT

GOLANGCI_LINT_VERSION="${GOLANGCI_LINT_VERSION:-v2.12.2}"
SHFMT_VERSION="${SHFMT_VERSION:-v3.9.0}"
export GOLANGCI_LINT_VERSION SHFMT_VERSION

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '[gomarkedit] %s\n' "$*"
}

usage_error() {
  printf 'error: %s\n' "$*" >&2
  exit 2
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    die "missing tool: $command_name"
  fi
}

run_command() {
  local label="$1"
  shift
  local command_name="${1:-}"
  if [[ -z "$command_name" ]]; then
    die "empty command for $label"
  fi
  printf '+ %s\n' "$label"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'missing tool: %s\n' "$command_name" >&2
    return 127
  fi
  "$@"
}

run_reported_command() {
  local label="$1"
  local tool="$2"
  local report_path="$3"
  shift 3
  local capture_stderr=false
  if [[ "${1:-}" == '--capture-stderr' ]]; then
    capture_stderr=true
    shift
  fi
  local command_name="${1:-}"
  local command_status=0
  local parser_status=0
  local stderr_path="${report_path}.stderr"

  [[ -n "$command_name" ]] || die "empty command for $label"
  mkdir -p "$(dirname "$report_path")"
  printf '+ %s\n' "$label"
  printf '[gomarkedit] raw report: %s\n' "$report_path"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'missing tool: %s\n' "$command_name" >&2
    : >"$report_path"
    command_status=127
  else
    set +e
    if [[ "$capture_stderr" == true ]]; then
      "$@" >"$report_path" 2>"$stderr_path"
    else
      "$@" >"$report_path"
    fi
    command_status=$?
    set -e
  fi

  if [[ "$capture_stderr" == true && ! -s "$report_path" && -s "$stderr_path" ]]; then
    mv "$stderr_path" "$report_path"
  fi

  node "$REPO_ROOT/tools/verify/results.mjs" report \
    --tool "$tool" \
    --input "$report_path" \
    --output "$report_path.summary.json" \
    --exit-code "$command_status" || parser_status=$?

  if [[ "$command_status" -ne 0 ]]; then
    return "$command_status"
  fi
  return "$parser_status"
}

new_run_dir() {
  local kind="${1:-run}"
  local root="$REPO_ROOT/.local_tmp_files/runs"
  local run_id
  run_id="${kind}-$(date -u '+%Y%m%dT%H%M%SZ')-$$"
  RUN_DIR="$root/$run_id"
  export RUN_DIR
  mkdir -p "$RUN_DIR"
  printf '%s\n' "$RUN_DIR"
}

capture_stage() {
  local stage_name="$1"
  local stage_command="$2"
  shift 2
  local log_path="$RUN_DIR/$stage_name.log"
  local result_path="$RUN_DIR/$stage_name.json"
  local exit_code=0
  local started_ms
  local finished_ms
  local duration_ms

  mkdir -p "$RUN_DIR/reports"
  started_ms="$(node -e 'process.stdout.write(String(Date.now()))')"

  printf '\n=== %s ===\n' "$stage_name"
  printf '[gomarkedit] %s\n' "$stage_command"

  set +e
  "$@" 2>&1 | tee "$log_path"
  local -a pipeline_status=("${PIPESTATUS[@]}")
  set -e
  exit_code="${pipeline_status[0]}"
  if [[ "$exit_code" -eq 0 && "${pipeline_status[1]:-0}" -ne 0 ]]; then
    exit_code="${pipeline_status[1]}"
  fi

  finished_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
  duration_ms=$((finished_ms - started_ms))

  local record_status=0
  node "$REPO_ROOT/tools/verify/results.mjs" stage \
    --name "$stage_name" \
    --command "$stage_command" \
    --exit-code "$exit_code" \
    --duration-ms "$duration_ms" \
    --log "$log_path" \
    --reports-dir "$RUN_DIR/reports" \
    --output "$result_path" || record_status=$?

  if [[ "$record_status" -ne 0 && "$exit_code" -eq 0 ]]; then
    return "$record_status"
  fi

  return "$exit_code"
}

write_skipped_stage() {
  printf '\n=== %s (skipped) ===\n' "$1"
  printf '[gomarkedit] %s\n' "$2"
  node "$REPO_ROOT/tools/verify/results.mjs" skipped \
    --name "$1" \
    --command "$2" \
    --output "$RUN_DIR/$1.json"
}

feature_directory() {
  node -e '
        const fs = require("node:fs");
        const feature = JSON.parse(fs.readFileSync(".specify/feature.json", "utf8"));
        process.stdout.write(feature.feature_directory);
    '
}

feature_name() {
  basename "$(feature_directory)"
}

restore_tracked_modes() {
  local mode path
  while IFS=$'\t' read -r mode path; do
    [[ -z "$path" ]] && continue
    case "$mode" in
      100755) chmod 755 "$REPO_ROOT/$path" ;;
      100644) chmod 644 "$REPO_ROOT/$path" ;;
      *) printf 'warning: unsupported tracked mode %s for %s\n' "$mode" "$path" >&2 ;;
    esac
  done < <(git -C "$REPO_ROOT" ls-files -s -- frontend/wailsjs/ | awk '{print $1 "\t" $4}')
}
