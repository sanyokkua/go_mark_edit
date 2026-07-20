#!/usr/bin/env sh
#
# get-review-target.sh — Resolve the scope of a code review deterministically.
#
# READ-ONLY: this script only inspects the repository (git diff / log / rev-parse /
# ls-files). It NEVER mutates the working tree, index, refs, or config.
#
# Modes:
#   --working          Working tree vs HEAD (default)
#   --staged           Index (staged changes) vs HEAD
#   --branch [BASE]    Current branch vs BASE (auto-detected if omitted:
#                      origin/main -> origin/master -> main -> master), via merge-base
#   --commits N        Last N commits (HEAD~N..HEAD)
#
# Output:
#   stdout: a single JSON object describing the scope and changed files.
#   stderr: a short human-readable summary.
#
# Exit codes:
#   0  success
#   1  usage error
#   2  environment error (git missing, not a repo, bad arguments)
#
set -eu

PROG="get-review-target.sh"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

usage() {
  cat <<'EOF'
Usage: get-review-target.sh [MODE]

Resolve the scope of a code review and emit JSON describing the changed files.
This script is strictly read-only; it never modifies the repository.

Modes:
  --working          Working tree vs HEAD (default)
  --staged           Staged (index) changes vs HEAD
  --branch [BASE]    Current branch vs BASE (default base auto-detected:
                     origin/main -> origin/master -> main -> master)
  --commits N        Last N commits (HEAD~N..HEAD); N must be a positive integer
  -h, --help         Show this help and exit

Output:
  stdout  one JSON object: { mode, base, head, total_files, total_added,
          total_deleted, files: [ { path, added, deleted, status, flags } ],
          summary }
  stderr  a human-readable summary

Examples:
  get-review-target.sh
  get-review-target.sh --staged
  get-review-target.sh --branch
  get-review-target.sh --branch origin/develop
  get-review-target.sh --commits 5
EOF
}

# Emit a JSON error object and exit with the given code.
# Usage: emit_error CODE "message"
emit_error() {
  _code=$1
  _msg=$2
  printf '{"error":"%s","mode":null,"files":[]}\n' "$(json_escape "$_msg")"
  printf '%s: error: %s\n' "$PROG" "$_msg" >&2
  exit "$_code"
}

# Escape a string for safe inclusion in JSON (handles backslash, quote, tab, CR;
# newlines become \n). Values passed here are single-line in practice (paths,
# modes, refs), but multi-line input is still handled safely.
json_escape() {
  printf '%s' "$1" | awk '
    BEGIN { ORS = "" }
    {
      s = $0
      gsub(/\\/, "\\\\", s)
      gsub(/"/,  "\\\"", s)
      gsub(/\t/, "\\t", s)
      gsub(/\r/, "\\r", s)
      if (NR > 1) printf "\\n"
      printf "%s", s
    }
  '
}

# Does a git ref/branch exist?  (read-only)
ref_exists() {
  git rev-parse --verify --quiet "$1" >/dev/null 2>&1
}

# Classify a path: echo "skip:generated/large" worthy flags, comma-joined, or empty.
# Args: path added deleted
classify_flags() {
  _p=$1
  _added=$2
  _deleted=$3
  _flags=""

  # numstat reports "-" for binary files.
  if [ "$_added" = "-" ] || [ "$_deleted" = "-" ]; then
    _flags="binary"
  fi

  case "$_p" in
    */node_modules/*|node_modules/*|*/vendor/*|vendor/*|*/third_party/*|third_party/*)
      _flags="${_flags:+$_flags,}skip:vendored" ;;
    dist/*|*/dist/*|build/*|*/build/*|out/*|*/out/*|target/*|*/target/*)
      _flags="${_flags:+$_flags,}skip:build-output" ;;
  esac

  case "$_p" in
    package-lock.json|*/package-lock.json|\
    yarn.lock|*/yarn.lock|\
    pnpm-lock.yaml|*/pnpm-lock.yaml|\
    Gemfile.lock|*/Gemfile.lock|\
    go.sum|*/go.sum|\
    Cargo.lock|*/Cargo.lock|\
    poetry.lock|*/poetry.lock|\
    composer.lock|*/composer.lock)
      _flags="${_flags:+$_flags,}skip:lockfile" ;;
  esac

  case "$_p" in
    *.min.js|*.min.css)
      _flags="${_flags:+$_flags,}skip:minified" ;;
    *.pb.go|*_pb2.py|*.generated.*|*.snap)
      _flags="${_flags:+$_flags,}skip:generated" ;;
  esac

  # Large change: more than 1000 changed lines (added+deleted), when numeric.
  if [ "$_added" != "-" ] && [ "$_deleted" != "-" ]; then
    _total=$(( _added + _deleted ))
    if [ "$_total" -gt 1000 ]; then
      _flags="${_flags:+$_flags,}skip:large"
    fi
  fi

  printf '%s' "$_flags"
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

