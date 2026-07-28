#!/usr/bin/env bash
# Capture the repository's state immediately before a story starts.
#
# Contract (docs/delivery/work/DOD_TEMPLATE.md):
#   - runs fmt-check, typecheck, lint, test, archtest, build and coverage
#   - writes docs/delivery/work/baselines/story-NNN.md with the commit, the timestamp, every failing
#     test by name, every static-analysis finding as file:rule:message, the coverage figure, and each
#     command's exit code
#   - ALWAYS exits 0. Recording a red state is a valid outcome; it is the reason baselines exist.
#
# Usage: just baseline STORY-057   (or: scripts/baseline.sh STORY-057)

set -uo pipefail

STORY_ARG="${1:-}"
if [[ -z "$STORY_ARG" ]]; then
  echo "usage: scripts/baseline.sh STORY-NNN" >&2
  exit 2
fi

# Accept STORY-057, story-057 or 057.
STORY_NUMBER="$(printf '%s' "$STORY_ARG" | tr -cd '0-9')"
if [[ -z "$STORY_NUMBER" ]]; then
  echo "could not read a story number out of '$STORY_ARG'" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

OUT_DIR="docs/delivery/work/baselines"
OUT_FILE="$OUT_DIR/story-$STORY_NUMBER.md"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$OUT_DIR"

COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo 'not-a-git-repository')"
COMMIT_FULL="$(git rev-parse HEAD 2>/dev/null || echo '-')"
STAMP="$(date -u '+%Y-%m-%d %H:%M UTC')"
DIRTY="clean"
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  DIRTY="**dirty — uncommitted changes are part of this baseline**"
fi

# run <var> <label> <logfile> <command...> — never aborts; records the exit code in <var>.
# Written without associative arrays: macOS ships bash 3.2, which has none.
run() {
  local var="$1" label="$2" log="$3"; shift 3
  local code=0
  printf '  %-14s ' "$label"
  "$@" >"$log" 2>&1 || code=$?
  eval "$var=$code"
  if [[ "$code" == "0" ]]; then echo "ok"; else echo "exit $code"; fi
}

echo "Capturing baseline for STORY-$STORY_NUMBER at $COMMIT"
run EXIT_FMT      fmt-check "$WORK/fmt.log"       just fmt-check
run EXIT_TYPES    typecheck "$WORK/typecheck.log" just typecheck
run EXIT_LINT     lint      "$WORK/lint.log"      just lint
run EXIT_TEST     test      "$WORK/test.log"      just test
run EXIT_ARCH     archtest  "$WORK/archtest.log"  just archtest
run EXIT_BUILD    build     "$WORK/build.log"     just frontend-build
run EXIT_COVERAGE coverage  "$WORK/cover.log"     go test -cover ./internal/... .

# --- failing tests, by fully-qualified name ------------------------------------------------------
grep -hoE '^\s*--- FAIL: [A-Za-z0-9_/]+' "$WORK/test.log" 2>/dev/null \
  | sed 's/.*--- FAIL: //' | sort -u > "$WORK/failing-tests.txt" || true
grep -hoE '^\s+✕ .*' "$WORK/test.log" 2>/dev/null \
  | sed 's/^ *✕ //' | sort -u >> "$WORK/failing-tests.txt" || true
FAIL_COUNT="$(wc -l < "$WORK/failing-tests.txt" | tr -d ' ')"

# --- static-analysis findings, as file:rule:message ----------------------------------------------
: > "$WORK/findings.txt"
# golangci-lint prints "path:line:col: message (linter)"
grep -hoE '^[^ ]+\.go:[0-9]+:[0-9]+: .*' "$WORK/lint.log" 2>/dev/null >> "$WORK/findings.txt" || true
# eslint stylish prints "  line:col  severity  message  rule-id" under a path header
awk '
  /^\// { file = $0; next }
  /^[[:space:]]+[0-9]+:[0-9]+/ {
    rule = $NF
    printf "%s:%s:%s\n", file, rule, $2
  }
' "$WORK/lint.log" >> "$WORK/findings.txt" 2>/dev/null || true
sort -u "$WORK/findings.txt" -o "$WORK/findings.txt"
FINDING_COUNT="$(wc -l < "$WORK/findings.txt" | tr -d ' ')"

# --- coverage -------------------------------------------------------------------------------------
COVERAGE="$(grep -hoE 'coverage: [0-9.]+% of statements' "$WORK/cover.log" 2>/dev/null \
  | grep -oE '[0-9.]+' | awk '{s+=$1; n++} END {if (n) printf "%.1f%% (mean of %d packages)", s/n, n; else print "not measured"}')"

# --- write it --------------------------------------------------------------------------------------
{
  echo "# Baseline — STORY-$STORY_NUMBER"
  echo
  echo "Captured by \`just baseline STORY-$STORY_NUMBER\`. Do not edit by hand."
  echo
  echo "| | |"
  echo "|---|---|"
  echo "| commit | \`$COMMIT\` (\`$COMMIT_FULL\`) |"
  echo "| captured | $STAMP |"
  echo "| working tree | $DIRTY |"
  echo "| coverage | $COVERAGE |"
  echo
  echo "## Command exit codes"
  echo
  echo "| check | command | exit |"
  echo "|---|---|---|"
  echo "| format | \`just fmt-check\` | $EXIT_FMT |"
  echo "| types | \`just typecheck\` | $EXIT_TYPES |"
  echo "| static analysis | \`just lint\` | $EXIT_LINT |"
  echo "| tests | \`just test\` | $EXIT_TEST |"
  echo "| architecture | \`just archtest\` | $EXIT_ARCH |"
  echo "| build | \`just frontend-build\` | $EXIT_BUILD |"
  echo
  if [[ "$EXIT_ARCH" != "0" ]]; then
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
    cat "$WORK/failing-tests.txt"
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
    cat "$WORK/findings.txt"
    echo '```'
  fi
} > "$OUT_FILE"

# Keep the machine-readable copies beside the report so verify can diff against them exactly.
cp "$WORK/failing-tests.txt" "$OUT_DIR/story-$STORY_NUMBER.failing-tests"
cp "$WORK/findings.txt"      "$OUT_DIR/story-$STORY_NUMBER.findings"
printf '%s\n' "$COMMIT_FULL" > "$OUT_DIR/story-$STORY_NUMBER.commit"

echo
echo "Wrote $OUT_FILE"
echo "  $FAIL_COUNT failing test(s), $FINDING_COUNT static-analysis finding(s), coverage $COVERAGE"
exit 0
