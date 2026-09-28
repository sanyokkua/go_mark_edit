package apperr_test

import (
	. "github.com/sanyokkua/go_mark_edit/internal/apperr"
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
}

func TestNewClassifiedErrorNeverExposesAnInternalIdentifier(t *testing.T) {
	/*
	 * The last line of defence for "name only the safe basename or the
	 * disambiguated tab label". mintDocumentID produces every synthetic id in the
	 * application — documents, close plans and open reservations alike — and
	 * filepath.Base is a no-op on one, so any of the ~46 helper call sites could
	 * put doc-0000000000000003 in front of a user.
	 *
	 * A per-call-site fix cannot prevent the next call site from reintroducing it;
	 * rejecting the shape here can.
	 */
	for _, subject := range []string{"doc-0000000000000003", "doc-00000000000000ff", "doc-a"} {
		classified := NewClassifiedError(ClassifiedIOFailure, subject, "The document could not be written.", RemediationRetry, subject)
		if classified.SafeSubject == subject {
			t.Fatalf("NewClassifiedError exposed the internal identifier %q as the user-facing subject", subject)
		}
		if classified.SafeSubject != "document" {
			t.Fatalf("internal identifier %q became %q, want the generic subject", subject, classified.SafeSubject)
		}
	}
}

func TestNewClassifiedErrorKeepsRealNamesThatMerelyLookSimilar(t *testing.T) {
	// The guard must not swallow a genuine filename. Only the exact minted shape
	// (doc- followed by lowercase hex) is an identifier.
	for subject, want := range map[string]string{
		"/repo/notes/doc-review.md": "doc-review.md",
		"doc-notes.md":              "doc-notes.md",
		"doc-00zz":                  "doc-00zz",
		"/repo/release-notes.md":    "release-notes.md",
	} {
		classified := NewClassifiedError(ClassifiedIOFailure, subject, "message", RemediationRetry, "doc-1")
		if classified.SafeSubject != want {
			t.Fatalf("subject %q became %q, want %q", subject, classified.SafeSubject, want)
		}
	}
}

func TestClassifiedErrorRefusesARemediationItsCategoryForbids(t *testing.T) {
	/*
	 * The contract fixes one remediation set per category and nothing enforced it:
	 * Validate checked only that the value was in the *global* vocabulary, so any
	 * category could carry any action. permission-denied is message-only precisely
	 * because "retrying the identical action cannot succeed", yet
	 * newAtomicReplaceError defaulted every non-conflict category to Retry.
	 *
	 * Latent until made remediations render. A permission-denied save now
	 * shows a Retry button that can only fail again.
	 */
	forbidden := map[ClassifiedErrorCategory]ClassifiedRemediation{
		ClassifiedPermissionDenied:   RemediationRetry,
		ClassifiedCapacityLimit:      RemediationRetry,
		ClassifiedUnsupportedInput:   RemediationRetry,
		ClassifiedPersistenceWarning: RemediationRetry,
		ClassifiedNotFound:           RemediationRetry,
	}
	for category, remediation := range forbidden {
		// Defence in depth: the constructor must not be able to build one either.
		built := NewClassifiedError(category, "notes.md", "m", remediation, "doc-1")
		if len(built.Remediations) != 0 {
			t.Fatalf("NewClassifiedError kept forbidden remediation %q for category %q, want message-only, got %v", remediation, category, built.Remediations)
		}
	}
}

func TestClassifiedErrorKeepsTheRemediationItsCategoryAllows(t *testing.T) {
	allowed := []struct {
		category    ClassifiedErrorCategory
		remediation ClassifiedRemediation
	}{
		{ClassifiedIOFailure, RemediationRetry},
		{ClassifiedSystemCommandFailure, RemediationRetry},
		{ClassifiedSystemCommandFailure, RemediationCopyPath},
		{ClassifiedNotFound, RemediationSaveToRecreate},
		{ClassifiedNotFound, RemediationCopyPath},
		{ClassifiedConflict, RemediationReload},
		{ClassifiedConflict, RemediationKeepMine},
		{ClassifiedConflict, RemediationSkip},
		{ClassifiedPermissionDenied, RemediationNone},
	}
	for _, row := range allowed {
		built := NewClassifiedError(row.category, "notes.md", "m", row.remediation, "doc-1")
		if built.Remediation() != row.remediation {
			t.Fatalf("category %q dropped its allowed remediation %q, carries %v", row.category, row.remediation, built.Remediations)
		}
	}
}

func TestEveryCategoryDeclaresItsAllowedRemediations(t *testing.T) {
	// A category with no row would silently accept anything, which is the hole
	// this table closes.
	for _, category := range AllClassifiedErrorCategories {
		allowed := AllowedRemediations(category)
		if len(allowed) == 0 {
			t.Fatalf("category %q declares no allowed remediation set", category)
		}
	}
}
