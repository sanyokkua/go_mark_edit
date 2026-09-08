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
    feature) printf 'specs/%s/evidence/baseline/baseline\n' "$key" ;;
    *) printf "invalid parsed evidence identifier '%s'\n" "$parsed" >&2; return 2 ;;
  esac
}

# Verification location.
#
# Two features were baselined before capture moved into specs/, and that evidence is immutable
# history. Verification resolves them through an explicit pre-migration table rather than by
# probing the filesystem, so the mapping stays deterministic and reviewable:
#
#   001-gomarkedit-product      -> story-063, the baseline captured before its legacy-story
#                                  implementation began. Capture still uses the feature's own
#                                  path, so this alias cannot overwrite STORY-063.
#   002-editor-stage-formatting -> its existing docs/delivery/ baseline.
#
# Every other feature verifies against the same path it captures to.
evidence_verification_baseline_base() {
  local parsed kind key
  parsed="$(evidence_id_parse "${1:-}")" || return $?
  IFS='|' read -r kind key <<<"$parsed"

  if [[ "$kind" == 'feature' ]]; then
    case "$key" in
      001-gomarkedit-product)
        printf 'docs/delivery/work/baselines/story-063\n'
        return 0
        ;;
      002-editor-stage-formatting)
        printf 'docs/delivery/work/baselines/feature-%s\n' "$key"
        return 0
        ;;
    esac
  fi

  evidence_baseline_base "${1:-}"
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