MODE="working"
BASE=""
COMMITS_N=""

while [ $# -gt 0 ]; do
  case "$1" in
    --working) MODE="working" ;;
    --staged)  MODE="staged" ;;
    --branch)
      MODE="branch"
      # Optional positional base if the next arg is not another flag.
      if [ $# -ge 2 ]; then
        case "$2" in
          --*|-h) : ;;
          *) BASE=$2; shift ;;
        esac
      fi
      ;;
    --commits)
      MODE="commits"
      if [ $# -lt 2 ]; then
        echo "$PROG: --commits requires a positive integer argument" >&2
        usage >&2
        exit 1
      fi
      COMMITS_N=$2
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "$PROG: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# Environment checks (graceful degradation)
# ---------------------------------------------------------------------------

if ! command -v git >/dev/null 2>&1; then
  emit_error 2 "git is not installed or not on PATH"
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  emit_error 2 "not inside a git repository"
fi

# A repository with no commits yet has no HEAD to diff against.
if ! ref_exists HEAD; then
  emit_error 2 "repository has no commits (no HEAD to compare against)"
fi

# ---------------------------------------------------------------------------
# Resolve the diff target (DIFF_ARGS) per mode
# ---------------------------------------------------------------------------

HEAD_REF=$(git rev-parse --short HEAD 2>/dev/null || echo "HEAD")
RESOLVED_BASE="null"

case "$MODE" in
  working)
    # Working tree vs HEAD: numstat with no revisions.
    set -- ""
    DIFF_KIND="worktree"
    ;;
  staged)
    set -- "--cached"
    DIFF_KIND="staged"
    ;;
  branch)
    if [ -z "$BASE" ]; then
      for cand in origin/main origin/master main master; do
        if ref_exists "$cand"; then
          BASE=$cand
          break
        fi
      done
    fi
    if [ -z "$BASE" ]; then
      emit_error 2 "could not auto-detect a base branch (tried origin/main, origin/master, main, master); pass one explicitly with --branch BASE"
    fi
    if ! ref_exists "$BASE"; then
      emit_error 2 "base branch does not exist: $BASE"
    fi
    RESOLVED_BASE=$BASE
    # Three-dot uses the merge base of BASE and HEAD.
    set -- "${BASE}...HEAD"
    DIFF_KIND="branch"
    ;;
  commits)
    case "$COMMITS_N" in
      ''|*[!0-9]*)
        emit_error 2 "--commits requires a positive integer, got: $COMMITS_N" ;;
    esac
    if [ "$COMMITS_N" -lt 1 ]; then
      emit_error 2 "--commits must be >= 1"
    fi
    if ! ref_exists "HEAD~${COMMITS_N}"; then
      emit_error 2 "history is shorter than ${COMMITS_N} commits"
    fi
    RESOLVED_BASE=$(git rev-parse --short "HEAD~${COMMITS_N}")
    set -- "HEAD~${COMMITS_N}..HEAD"
    DIFF_KIND="commits"
    ;;
esac

# ---------------------------------------------------------------------------
# Collect numstat and build JSON
# ---------------------------------------------------------------------------

# We read numstat (added, deleted, path) and a name-status pass for the
# status letter (A/M/D/R...). Rename detection enabled with -M.
#
# numstat output:  <added>\t<deleted>\t<path>
# name-status:     <STATUS>\t<path>  (rename: R100\t<old>\t<new>)

