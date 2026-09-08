#!/usr/bin/env bash
# Run the release gate stack and record every exit code, at the commit it was run on.
#
# WHY THIS EXISTS
#
# `evidence/.../gates/exit-codes.txt` is the one artifact that says "every gate was green at this
# commit". Written by hand, it went stale twice inside two days — T096 filed it, T132 found it
# recurring one day later, eight commits and five production source changes behind HEAD. Each of
# those tasks had recorded its own green run, so the gates were run; what drifted was the record.
# A record that drifts is worse than no record, because it reads as coverage.
#
# The fix is that nobody writes this file with an editor.
#
# WHAT IT DOES NOT DO
#
#   - It does not retry. A gate that goes red is recorded red. If a failure is a known flake, that
#     belongs in the Notes section, written by a person, naming the assertion and why. An automatic
#     retry in the thing that records gate results is how a real regression gets averaged away.
#   - It does not run `just package`, which exits non-zero on purpose until Phase 08.
#   - It does not write the Notes section. The mechanical half is generated; the judgement half is
#     not, and the script says so in the file it writes.
#
# ORDERING THAT MATTERS
#
#   - gen-check first, build last (AGENTS.md). `just build` rewrites frontend/wailsjs/runtime/ at
#     mode 644, so a trailing `just gen-check` regenerates them at 755 and leaves the tree clean.
#     That trailing run is cleanup, not a gate result, and is deliberately not listed in the file.
#   - Ports 4174 and 4173 are freed before `just e2e-test`. The parity reference server is reused
#     across runs (`reuseExistingServer: !process.env.CI`), so a server started before an adapter
#     change keeps serving stale HTML and the measurement fails in the direction that looks like
#     production drift.
#
# Usage: just release-stack 003-real-files-and-tabs

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/evidence_id.sh
source "$REPO_ROOT/scripts/evidence_id.sh"

EVIDENCE_ARG="${1:-}"
if [[ -z "$EVIDENCE_ARG" ]]; then
  echo "usage: scripts/release-stack.sh NNN-feature-name" >&2
  exit 2
fi
EVIDENCE_NAME="$(evidence_display_name "$EVIDENCE_ARG")" || exit $?

EVIDENCE_DIR="specs/$EVIDENCE_NAME/evidence"
if [[ ! -d "$EVIDENCE_DIR" ]]; then
  echo "No evidence directory for $EVIDENCE_NAME at $EVIDENCE_DIR." >&2
  exit 2
fi

# Regenerate in place wherever the artifact already lives, so this cannot quietly start writing a
# second copy and leave the one people read behind.
# `mapfile` is bash 4; macOS ships 3.2, so this stays a portable read loop.
EXISTING=()
while IFS= read -r found; do
  [[ -n "$found" ]] && EXISTING+=("$found")
done < <(find "$EVIDENCE_DIR" -name exit-codes.txt -type f | sort)
case "${#EXISTING[@]}" in
  0) OUTPUT="$EVIDENCE_DIR/gates/exit-codes.txt" ;;
  1) OUTPUT="${EXISTING[0]}" ;;
  *)
    echo "REFUSING TO WRITE — $EVIDENCE_DIR holds ${#EXISTING[@]} exit-codes.txt files:" >&2
    printf '  %s\n' "${EXISTING[@]}" >&2
    echo "Consolidate them first; regenerating one while the others stay stale is the defect this" >&2
    echo "script exists to prevent." >&2
    exit 2
    ;;
esac
mkdir -p "$(dirname "$OUTPUT")"

COMMIT="$(git rev-parse --short HEAD)"
# "dirty" with no list is noise. If the stack ran against something other than the commit named
# above, the record has to say what — a reader cannot judge the run otherwise.
DIRTY=''
DIRTY_LIST="$(git status --porcelain | awk '{print $NF}' | head -20)"
if [[ -n "$DIRTY_LIST" ]]; then
  DIRTY=' (working tree dirty — see below)'
fi
BEFORE_STATE="$(git status --porcelain)"
HOST="$(uname -s) $(uname -m), go $(go version | awk '{print $3}'), node $(node --version)"
START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

RESULTS=()
FAILED=0

run_gate() {
  local label="$1"
  shift
  echo "=== $label"
  "$@"
  local code=$?
  RESULTS+=("$(printf '%-38s exit=%d' "$label" "$code")")
  if ((code != 0)); then
    FAILED=1
    echo "!!! $label exited $code — recorded, not retried."
  fi
  return 0
}

free_e2e_ports() {
  local pids
  pids="$(lsof -ti:4174 -ti:4173 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "freeing ports 4174/4173: $pids"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 1
  fi
}

run_gate 'just gen-check' just gen-check
run_gate 'just archtest' just archtest
run_gate 'just check' just check
run_gate 'go test -race ./internal/... .' go test -race ./internal/... .
run_gate 'npm test --runInBand' npm --prefix frontend test -- --runInBand
run_gate 'go test -race -tags native_evidence ./cmd/...' go test -race -tags native_evidence ./cmd/...
free_e2e_ports
run_gate 'just e2e-test' just e2e-test
run_gate "just verify $EVIDENCE_NAME" just verify "$EVIDENCE_NAME"
run_gate 'just build' just build

# Cleanup, not a gate result: `just build` leaves frontend/wailsjs/runtime/ at mode 644.
echo '=== trailing gen-check (cleanup, not recorded)'
just gen-check >/dev/null 2>&1 || echo '!!! trailing gen-check failed — the tree is dirty on a mode bit.'

END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

{
  echo "# Feature $EVIDENCE_NAME release gate stack"
  echo "commit: $COMMIT$DIRTY"
  echo "host:   $HOST"
  echo "start:  $START"
  if [[ -n "$DIRTY_LIST" ]]; then
    echo
    echo 'uncommitted when the stack started:'
    printf '  %s\n' $DIRTY_LIST
  fi
  echo
  printf '%s\n' "${RESULTS[@]}"
  echo
  echo "end:    $END"
  echo
  echo 'Notes'
  echo '-----'
  echo 'Generated by `just release-stack` (scripts/release-stack.sh). The exit codes above are'
  echo 'mechanical; everything below this line is owed by a person and is NOT generated.'
  echo
  echo 'Write here: what each non-zero exit code was, whether it is a flake or a regression, and'
  echo 'what evidence supports that call. A gate recorded red with no explanation is an open'
  echo 'question, not a footnote. If every gate was green, say what the stack does NOT cover.'
  echo
  echo '`just package` is deliberately not run — it exits non-zero on purpose until Phase 08.'
  echo 'The trailing `just gen-check` after `just build` is cleanup for the wailsjs mode bits, not'
  echo 'a gate result, and is deliberately not listed above.'
} >"$OUTPUT"

echo
echo "wrote $OUTPUT"
printf '%s\n' "${RESULTS[@]}"

# The suites rewrite evidence artifacts as a side effect. Name them rather than leaving the author
# to diff the tree — AGENTS.md's "git checkout -- evidence/ after an e2e run" made mechanical.
CHANGED="$(comm -13 <(printf '%s\n' "$BEFORE_STATE" | sort) <(git status --porcelain | sort) | awk '{print $NF}' | grep -v "^${OUTPUT}$" || true)"
if [[ -n "$CHANGED" ]]; then
  echo
  echo 'The stack rewrote these as a side effect. Restore any you did not mean to keep:'
  printf '  %s\n' $CHANGED
fi
if ((FAILED)); then
  echo
  echo 'At least one gate exited non-zero. It is recorded. Write the Notes section before committing.'
  exit 1
fi
