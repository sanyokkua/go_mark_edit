#!/usr/bin/env bash
# Re-run the gates and compare them against a story's baseline.
#
# Contract (docs/delivery/work/DOD_TEMPLATE.md):
#   - re-runs the same commands baseline.sh ran, parsing their output identically
#   - refuses outright to verify against a baseline that contains an UNRELIABLE gate
#   - prints one row per Definition-of-Done item with PASS or FAIL, naming the specific new finding
#     or newly-failing test
#   - exits non-zero if any row fails
#   - never modifies source
#
# THE TWO RULES
#
# 1. An empty diff is only evidence if the gate actually ran. `comm -13 empty empty` prints nothing,
#    and nothing looks exactly like success. So the exit code is checked first, on both sides, and an
#    UNRELIABLE baseline is refused rather than diffed.
# 2. The architecture check is never diffed. It must be green outright — it is the only mechanical
#    thing standing between an implementer and a design decision nobody approved.
#
# Usage: just verify STORY-058 | 001-gomarkedit-product

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/evidence_id.sh
source "$REPO_ROOT/scripts/evidence_id.sh"

EVIDENCE_ARG="${1:-}"
if [[ -z "$EVIDENCE_ARG" ]]; then
  echo "usage: scripts/verify.sh STORY-NNN | NNN-feature-name" >&2
  exit 2
fi
EVIDENCE_BASE="$(evidence_baseline_base "$EVIDENCE_ARG")" || exit $?
EVIDENCE_NAME="$(evidence_display_name "$EVIDENCE_ARG")" || exit $?

BASE="$EVIDENCE_BASE"
BASE_REPORT="$BASE.md"
BASE_TESTS="$BASE.failing-tests"
BASE_FINDINGS="$BASE.findings"
BASE_EXIT="$BASE.exit"
BASE_COMMIT_FILE="$BASE.commit"

if [[ ! -f "$BASE_REPORT" ]]; then
  echo "No baseline for $EVIDENCE_NAME." >&2
  echo "Capture one before starting work:  just baseline $EVIDENCE_NAME" >&2
  exit 2
fi

# --- refuse an untrustworthy baseline --------------------------------------------------------------
if [[ ! -f "$BASE_EXIT" ]]; then
  echo "REFUSING TO VERIFY — the baseline for $EVIDENCE_NAME records no gate exit codes." >&2
  echo >&2
  echo "It was captured before baseline.sh classified gate reliability, so there is no way to tell a" >&2
  echo "gate that found nothing from a gate that ran nothing. Diffing against it proves nothing." >&2
  echo >&2
  echo "Re-capture it:  just baseline $EVIDENCE_NAME" >&2
  exit 3
fi

if grep -q '=UNRELIABLE=' "$BASE_EXIT"; then
  echo "REFUSING TO VERIFY — the baseline for $EVIDENCE_NAME contains an UNRELIABLE gate:" >&2
  grep '=UNRELIABLE=' "$BASE_EXIT" | sed 's/^/  /' >&2
  echo >&2
  echo "That gate exited non-zero and produced no findings, so it analysed nothing. Diffing against" >&2
  echo "it would pass unconditionally." >&2
  echo >&2
  echo "Fix the gate, record it in docs/delivery/plan/KNOWN_ISSUES.md, then re-capture:" >&2
  echo "  just baseline $EVIDENCE_NAME" >&2
  exit 3
fi

WORK="$(mktemp -d)"
BASE_COMMIT="$(cat "$BASE_COMMIT_FILE" 2>/dev/null || echo '')"

# Written without associative arrays: macOS ships bash 3.2, which has none.
run() {
  local var="$1" label="$2" log="$3"; shift 3
  local code=0
  printf '  running %-14s ' "$label"
  "$@" >"$log" 2>&1 || code=$?
  eval "$var=$code"
  if [[ "$code" == "0" ]]; then echo "ok"; else echo "exit $code"; fi
  return 0
}

echo "Verifying $EVIDENCE_NAME against $BASE_REPORT"
# Same ordering as baseline.sh, and for the same reason: main_test.go reads the embedded
# frontend/dist/index.html, which only `just frontend-build` produces. Running the tests first in a
# clean tree fails them for a reason that has nothing to do with the story.
run EXIT_BUILD build     "$WORK/build.log"     just frontend-build
run EXIT_FMT   fmt-check "$WORK/fmt.log"       just fmt-check
run EXIT_TYPES typecheck "$WORK/typecheck.log" just typecheck
run EXIT_LINT  lint      "$WORK/lint.log"      just lint
run EXIT_TEST  test      "$WORK/test.log"      just test
run EXIT_ARCH  archtest  "$WORK/archtest.log"  just archtest
echo

# --- parsing, byte-identical to baseline.sh or the diff is meaningless -----------------------------
: > "$WORK/failing-tests.txt"
grep -hoE '^\s*--- FAIL: [A-Za-z0-9_/]+' "$WORK/test.log" 2>/dev/null \
  | sed 's/.*--- FAIL: //' | sort -u >> "$WORK/failing-tests.txt" || true
