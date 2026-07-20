#!/usr/bin/env sh
#
# check-story-frontmatter.sh — Sanity-list the front-matter of every story file.
#
# A quick eyeball aid, NOT a substitute for `just trace-check` (which is the authoritative gate).
# For each docs/stories/story-*.md it prints id / status / phase / owner / estimate and flags
# obviously-missing required fields. It does not validate spec anchors, module paths, or the
# dependency graph — that is `just trace-check`'s job.
#
# READ-ONLY: greps files; never writes or edits anything.
#
# Usage:
#   check-story-frontmatter.sh [DIR]     # DIR defaults to docs/stories
#
# Exit codes:
#   0  all listed stories have the required scalar fields
#   1  at least one story is missing a required field
#   2  DIR is not a directory / no story files found
set -eu

DIR="${1:-docs/stories}"

if [ ! -d "$DIR" ]; then
  echo "check-story-frontmatter.sh: not a directory: $DIR" >&2
  exit 2
fi

# Required scalar front-matter fields we can cheaply check for presence.
REQUIRED="id title status phase owner estimate"

# Collect story files (story-*.md); ignore templates/READMEs.
FILES=$(find "$DIR" -maxdepth 1 -type f -name 'story-*.md' 2>/dev/null | sort || true)

if [ -z "$FILES" ]; then
  echo "No story-*.md files found under: $DIR" >&2
  exit 2
fi

RC=0
printf '%-28s %-12s %-6s %-8s %-4s  %s\n' "FILE" "STATUS" "PHASE" "OWNER" "EST" "ID"
printf '%-28s %-12s %-6s %-8s %-4s  %s\n' "----" "------" "-----" "-----" "---" "--"

# Extract a top-level YAML scalar value ("key: value") from the front-matter block.
field() {
  # $1 = file, $2 = key
  awk -v k="$2" '
    /^---[[:space:]]*$/ { fm++; next }
    fm==1 {
      # match "key:" at column 0 (top-level field only)
      if ($0 ~ "^"k":[[:space:]]*") {
        sub("^"k":[[:space:]]*", "", $0)
        # strip trailing inline comment and whitespace
        sub("[[:space:]]*#.*$", "", $0)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
        print $0
        exit
      }
    }
    fm==2 { exit }
  ' "$1"
}

for f in $FILES; do
  base=$(basename "$f")
  id=$(field "$f" id)
  status=$(field "$f" status)
  phase=$(field "$f" phase)
  owner=$(field "$f" owner)
  est=$(field "$f" estimate)

  missing=""
  for key in $REQUIRED; do
    val=$(field "$f" "$key")
    [ -z "$val" ] && missing="${missing:+$missing,}$key"
  done

  printf '%-28s %-12s %-6s %-8s %-4s  %s\n' \
    "$base" "${status:-?}" "${phase:-?}" "${owner:-?}" "${est:-?}" "${id:-?}"

  if [ -n "$missing" ]; then
    printf '  !! missing required field(s): %s\n' "$missing" >&2
    RC=1
  fi
done

exit "$RC"
