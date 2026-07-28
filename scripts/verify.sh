#!/usr/bin/env bash
# Re-run the gates and compare them against a story's baseline.
#
# Contract (docs/delivery/work/DOD_TEMPLATE.md):
#   - re-runs the same commands baseline.sh ran
#   - prints one row per Definition-of-Done item with PASS or FAIL, naming the specific new finding
#     or newly-failing test
#   - exits non-zero if any row fails
#   - never modifies source
#
# Usage: just verify STORY-057   (or: scripts/verify.sh STORY-057)

set -uo pipefail

STORY_ARG="${1:-}"
if [[ -z "$STORY_ARG" ]]; then
  echo "usage: scripts/verify.sh STORY-NNN" >&2
  exit 2
fi
STORY_NUMBER="$(printf '%s' "$STORY_ARG" | tr -cd '0-9')"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BASE_DIR="docs/delivery/work/baselines"
BASE_REPORT="$BASE_DIR/story-$STORY_NUMBER.md"
BASE_TESTS="$BASE_DIR/story-$STORY_NUMBER.failing-tests"
BASE_FINDINGS="$BASE_DIR/story-$STORY_NUMBER.findings"
BASE_COMMIT_FILE="$BASE_DIR/story-$STORY_NUMBER.commit"

if [[ ! -f "$BASE_REPORT" ]]; then
  echo "No baseline for STORY-$STORY_NUMBER." >&2
  echo "Capture one before starting work:  just baseline STORY-$STORY_NUMBER" >&2
  exit 2
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

BASE_COMMIT="$(cat "$BASE_COMMIT_FILE" 2>/dev/null || echo '')"

# Written without associative arrays: macOS ships bash 3.2, which has none.
run() {
  local var="$1" label="$2" log="$3"; shift 3
  local code=0
  printf '  running %-14s ' "$label"
  "$@" >"$log" 2>&1 || code=$?
  eval "$var=$code"
  if [[ "$code" == "0" ]]; then echo "ok"; else echo "exit $code"; fi
}

echo "Verifying STORY-$STORY_NUMBER against $BASE_REPORT"
run EXIT_FMT   fmt-check "$WORK/fmt.log"       just fmt-check
run EXIT_TYPES typecheck "$WORK/typecheck.log" just typecheck
run EXIT_LINT  lint      "$WORK/lint.log"      just lint
run EXIT_TEST  test      "$WORK/test.log"      just test
run EXIT_ARCH  archtest  "$WORK/archtest.log"  just archtest
run EXIT_BUILD build     "$WORK/build.log"     just frontend-build
echo

grep -hoE '^\s*--- FAIL: [A-Za-z0-9_/]+' "$WORK/test.log" 2>/dev/null \
  | sed 's/.*--- FAIL: //' | sort -u > "$WORK/failing-tests.txt" || true
grep -hoE '^\s+✕ .*' "$WORK/test.log" 2>/dev/null \
  | sed 's/^ *✕ //' | sort -u >> "$WORK/failing-tests.txt" || true
sort -u "$WORK/failing-tests.txt" -o "$WORK/failing-tests.txt"

: > "$WORK/findings.txt"
grep -hoE '^[^ ]+\.go:[0-9]+:[0-9]+: .*' "$WORK/lint.log" 2>/dev/null >> "$WORK/findings.txt" || true
awk '
  /^\// { file = $0; next }
  /^[[:space:]]+[0-9]+:[0-9]+/ { rule = $NF; printf "%s:%s:%s\n", file, rule, $2 }
' "$WORK/lint.log" >> "$WORK/findings.txt" 2>/dev/null || true
sort -u "$WORK/findings.txt" -o "$WORK/findings.txt"

FAILED=0
DETAIL=()
row() {
  local item="$1" name="$2" verdict="$3"
  printf '| %-3s | %-28s | %s |\n' "$item" "$name" "$verdict"
  [[ "$verdict" == "FAIL" ]] && FAILED=1
  return 0
}

echo "| #   | check                        | result |"
echo "|-----|------------------------------|--------|"

# M1 — format must be clean, absolutely.
if [[ "$EXIT_FMT" == "0" ]]; then row M1 "format" PASS; else
  row M1 "format" FAIL; DETAIL+=("M1 formatting drift:"$'\n'"$(sed 's/^/      /' "$WORK/fmt.log" | head -20)")
fi

