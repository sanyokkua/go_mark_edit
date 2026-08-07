#!/usr/bin/env bash
# Contract tests for legacy-story and Spec Kit feature-slice baseline evidence.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/evidence_id.sh
source "$REPO_ROOT/scripts/evidence_id.sh"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_equal() {
  local actual="$1" expected="$2" label="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: expected '$expected', got '$actual'"
}

assert_rejected() {
  local id="$1"
  if evidence_id_parse "$id" >/dev/null 2>&1; then
    fail "unsafe identifier '$id' was accepted"
  fi
}

case_pass() {
  printf '  PASS  %s\n' "$1"
}

# --- 1. feature routing ---------------------------------------------------------------------------
# A migrated Spec Kit feature captures beside its own spec, never under the reference-only
# docs/delivery/ tree, and verifies against the same path it captured to.
assert_equal "$(evidence_id_parse 003-real-files-and-tabs)" \
  'feature|003-real-files-and-tabs' 'feature parsing'
assert_equal "$(evidence_baseline_base 003-real-files-and-tabs)" \
  'specs/003-real-files-and-tabs/evidence/baseline/baseline' 'feature baseline capture path'
assert_equal "$(evidence_verification_baseline_base 003-real-files-and-tabs)" \
  'specs/003-real-files-and-tabs/evidence/baseline/baseline' 'feature baseline verification path'
assert_equal "$(evidence_display_name 003-real-files-and-tabs)" \
  '003-real-files-and-tabs' 'feature display name'
case "$(evidence_baseline_base 003-real-files-and-tabs)" in
  docs/delivery/*) fail 'feature routing still writes under docs/delivery/' ;;
esac
case_pass 'feature routing'

# --- 2. unsafe-ID refusal -------------------------------------------------------------------------
for invalid in '' ' ' '../001-gomarkedit-product' '001/other' \
  '001-gomarkedit-product/' '001-gomarkedit-product.md' \
  '001-GoMarkEdit-product' '-001-gomarkedit-product' \
  '001-gomarkedit--product'; do
  assert_rejected "$invalid"
done
case_pass 'unsafe-ID refusal'

# --- 3. legacy-path preservation ------------------------------------------------------------------
# Legacy story evidence remains readable at its existing location, and the one pre-migration feature
# that still verifies from docs/delivery/ keeps doing so.
assert_equal "$(evidence_id_parse STORY-063)" 'story|063' 'legacy story parsing'
assert_equal "$(evidence_baseline_base STORY-063)" \
  'docs/delivery/work/baselines/story-063' 'legacy story baseline path'
assert_equal "$(evidence_baseline_base 063)" \
  'docs/delivery/work/baselines/story-063' 'numeric story baseline path'
assert_equal "$(evidence_verification_baseline_base 002-editor-stage-formatting)" \
  'docs/delivery/work/baselines/feature-002-editor-stage-formatting' \
  'pre-migration feature verification path'
legacy_base='docs/delivery/work/baselines/story-063'
[[ -s "$legacy_base.logs/lint.log" ]] || fail 'legacy lint raw log is missing'
grep -q '^lint=.*=ok-with-findings=' "$legacy_base.exit" || \
  fail 'legacy lint reliability verdict is missing'
[[ -s 'docs/delivery/work/baselines/feature-002-editor-stage-formatting.md' ]] || \
  fail 'pre-migration feature baseline report is missing'
case_pass 'legacy-path preservation'

# --- 4. Feature 001 alias preservation ------------------------------------------------------------
# Feature 001 verifies against the immutable STORY-063 baseline, while its own capture path stays
# separate and therefore cannot overwrite it.
assert_equal "$(evidence_verification_baseline_base 001-gomarkedit-product)" \
  'docs/delivery/work/baselines/story-063' 'product baseline migration alias'
assert_equal "$(evidence_baseline_base 001-gomarkedit-product)" \
  'specs/001-gomarkedit-product/evidence/baseline/baseline' 'product baseline capture path'
[[ "$(evidence_baseline_base 001-gomarkedit-product)" \
   != "$(evidence_verification_baseline_base 001-gomarkedit-product)" ]] || \
  fail 'Feature 001 capture would overwrite the STORY-063 baseline'
case_pass 'Feature 001 alias preservation'

# --- 5. unreliable-baseline refusal ---------------------------------------------------------------
# An UNRELIABLE gate must stop verification before any gate can be diffed against it.
fixture_feature='999-evidence-contract'
fixture_root="specs/$fixture_feature"
fixture_base="$(evidence_baseline_base "$fixture_feature")"
fixture_output="$(mktemp)"
cleanup() {
  rm -rf "$fixture_root" "$fixture_output"
}
trap cleanup EXIT
[[ ! -e "$fixture_root" ]] || fail "fixture path $fixture_root already exists; refusing to clobber it"
mkdir -p "$fixture_base.logs"
printf 'lint=1=UNRELIABLE=0\n' >"$fixture_base.exit"
: >"$fixture_base.md"
: >"$fixture_base.failing-tests"
: >"$fixture_base.findings"
if just verify 999-evidence-contract >"$fixture_output" 2>&1; then
  fail 'verification accepted unreliable feature evidence'
fi
grep -q 'REFUSING TO VERIFY' "$fixture_output" || \
  fail 'verification did not explain its unreliable-evidence refusal'
case_pass 'unreliable-baseline refusal'

# Spec Kit replaces only the old planning validators. Correctness gates stay callable.
recipes="$(just --list)"
for retained in baseline verify fmt-check typecheck lint test archtest frontend-build; do
  grep -Eq "^[[:space:]]*$retained([[:space:]]|$)" <<<"$recipes" || \
    fail "retained recipe '$retained' is not callable"
done
for removed in spec-check story-check; do
  if grep -Eq "^[[:space:]]*$removed([[:space:]]|$)" <<<"$recipes"; then
    fail "superseded recipe '$removed' is still callable"
  fi
done
for removed_script in validate_spec.py check_story.py upgrade_check.py check_proves.py; do
  [[ ! -e "scripts/$removed_script" ]] || fail "superseded validator '$removed_script' still exists"
done
if grep -Eq 'M9|M10|M12|BASE_COMMIT' scripts/verify.sh; then
  fail 'verification still runs retired configuration or documentation checks'
fi

printf 'baseline evidence identifier contract: PASS\n'
