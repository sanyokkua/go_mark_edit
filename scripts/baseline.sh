#!/usr/bin/env bash
# Capture the repository's state immediately before a story starts.
#
# Contract (docs/delivery/work/DOD_TEMPLATE.md):
#   - runs fmt-check, typecheck, lint, test, archtest, frontend-build and coverage
#   - writes the baseline report with the commit, the timestamp, every failing
#     test by name, every static-analysis finding as file:rule:message, the coverage figure, and each
#     command's exit code AND its reliability verdict. A legacy story writes to
#     docs/delivery/work/baselines/story-NNN.*; a Spec Kit feature writes to
#     specs/<feature>/evidence/baseline/baseline.* so evidence sits beside its spec and capture never
#     writes under the reference-only docs/delivery/ tree.
#   - keeps every gate's raw output in the matching .logs/ directory — it is never deleted, precisely
#     so a broken gate is diagnosable rather than a mystery
#   - exits 0 when the capture is trustworthy, even if the tree is red. Recording a red state is a
#     valid outcome; it is the reason baselines exist.
#   - exits 3 when a gate is UNRELIABLE. That is not a red state, it is a non-measurement.
#
# THE RULE THIS SCRIPT EXISTS TO ENFORCE
#
# A gate that exits non-zero and yields zero findings did not run clean — it crashed, found no files
# to analyse, or its output did not parse. If that is recorded as "0 findings", verify.sh later diffs
# empty against empty, prints PASS, and does so for every story from then on. The gate is not weak at
# that point; it cannot fail. STORY-058 shipped against exactly this: `just lint` exit 5, 0 findings.
#
# So: every gate records its exit code, its raw log is kept, and the exit/finding combination is
# classified. verify.sh refuses to run against an UNRELIABLE baseline.
#
# Usage: just baseline STORY-058 | 001-gomarkedit-product

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/evidence_id.sh
source "$REPO_ROOT/scripts/evidence_id.sh"

EVIDENCE_ARG="${1:-}"
if [[ -z "$EVIDENCE_ARG" ]]; then
  echo "usage: scripts/baseline.sh STORY-NNN | NNN-feature-name" >&2
  exit 2
fi
EVIDENCE_BASE="$(evidence_baseline_base "$EVIDENCE_ARG")" || exit $?
EVIDENCE_NAME="$(evidence_display_name "$EVIDENCE_ARG")" || exit $?

OUT_DIR="$(dirname "$EVIDENCE_BASE")"
OUT="$EVIDENCE_BASE"
OUT_FILE="$OUT.md"
LOGS="$OUT.logs"

mkdir -p "$OUT_DIR" "$LOGS"
: > "$OUT.exit"

COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo 'not-a-git-repository')"
COMMIT_FULL="$(git rev-parse HEAD 2>/dev/null || echo '-')"
STAMP="$(date -u '+%Y-%m-%d %H:%M UTC')"
DIRTY="clean"
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  DIRTY="**dirty — uncommitted changes are part of this baseline**"
fi

UNRELIABLE=0

# run <gate> <command...> — never aborts. Keeps the log, records the exit code beside it.
# Written without associative arrays: macOS ships bash 3.2, which has none.
run() {
  local gate="$1"; shift
  local code=0
  printf '  %-14s ' "$gate"
  "$@" >"$LOGS/$gate.log" 2>&1 || code=$?
  printf '%s\n' "$code" > "$LOGS/$gate.code"
  if [[ "$code" == "0" ]]; then echo "ok"; else echo "exit $code"; fi
  return 0
}

# classify_findings <gate> <count>
#   For the two gates that produce a finding SET. Non-zero exit with nothing extracted means the
#   gate did not run, and that is the condition this whole script exists to catch.
classify_findings() {
  local gate="$1" count="$2"
  local code verdict
  code="$(cat "$LOGS/$gate.code")"
  if   [[ "$code" == "0" ]]; then verdict="clean"
  elif [[ "$count" -gt 0 ]]; then verdict="ok-with-findings"
  else verdict="UNRELIABLE"; UNRELIABLE=1
  fi
  printf '%s=%s=%s=%s\n' "$gate" "$code" "$verdict" "$count" >> "$OUT.exit"
  if [[ "$verdict" == "UNRELIABLE" ]]; then
    echo "  !! $gate exited $code and produced no parseable findings — it did not run."
    echo "     Raw output: $LOGS/$gate.log"
  fi
  return 0
}

