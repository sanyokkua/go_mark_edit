package apperr

import (
	"strings"
	"testing"
)

func TestClassifiedErrorCategoryIsExhaustive(t *testing.T) {
	const want = 8
	if len(AllClassifiedErrorCategories) != want {
		t.Fatalf("classified categories = %d, want %d", len(AllClassifiedErrorCategories), want)
	}
	seen := make(map[ClassifiedErrorCategory]bool, len(AllClassifiedErrorCategories))
	for _, category := range AllClassifiedErrorCategories {
		if seen[category] {
			t.Fatalf("classified category %q is duplicated", category)
		}
		seen[category] = true
	}
}

func TestClassifiedErrorRemediationIsFixedVocabulary(t *testing.T) {
	allowed := map[ClassifiedRemediation]bool{
		RemediationNone: true, RemediationRetry: true, RemediationReload: true,
		RemediationKeepMine: true, RemediationSkip: true, RemediationSaveToRecreate: true,
		RemediationCopyPath: true, RemediationCancel: true,
	}
	if len(AllClassifiedRemediations) != len(allowed) {
		t.Fatalf("remediation vocabulary has %d entries, want %d", len(AllClassifiedRemediations), len(allowed))
	}
	for _, remediation := range AllClassifiedRemediations {
		if !allowed[remediation] {
			t.Fatalf("unexpected remediation %q", remediation)
		}
	}
	classified := NewClassifiedError(ClassifiedNotFound, "/private/user/secret.md", "missing", RemediationCopyPath, "doc-1")
	if classified.SafeSubject != "secret.md" || strings.Contains(classified.SafeSubject, "/") {
		t.Fatalf("safe subject = %q", classified.SafeSubject)
	}
	if classified.DedupKey != "doc-1:not-found" {
		t.Fatalf("dedup key = %q", classified.DedupKey)
	}
	if err := classified.Validate(); err != nil {
		t.Fatalf("validate classified error: %v", err)
	}
}
