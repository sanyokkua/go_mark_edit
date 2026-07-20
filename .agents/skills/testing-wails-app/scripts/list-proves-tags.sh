#!/usr/bin/env sh
#
# list-proves-tags.sh — List every `Proves: STORY-NNN-AC-N` id declared across the test tree.
#
# A pre-`just trace-check` sanity check: shows which acceptance-criteria ids your tests currently
# claim to prove, so you can eyeball coverage before running the traceability gate. It does NOT
# validate against the stories — that is `just trace-check`'s job — it only reports what is declared.
#
# READ-ONLY: greps files; never writes, edits, or runs the tests.
#
# Usage:
#   list-proves-tags.sh [ROOT]      # ROOT defaults to the current directory
#   list-proves-tags.sh --count [ROOT]   # also print how many distinct ids were found
#
# Scans Go, TS/TSX test files for the `Proves:` tag in a comment or an it()/test() title.
#
# Exit codes:
#   0  success (ids printed, or none found)
#   2  ROOT is not a directory
set -eu

COUNT=0
ROOT="."

for arg in "$@"; do
  case "$arg" in
    --count) COUNT=1 ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) ROOT="$arg" ;;
  esac
done

if [ ! -d "$ROOT" ]; then
  echo "list-proves-tags.sh: not a directory: $ROOT" >&2
  exit 2
fi

# Match the bare AC-id token so BOTH conventions are caught:
#   - a `// Proves: STORY-NNN-AC-N` comment (Go / TS), and
#   - the id opening an it()/test()/describe() title (Jest / Playwright).
# Prefer ripgrep when available (respects .gitignore, fast); fall back to grep -r.
if command -v rg >/dev/null 2>&1; then
  RAW=$(rg --no-heading --no-line-number --no-filename -o \
        'STORY-[0-9]{3}-AC-[0-9]+' \
        -g '*_test.go' -g '*.test.ts' -g '*.test.tsx' \
        "$ROOT" 2>/dev/null || true)
else
  RAW=$(grep -rhoE \
        'STORY-[0-9]{3}-AC-[0-9]+' \
        --include='*_test.go' --include='*.test.ts' --include='*.test.tsx' \
        "$ROOT" 2>/dev/null || true)
fi

# Sort, unique.
IDS=$(printf '%s\n' "$RAW" \
      | sed '/^$/d' \
      | sort -u)

if [ -z "$IDS" ]; then
  echo "No STORY-NNN-AC-N ids found in test files under: $ROOT" >&2
  [ "$COUNT" -eq 1 ] && echo "0"
  exit 0
fi

printf '%s\n' "$IDS"

if [ "$COUNT" -eq 1 ]; then
  N=$(printf '%s\n' "$IDS" | wc -l | tr -d ' ')
  echo "----"
  echo "$N distinct AC id(s) proven"
fi