# classify_passfail <gate>
#   For the gates that are pass/fail rather than finding sets. A non-zero exit is meaningful on its
#   own here, and "0 findings" is not a claim about anything.
classify_passfail() {
  local gate="$1"
  local code verdict
  code="$(cat "$LOGS/$gate.code")"
  if [[ "$code" == "0" ]]; then verdict="clean"; else verdict="failing"; fi
  printf '%s=%s=%s=0\n' "$gate" "$code" "$verdict" >> "$OUT.exit"
  return 0
}

echo "Capturing baseline for $EVIDENCE_NAME at $COMMIT"
# frontend-build runs FIRST and the order is load-bearing: main_test.go asserts that
# frontend/dist/index.html is embedded, frontend/dist/ is gitignored, and `just frontend-build` is
# what produces it. Run `just test` before it in a clean checkout and the Go suite fails with
# "read embedded frontend/dist/index.html: file does not exist" — a baseline failure caused entirely
# by the baseline script's own ordering. `just check` puts frontend-build first for the same reason.
run frontend-build  just frontend-build
run fmt-check       just fmt-check
run typecheck       just typecheck
run lint            just lint
run test            just test
run archtest        just archtest
run coverage        go test -cover ./internal/... .

# --- failing tests, by fully-qualified name ------------------------------------------------------
: > "$OUT.failing-tests"
grep -hoE '^\s*--- FAIL: [A-Za-z0-9_/]+' "$LOGS/test.log" 2>/dev/null \
  | sed 's/.*--- FAIL: //' | sort -u >> "$OUT.failing-tests" || true
grep -hoE '^\s+✕ .*' "$LOGS/test.log" 2>/dev/null \
  | sed 's/^ *✕ //' | sort -u >> "$OUT.failing-tests" || true
sort -u "$OUT.failing-tests" -o "$OUT.failing-tests"
FAIL_COUNT="$(wc -l < "$OUT.failing-tests" | tr -d ' ')"

# A test runner that exits non-zero with no parsed failures did not complete. But a runner that
# exits 0 has legitimately produced an empty set, so the count alone cannot decide it.
TEST_RAN="$(grep -cE '^(=== RUN|ok |PASS|FAIL|Tests:|✓|✔)' "$LOGS/test.log" 2>/dev/null || true)"
if [[ "$TEST_RAN" == "0" ]]; then
  # Nothing that looks like a test run at all — treat as no findings so classify catches it.
  FAIL_COUNT_FOR_VERDICT=0
else
  FAIL_COUNT_FOR_VERDICT="$FAIL_COUNT"
fi

# --- static-analysis findings, as file:rule:message ----------------------------------------------
: > "$OUT.findings"
# golangci-lint prints "path:line:col: message (linter)"
grep -hoE '^[^ ]+\.go:[0-9]+:[0-9]+: .*' "$LOGS/lint.log" 2>/dev/null >> "$OUT.findings" || true
# eslint stylish prints "  line:col  severity  message  rule-id" under a path header
awk '
  /^\// { file = $0; next }
  /^[[:space:]]+[0-9]+:[0-9]+/ {
    rule = $NF
    printf "%s:%s:%s\n", file, rule, $2
  }
' "$LOGS/lint.log" >> "$OUT.findings" 2>/dev/null || true
sort -u "$OUT.findings" -o "$OUT.findings"
FINDING_COUNT="$(wc -l < "$OUT.findings" | tr -d ' ')"

# --- classify every gate ---------------------------------------------------------------------------
classify_findings lint "$FINDING_COUNT"
classify_findings test "$FAIL_COUNT_FOR_VERDICT"
classify_passfail fmt-check
classify_passfail typecheck
classify_passfail archtest
classify_passfail frontend-build

