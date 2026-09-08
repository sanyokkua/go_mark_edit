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

# Legacy story evidence remains readable at its existing location.
assert_equal "$(evidence_id_parse STORY-063)" 'story|063' 'legacy story parsing'
assert_equal "$(evidence_baseline_base STORY-063)" \
  'docs/delivery/work/baselines/story-063' 'legacy story baseline path'
assert_equal "$(evidence_baseline_base 063)" \
  'docs/delivery/work/baselines/story-063' 'numeric story baseline path'

# New Spec Kit work uses a safe feature ID and cannot collide with story evidence.
assert_equal "$(evidence_id_parse 001-gomarkedit-product)" \
  'feature|001-gomarkedit-product' 'feature parsing'
assert_equal "$(evidence_baseline_base 001-gomarkedit-product)" \
  'docs/delivery/work/baselines/feature-001-gomarkedit-product' 'feature baseline path'
assert_equal "$(evidence_verification_baseline_base 001-gomarkedit-product)" \
  'docs/delivery/work/baselines/story-063' 'product baseline migration alias'

for invalid in '' ' ' '../001-gomarkedit-product' '001/other' \
  '001-gomarkedit-product/' '001-gomarkedit-product.md' \
  '001-GoMarkEdit-product' '-001-gomarkedit-product' \
  '001-gomarkedit--product'; do
  assert_rejected "$invalid"
done

# Existing legacy evidence remains complete and an unreliable feature baseline is refused before
# any gate can be compared against it.
legacy_base='docs/delivery/work/baselines/story-063'
[[ -s "$legacy_base.logs/lint.log" ]] || fail 'legacy lint raw log is missing'
grep -q '^lint=.*=ok-with-findings=' "$legacy_base.exit" || \
  fail 'legacy lint reliability verdict is missing'

fixture_base='docs/delivery/work/baselines/feature-999-evidence-contract'
fixture_output="$(mktemp)"
cleanup() {
  rm -rf "$fixture_base.logs" "$fixture_base.md" "$fixture_base.exit" \
    "$fixture_base.failing-tests" "$fixture_base.findings" "$fixture_base.commit" \
    "$fixture_output"
}
trap cleanup EXIT
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
