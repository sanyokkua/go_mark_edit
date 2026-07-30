#!/usr/bin/env bash
# Parse and name baseline evidence without mixing legacy stories and Spec Kit features.

evidence_id_parse() {
  local value="${1:-}"
  local story_number

  if [[ "$value" =~ ^[Ss][Tt][Oo][Rr][Yy]-([0-9]+)$ ]]; then
    story_number="${BASH_REMATCH[1]}"
    printf 'story|%s\n' "$story_number"
  elif [[ "$value" =~ ^[0-9]+$ ]]; then
    printf 'story|%s\n' "$value"
  elif [[ "$value" =~ ^[0-9]+-[a-z0-9]+(-[a-z0-9]+)+$ ]]; then
    printf 'feature|%s\n' "$value"
  else
    printf "invalid evidence identifier '%s'\n" "$value" >&2
    return 2
  fi
}

evidence_baseline_base() {
  local parsed kind key
  parsed="$(evidence_id_parse "${1:-}")" || return $?
  IFS='|' read -r kind key <<<"$parsed"

  case "$kind" in
    story) printf 'docs/delivery/work/baselines/story-%s\n' "$key" ;;
    feature) printf 'docs/delivery/work/baselines/feature-%s\n' "$key" ;;
    *) printf "invalid parsed evidence identifier '%s'\n" "$parsed" >&2; return 2 ;;
  esac
}

evidence_display_name() {
  local parsed kind key
  parsed="$(evidence_id_parse "${1:-}")" || return $?
  IFS='|' read -r kind key <<<"$parsed"

  case "$kind" in
    story) printf 'STORY-%s\n' "$key" ;;
    feature) printf '%s\n' "$key" ;;
    *) printf "invalid parsed evidence identifier '%s'\n" "$parsed" >&2; return 2 ;;
  esac
}
