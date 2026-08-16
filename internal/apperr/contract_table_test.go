package apperr

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

/*
 * The contract table lives in two places: prose in spec.md, and `remediationsByCategory`
 * in this package. Nothing compared them, so they drifted — the spec's `conflict` row
 * enumerated only the external-change actions while the code allowed `Retry` for the
 * stale-revision refusals this codebase also classifies as `conflict`. That divergence
 * survived as a comment for a whole phase because no gate could see it.
 *
 * T159 resolved the disagreement by amending the row. This test is what stops the next
 * one: edit either side alone and it fails, naming the category and the difference.
 */

// specContractPath locates spec.md relative to this package. Kept as one constant so a
// spec-tree move produces one obvious failure rather than a silently skipped test.
const specContractPath = "../../specs/003-real-files-and-tabs/spec.md"

// remediationByLabel maps the contract's user-facing wording onto the vocabulary. The
// constants' values *are* the labels, so this is derived rather than restated.
func remediationByLabel() map[string]ClassifiedRemediation {
	byLabel := make(map[string]ClassifiedRemediation, len(AllClassifiedRemediations))
	for _, remediation := range AllClassifiedRemediations {
		if remediation == RemediationNone {
			continue
		}
		byLabel[string(remediation)] = remediation
	}
	return byLabel
}

// parseContractRemediations reads the eight-category table out of spec.md and returns the
// remediation set each row names. A row's set is the backtick-quoted vocabulary terms in
// its remediation cell, plus RemediationNone wherever the row says "message-only".
func parseContractRemediations(t *testing.T) map[ClassifiedErrorCategory][]ClassifiedRemediation {
	t.Helper()

	raw, err := os.ReadFile(filepath.Clean(specContractPath))
	if err != nil {
		t.Fatalf("read the contract from %s: %v", specContractPath, err)
	}

	byLabel := remediationByLabel()
	categories := make(map[string]ClassifiedErrorCategory, len(AllClassifiedErrorCategories))
	for _, category := range AllClassifiedErrorCategories {
		categories["`"+string(category)+"`"] = category
	}

	parsed := make(map[ClassifiedErrorCategory][]ClassifiedRemediation, len(categories))
	for _, line := range strings.Split(string(raw), "\n") {
		cells := strings.Split(line, "|")
		if len(cells) < 5 {
			continue
		}
		category, isRow := categories[strings.TrimSpace(cells[1])]
		if !isRow {
			continue
		}
		if _, duplicate := parsed[category]; duplicate {
			t.Fatalf("category %q appears in more than one contract row", category)
		}

		found := map[ClassifiedRemediation]bool{}
		for _, term := range strings.Split(cells[3], "`") {
			if remediation, isVocabulary := byLabel[term]; isVocabulary {
				found[remediation] = true
			}
		}
		parsed[category] = sortedRemediations(found)
	}
	return parsed
}

func sortedRemediations(set map[ClassifiedRemediation]bool) []ClassifiedRemediation {
	out := make([]ClassifiedRemediation, 0, len(set))
	for remediation := range set {
		out = append(out, remediation)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// Proves: the classified error and remediation contract — the per-category set of
// *actionable* remediations this package enforces is exactly the set spec.md's table
// names for that category.
//
// Partial, and deliberately so on one point: RemediationNone is excluded from the
// comparison. The contract's preamble puts "message-only (dismissal with no further
// action)" in the vocabulary for every category, and this package allows it everywhere
// (see remediationsByCategory's comment), so a row that does not spell out "message-only"
// is not thereby forbidding it. This test therefore does not prove which rows *require*
// message-only. It also does not prove the table's "Meaning" column, nor that any call
// site emits a legal pairing — Validate and its tests cover the latter.
func TestRemediationsByCategoryMatchesTheContractTable(t *testing.T) {
	parsed := parseContractRemediations(t)

	if len(parsed) != len(AllClassifiedErrorCategories) {
		t.Fatalf("contract table declares %d categories, the vocabulary has %d — %v",
			len(parsed), len(AllClassifiedErrorCategories), parsed)
	}

	for _, category := range AllClassifiedErrorCategories {
		want, inContract := parsed[category]
		if !inContract {
			t.Errorf("category %q has no row in the contract table", category)
			continue
		}
		got := sortedRemediations(actionableRemediations(AllowedRemediations(category)))
		if !equalRemediations(got, want) {
			t.Errorf("category %q: enforced %v, contract names %v", category, got, want)
		}
	}
}

// actionableRemediations drops RemediationNone, which every category allows by design.
func actionableRemediations(list []ClassifiedRemediation) map[ClassifiedRemediation]bool {
	set := make(map[ClassifiedRemediation]bool, len(list))
	for _, remediation := range list {
		if remediation == RemediationNone {
			continue
		}
		set[remediation] = true
	}
	return set
}

func equalRemediations(left, right []ClassifiedRemediation) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