# M2 — types clean, or exactly the baseline error set.
if [[ "$EXIT_TYPES" == "0" ]]; then row M2 "types" PASS; else
  row M2 "types" FAIL; DETAIL+=("M2 type errors:"$'\n'"$(sed 's/^/      /' "$WORK/typecheck.log" | head -20)")
fi

# M3 — no static-analysis finding absent from the baseline.
NEW_FINDINGS="$(comm -13 "$BASE_FINDINGS" "$WORK/findings.txt" 2>/dev/null)"
if [[ -z "$NEW_FINDINGS" ]]; then row M3 "static analysis" PASS; else
  row M3 "static analysis" FAIL
  DETAIL+=("M3 findings not in the baseline:"$'\n'"$(printf '%s' "$NEW_FINDINGS" | sed 's/^/      /')")
fi

# M4 — no test that passed at baseline may fail now.
NEW_FAILURES="$(comm -13 "$BASE_TESTS" "$WORK/failing-tests.txt" 2>/dev/null)"
if [[ -z "$NEW_FAILURES" ]]; then row M4 "tests" PASS; else
  row M4 "tests" FAIL
  DETAIL+=("M4 tests failing that passed at baseline:"$'\n'"$(printf '%s' "$NEW_FAILURES" | sed 's/^/      /')")
fi

# M5 — architecture. Never diffed, never weakened, never suppressed.
if [[ "$EXIT_ARCH" == "0" ]]; then row M5 "architecture" PASS; else
  row M5 "architecture" FAIL
  DETAIL+=("M5 architecture gate is red — it is never diffed against a baseline:"$'\n'"$(grep -E 'FAIL|architecture_test|archtest' "$WORK/archtest.log" | sed 's/^/      /' | head -20)")
fi

# M6 — build.
if [[ "$EXIT_BUILD" == "0" ]]; then row M6 "build" PASS; else
  row M6 "build" FAIL; DETAIL+=("M6 build failed:"$'\n'"$(tail -20 "$WORK/build.log" | sed 's/^/      /')")
fi

# M9 — gate configuration untouched since the baseline commit.
if [[ -n "$BASE_COMMIT" ]] && git rev-parse --verify "$BASE_COMMIT" >/dev/null 2>&1; then
  GATE_CHANGES="$(git diff --name-only "$BASE_COMMIT"..HEAD -- \
      .golangci.yml frontend/eslint.config.js frontend/eslint.architecture.config.js \
      frontend/scripts/archtest-allowlist.json justfile .github/ lefthook.yml 2>/dev/null)"
  if [[ -z "$GATE_CHANGES" ]]; then row M9 "gate config untouched" PASS; else
    row M9 "gate config untouched" FAIL
    DETAIL+=("M9 a gate's own configuration changed — name and justify it, or revert it:"$'\n'"$(printf '%s' "$GATE_CHANGES" | sed 's/^/      /')")
  fi
else
  row M9 "gate config untouched" "SKIP"
fi

# M10 — no normative document was edited.
if [[ -n "$BASE_COMMIT" ]] && git rev-parse --verify "$BASE_COMMIT" >/dev/null 2>&1; then
  SPEC_CHANGES="$(git diff --name-only "$BASE_COMMIT"..HEAD -- \
      docs/delivery/spec/ docs/delivery/architecture/ 2>/dev/null)"
  if [[ -z "$SPEC_CHANGES" ]]; then row M10 "normative docs untouched" PASS; else
    row M10 "normative docs untouched" FAIL
    DETAIL+=("M10 a normative document changed — a needed change is a reconcile item, not a commit:"$'\n'"$(printf '%s' "$SPEC_CHANGES" | sed 's/^/      /')")
  fi
else
  row M10 "normative docs untouched" "SKIP"
fi

if [[ ${#DETAIL[@]} -gt 0 ]]; then
  echo
  for entry in "${DETAIL[@]}"; do
    printf '\n  %s\n' "$entry"
  done
fi

echo
if [[ "$FAILED" == "1" ]]; then
  echo "verify STORY-$STORY_NUMBER: FAILED"
  exit 1
fi
echo "verify STORY-$STORY_NUMBER: every mechanical check passes against the baseline."
echo "Still owed by a person: M7 new code is tested, M8 no placeholders, M11 descriptive docs current,"
echo "and the walkthrough in the story's Definition of Done."
exit 0