# --- coverage -------------------------------------------------------------------------------------
COVERAGE="$(grep -hoE 'coverage: [0-9.]+% of statements' "$LOGS/coverage.log" 2>/dev/null \
  | grep -oE '[0-9.]+' | awk '{s+=$1; n++} END {if (n) printf "%.1f%% (mean of %d packages)", s/n, n; else print "not measured"}')"

# --- write it --------------------------------------------------------------------------------------
{
  echo "# Baseline — $EVIDENCE_NAME"
  echo
  echo "Captured by \`just baseline $EVIDENCE_NAME\`. Do not edit by hand."
  echo
  echo "| | |"
  echo "|---|---|"
  echo "| commit | \`$COMMIT\` (\`$COMMIT_FULL\`) |"
  echo "| captured | $STAMP |"
  echo "| working tree | $DIRTY |"
  echo "| coverage | $COVERAGE |"
  echo
  echo "## Gates"
  echo
  echo "\`clean\` — exit 0. \`ok-with-findings\` — non-zero, but findings were extracted, so the gate ran."
  echo "\`UNRELIABLE\` — non-zero **and** nothing extracted: the gate did not analyse anything, and a"
  echo "later diff against it would pass whatever is written."
  echo
  echo "| gate | command | exit | verdict | findings |"
  echo "|---|---|---|---|---|"
  while IFS='=' read -r gate code verdict count; do
    case "$gate" in
      fmt-check)      cmd='just fmt-check' ;;
      typecheck)      cmd='just typecheck' ;;
      lint)           cmd='just lint' ;;
      test)           cmd='just test' ;;
      archtest)       cmd='just archtest' ;;
      frontend-build) cmd='just frontend-build' ;;
      *)              cmd="$gate" ;;
    esac
    echo "| $gate | \`$cmd\` | $code | $verdict | $count |"
  done < "$OUT.exit"
  echo
  echo "Raw output for every gate is kept in \`$(basename "$OUT").logs/\`."
  echo
  if [[ "$UNRELIABLE" == "1" ]]; then
    echo "## DO NOT BUILD ON THIS BASELINE"
    echo
    echo "A gate above is marked UNRELIABLE: it exited non-zero and produced no parseable findings,"
    echo "which means it did not analyse anything. A later diff against this baseline will pass"
    echo "regardless of what is written."
    echo
    echo "Fix the gate, record the problem in \`docs/delivery/plan/KNOWN_ISSUES.md\`, and capture the"
    echo "baseline again. \`just verify $EVIDENCE_NAME\` will refuse to run until then."
    echo
  fi
  if [[ "$(grep -c '^archtest=0=' "$OUT.exit" || true)" == "0" ]]; then
    echo "> **The architecture gate is red at baseline.** It is never diffed and never weakened."
    echo "> Fix it before starting the story."
    echo
  fi
  echo "## Failing tests at baseline ($FAIL_COUNT)"
  echo
  if [[ "$FAIL_COUNT" == "0" ]]; then
    echo "*(none)*"
  else
    echo '```'
    cat "$OUT.failing-tests"
    echo '```'
  fi
  echo
  echo "## Static-analysis findings at baseline ($FINDING_COUNT)"
  echo
  echo "A finding present here was not caused by this story. A finding absent here was."
  echo
  if [[ "$FINDING_COUNT" == "0" ]]; then
    echo "*(none)*"
  else
    echo '```'
    cat "$OUT.findings"
    echo '```'
  fi
} > "$OUT_FILE"

printf '%s\n' "$COMMIT_FULL" > "$OUT.commit"

echo
cat "$OUT.exit"
echo
if [[ "$UNRELIABLE" == "1" ]]; then
  echo "BASELINE UNRELIABLE — see $OUT_FILE. Do not start implementation."
  exit 3
fi
echo "Wrote $OUT_FILE"
echo "  $FAIL_COUNT failing test(s), $FINDING_COUNT static-analysis finding(s), coverage $COVERAGE"
exit 0