# Build a status lookup using a temporary, in-memory approach (no temp files).
# We feed both outputs to a single awk that emits JSON for the files array.

# shellcheck disable=SC2086
NUMSTAT=$(git diff -M --numstat $* 2>/dev/null || true)
# shellcheck disable=SC2086
NAMESTATUS=$(git diff -M --name-status $* 2>/dev/null || true)

# Walk numstat line by line: compute totals, classify flags, and look up the
# status letter from name-status. Build the files JSON array incrementally.

TOTAL_FILES=0
TOTAL_ADDED=0
TOTAL_DELETED=0
FILES_OUT="["
FIRST=1

# Re-parse the simple JSON array we just built. To stay POSIX and robust, we
# regenerate from the numstat directly here for flags/totals, then merge status.
# Use a record separator approach over numstat lines.

OLDIFS=$IFS
IFS='
'
for line in $NUMSTAT; do
  [ -z "$line" ] && continue
  added=$(printf '%s' "$line" | cut -f1)
  deleted=$(printf '%s' "$line" | cut -f2)
  path=$(printf '%s' "$line" | cut -f3-)
  # Normalize rename form "old => new"
  case "$path" in
    *" => "*)
      path=$(printf '%s' "$path" | sed 's/.* => //; s/[{}]//g') ;;
  esac

  # Status from name-status
  status=$(printf '%s\n' "$NAMESTATUS" | awk -v target="$path" '
    { st=$1; line=$0; sub(/^[A-Z][0-9]*\t/, "", line);
      n=split(line, p, "\t"); if (p[n]==target) { print substr(st,1,1); exit } }')
  [ -z "$status" ] && status="M"

  flags=$(classify_flags "$path" "$added" "$deleted")

  na=$added; nd=$deleted
  [ "$na" = "-" ] && na=0
  [ "$nd" = "-" ] && nd=0
  TOTAL_FILES=$(( TOTAL_FILES + 1 ))
  TOTAL_ADDED=$(( TOTAL_ADDED + na ))
  TOTAL_DELETED=$(( TOTAL_DELETED + nd ))

  # Build flags JSON array
  if [ -n "$flags" ]; then
    fjson="["
    ffirst=1
    OLDIFS2=$IFS
    IFS=,
    for fl in $flags; do
      if [ "$ffirst" -eq 1 ]; then ffirst=0; else fjson="$fjson,"; fi
      fjson="$fjson\"$(json_escape "$fl")\""
    done
    IFS=$OLDIFS2
    fjson="$fjson]"
  else
    fjson="[]"
  fi

  epath=$(json_escape "$path")
  estatus=$(json_escape "$status")

  if [ "$FIRST" -eq 1 ]; then FIRST=0; else FILES_OUT="$FILES_OUT,"; fi
  FILES_OUT="$FILES_OUT{\"path\":\"$epath\",\"added\":$na,\"deleted\":$nd,\"status\":\"$estatus\",\"flags\":$fjson}"
done
IFS=$OLDIFS
FILES_OUT="$FILES_OUT]"

# ---------------------------------------------------------------------------
# Compose output
# ---------------------------------------------------------------------------

SUMMARY="mode=$MODE base=$RESOLVED_BASE head=$HEAD_REF files=$TOTAL_FILES +$TOTAL_ADDED/-$TOTAL_DELETED"

if [ "$RESOLVED_BASE" = "null" ]; then
  BASE_JSON="null"
else
  BASE_JSON="\"$(json_escape "$RESOLVED_BASE")\""
fi

printf '{"mode":"%s","base":%s,"head":"%s","total_files":%s,"total_added":%s,"total_deleted":%s,"files":%s,"summary":"%s"}\n' \
  "$(json_escape "$MODE")" \
  "$BASE_JSON" \
  "$(json_escape "$HEAD_REF")" \
  "$TOTAL_FILES" \
  "$TOTAL_ADDED" \
  "$TOTAL_DELETED" \
  "$FILES_OUT" \
  "$(json_escape "$SUMMARY")"

printf 'Review scope: %s\n' "$SUMMARY" >&2
if [ "$TOTAL_FILES" -eq 0 ]; then
  printf 'No changes found for mode "%s".\n' "$MODE" >&2
fi