grep -hoE '^\s+✕ .*' "$WORK/test.log" 2>/dev/null \
  | sed 's/^ *✕ //' | sort -u >> "$WORK/failing-tests.txt" || true
sort -u "$WORK/failing-tests.txt" -o "$WORK/failing-tests.txt"
NOW_FAIL_COUNT="$(wc -l < "$WORK/failing-tests.txt" | tr -d ' ')"
TEST_RAN="$(grep -cE '^(=== RUN|ok |PASS|FAIL|Tests:|✓|✔)' "$WORK/test.log" 2>/dev/null || true)"

: > "$WORK/findings.txt"
grep -hoE '^[^ ]+\.go:[0-9]+:[0-9]+: .*' "$WORK/lint.log" 2>/dev/null >> "$WORK/findings.txt" || true
awk '
  /^\// { file = $0; next }
  /^[[:space:]]+[0-9]+:[0-9]+/ { rule = $NF; printf "%s:%s:%s\n", file, rule, $2 }
' "$WORK/lint.log" >> "$WORK/findings.txt" 2>/dev/null || true
sort -u "$WORK/findings.txt" -o "$WORK/findings.txt"
NOW_FINDING_COUNT="$(wc -l < "$WORK/findings.txt" | tr -d ' ')"

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

# M3 — no static-analysis finding absent from the baseline. The exit code is checked FIRST: a gate
# that exited non-zero having parsed nothing did not run, and an empty diff there is not a pass.
NEW_FINDINGS="$(comm -13 "$BASE_FINDINGS" "$WORK/findings.txt" 2>/dev/null)"
if [[ "$EXIT_LINT" != "0" && "$NOW_FINDING_COUNT" == "0" ]]; then
  row M3 "static analysis" FAIL
  DETAIL+=("M3 the static-analysis gate exited $EXIT_LINT and produced 0 parseable findings."$'\n'"      It did not run; an empty diff here is not a pass. Raw output:"$'\n'"$(tail -30 "$WORK/lint.log" | sed 's/^/      /')")
elif [[ -z "$NEW_FINDINGS" ]]; then
  row M3 "static analysis" PASS
else
  row M3 "static analysis" FAIL
  DETAIL+=("M3 findings not in the baseline:"$'\n'"$(printf '%s' "$NEW_FINDINGS" | sed 's/^/      /')")
fi

# M4 — no test that passed at baseline may fail now, and the runner must actually have run.
NEW_FAILURES="$(comm -13 "$BASE_TESTS" "$WORK/failing-tests.txt" 2>/dev/null)"
if [[ "$TEST_RAN" == "0" ]]; then
  row M4 "tests" FAIL
  DETAIL+=("M4 the test runner reported no tests at all. Raw output:"$'\n'"$(tail -30 "$WORK/test.log" | sed 's/^/      /')")
elif [[ -n "$NEW_FAILURES" ]]; then
  row M4 "tests" FAIL
  DETAIL+=("M4 tests failing that passed at baseline:"$'\n'"$(printf '%s' "$NEW_FAILURES" | sed 's/^/      /')")
elif [[ "$EXIT_TEST" != "0" && "$NOW_FAIL_COUNT" == "0" ]]; then
  row M4 "tests" FAIL
  DETAIL+=("M4 the test command exited $EXIT_TEST with no failures parsed. The run did not complete."$'\n'"$(tail -30 "$WORK/test.log" | sed 's/^/      /')")
else
  row M4 "tests" PASS
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

# M12 — every `Proves:` tag names an anchor that exists. A tag pointing at nothing is a test that
# proves nothing and reads as coverage.
if [[ -f scripts/check_proves.py ]]; then
  if python3 scripts/check_proves.py docs/delivery internal frontend/src . >"$WORK/proves.log" 2>&1; then
    row M12 "Proves: tags resolve" PASS
  else
    row M12 "Proves: tags resolve" FAIL
    DETAIL+=("M12 a Proves: tag names an anchor that does not exist:"$'\n'"$(sed 's/^/      /' "$WORK/proves.log" | head -30)")
  fi
else
  row M12 "Proves: tags resolve" "SKIP"
fi

if [[ ${#DETAIL[@]} -gt 0 ]]; then
  echo
  for entry in "${DETAIL[@]}"; do
    printf '\n  %s\n' "$entry"
  done
fi

echo
echo "Logs: $WORK"
if [[ "$FAILED" == "1" ]]; then
echo "verify $EVIDENCE_NAME: FAILED"
  exit 1
fi
echo "verify $EVIDENCE_NAME: every mechanical check passes against the baseline."
echo "Still owed by a person: M7 new code is tested, M8 no placeholders, M11 descriptive docs current,"
echo "M13 scope declared, and the walkthrough in the story's Definition of Done."
exit 0
