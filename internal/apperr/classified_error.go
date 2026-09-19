package apperr

import (
	"fmt"
	"path/filepath"
	"slices"
	"strings"
)

// ClassifiedErrorCategory is the finite, user-safe failure vocabulary for
// document lifecycle and persistence results.
type ClassifiedErrorCategory string

const (
	ClassifiedNotFound             ClassifiedErrorCategory = "not-found"
	ClassifiedPermissionDenied     ClassifiedErrorCategory = "permission-denied"
	ClassifiedIOFailure            ClassifiedErrorCategory = "io-failure"
	ClassifiedConflict             ClassifiedErrorCategory = "conflict"
	ClassifiedCapacityLimit        ClassifiedErrorCategory = "capacity-limit"
	ClassifiedUnsupportedInput     ClassifiedErrorCategory = "unsupported-input"
	ClassifiedSystemCommandFailure ClassifiedErrorCategory = "system-command-failure"
	ClassifiedPersistenceWarning   ClassifiedErrorCategory = "persistence-warning"
)

var AllClassifiedErrorCategories = []ClassifiedErrorCategory{
	ClassifiedNotFound,
	ClassifiedPermissionDenied,
	ClassifiedIOFailure,
	ClassifiedConflict,
	ClassifiedCapacityLimit,
	ClassifiedUnsupportedInput,
	ClassifiedSystemCommandFailure,
	ClassifiedPersistenceWarning,
}

// ClassifiedRemediation is deliberately finite so later surfaces cannot invent
// an unsafe or unsupported recovery action.
type ClassifiedRemediation string

const (
	RemediationNone           ClassifiedRemediation = ""
	RemediationRetry          ClassifiedRemediation = "Retry"
	RemediationReload         ClassifiedRemediation = "Reload from disk"
	RemediationKeepMine       ClassifiedRemediation = "Keep mine"
	RemediationSkip           ClassifiedRemediation = "Skip"
	RemediationSaveToRecreate ClassifiedRemediation = "Save to recreate"
	RemediationCopyPath       ClassifiedRemediation = "Copy path"
	RemediationCancel         ClassifiedRemediation = "Cancel"
)

var AllClassifiedRemediations = []ClassifiedRemediation{
	RemediationNone,
	RemediationRetry,
	RemediationReload,
	RemediationKeepMine,
	RemediationSkip,
	RemediationSaveToRecreate,
	RemediationCopyPath,
	RemediationCancel,
}

/*
 * Each error category has an explicit set of legal remediation actions.
 * `RemediationNone` is represented by an empty set, while conflicts may offer
 * both external-change actions and a retry against a fresh tab-set revision.
 * The table is the source of truth used by validation and by fail-safe filtering.
 */
var remediationsByCategory = map[ClassifiedErrorCategory][]ClassifiedRemediation{
	ClassifiedNotFound:             {RemediationNone, RemediationSaveToRecreate, RemediationCopyPath},
	ClassifiedPermissionDenied:     {RemediationNone},
	ClassifiedIOFailure:            {RemediationNone, RemediationRetry},
	ClassifiedConflict:             {RemediationNone, RemediationReload, RemediationKeepMine, RemediationSkip, RemediationCancel, RemediationRetry},
	ClassifiedCapacityLimit:        {RemediationNone},
	ClassifiedUnsupportedInput:     {RemediationNone},
	ClassifiedSystemCommandFailure: {RemediationNone, RemediationRetry, RemediationCopyPath},
	ClassifiedPersistenceWarning:   {RemediationNone},
}

// AllowedRemediations reports the remediations the table permits for one
// category. An unknown category allows nothing, so it cannot pass Validate.
func AllowedRemediations(category ClassifiedErrorCategory) []ClassifiedRemediation {
	return remediationsByCategory[category]
}

func remediationAllowedFor(category ClassifiedErrorCategory, remediation ClassifiedRemediation) bool {
	for _, candidate := range remediationsByCategory[category] {
		if candidate == remediation {
			return true
		}
	}
	return false
}

// ClassifiedError is the safe bridge shape shared by file, write, conflict,
// reveal, and persistence outcomes. SafeSubject is normalized at construction
// time and never contains a private path.
type ClassifiedError struct {
	Category    ClassifiedErrorCategory `json:"category"`
	SafeSubject string                  `json:"safeSubject,omitempty"`
	Message     string                  `json:"message"`
	// Remediations is the ordered set of actions offered with this failure, and it
	// is a set because categories may allow several actions: `not-found` for a detached
	// document offers "Save to recreate plus Copy path", and a Reveal
	// `system-command-failure` offers "Retry; a Reveal failure also offers Copy
	// path". A single field could not express either, so those rows were
	// unsatisfiable no matter which value a call site picked. Empty means
	// message-only.
	Remediations []ClassifiedRemediation `json:"remediations,omitempty"`
	DocumentID   string                  `json:"documentId,omitempty"`
	DedupKey     string                  `json:"dedupKey"`
}

// Remediation reports the first offered action, or RemediationNone when the error
// is message-only. It exists for the callers that genuinely handle one action and
// keeps them from indexing a slice that may be empty.
func (classified ClassifiedError) Remediation() ClassifiedRemediation {
	if len(classified.Remediations) == 0 {
		return RemediationNone
	}
	return classified.Remediations[0]
}

// NewClassifiedError builds an error offering at most one action. It is the form
// almost every call site wants, and it stays five-argument so that widening the
// field did not require touching 164 lines that had nothing to say about sets.
func NewClassifiedError(category ClassifiedErrorCategory, subject, message string, remediation ClassifiedRemediation, documentID string) ClassifiedError {
	return NewClassifiedErrorWithRemediations(category, subject, message, []ClassifiedRemediation{remediation}, documentID)
}

// NewClassifiedErrorWithRemediations builds an error offering a set of actions, for
// the three contract rows that specify more than one.
func NewClassifiedErrorWithRemediations(category ClassifiedErrorCategory, subject, message string, remediations []ClassifiedRemediation, documentID string) ClassifiedError {
	if message == "" {
		message = "The operation could not be completed."
	}
	safeSubject := filepath.Base(strings.ReplaceAll(subject, "\\", "/"))
	if safeSubject == "." || safeSubject == "/" {
		safeSubject = ""
	}
	if isInternalIdentifier(safeSubject) {
		safeSubject = genericSubject
	}
	result := ClassifiedError{
		Category:     category,
		SafeSubject:  safeSubject,
		Message:      message,
		Remediations: permittedRemediations(category, remediations),
		DocumentID:   documentID,
	}
	result.DedupKey = result.DeduplicationKey()
	return result
}

/*
 * Fail safe: an action the category forbids is dropped rather than offered to a
 * user it cannot help. Filtering is per member, so a valid action is retained
 * even when a caller also requests an invalid one. `RemediationNone` is not
 * stored; an empty result is the message-only representation.
 */
func permittedRemediations(category ClassifiedErrorCategory, requested []ClassifiedRemediation) []ClassifiedRemediation {
	permitted := make([]ClassifiedRemediation, 0, len(requested))
	for _, remediation := range requested {
		if remediation == RemediationNone || !remediationAllowedFor(category, remediation) {
			continue
		}
		if slices.Contains(permitted, remediation) {
			continue
		}
		permitted = append(permitted, remediation)
	}
	if len(permitted) == 0 {
		return nil
	}
	return permitted
}

// genericSubject is what a classified error shows when no safe label exists. A
// word is a small failure; an internal identifier is a contract violation.
const genericSubject = "document"

/*
 * Reject internal document identifiers before they become user-facing subjects.
 * Callers should pass a safe basename or disambiguated tab label, but this guard
 * protects future call sites that still hold a synthetic document id.
 */
func isInternalIdentifier(subject string) bool {
	const prefix = "doc-"
	if !strings.HasPrefix(subject, prefix) {
		return false
	}
	digits := strings.TrimPrefix(subject, prefix)
	if digits == "" {
		return false
	}
	for _, character := range digits {
		isHex := (character >= '0' && character <= '9') || (character >= 'a' && character <= 'f')
		if !isHex {
			return false
		}
	}
	return true
}

func (classified ClassifiedError) DeduplicationKey() string {
	return fmt.Sprintf("%s:%s", classified.DocumentID, classified.Category)
}

func (classified ClassifiedError) validate() error {
	if !containsClassifiedCategory(classified.Category) {
		return fmt.Errorf("unknown classified error category %q", classified.Category)
	}
	seen := make(map[ClassifiedRemediation]bool, len(classified.Remediations))
	for _, remediation := range classified.Remediations {
		if remediation == RemediationNone {
			return fmt.Errorf("message-only is the empty remediation set, not a member of one")
		}
		if !containsClassifiedRemediation(remediation) {
			return fmt.Errorf("unsupported classified error remediation %q", remediation)
		}
		if !remediationAllowedFor(classified.Category, remediation) {
			return fmt.Errorf("category %q does not permit remediation %q", classified.Category, remediation)
		}
		if seen[remediation] {
			return fmt.Errorf("remediation %q is offered twice", remediation)
		}
		seen[remediation] = true
	}
	if strings.ContainsAny(classified.SafeSubject, `/\\`) {
		return fmt.Errorf("safeSubject must not contain a path separator")
	}
	if classified.DedupKey != "" && classified.DedupKey != classified.DeduplicationKey() {
		return fmt.Errorf("dedupKey does not match documentId and category")
	}
	return nil
}

func containsClassifiedCategory(value ClassifiedErrorCategory) bool {
	for _, candidate := range AllClassifiedErrorCategories {
		if candidate == value {
			return true
		}
	}
	return false
}

func containsClassifiedRemediation(value ClassifiedRemediation) bool {
	for _, candidate := range AllClassifiedRemediations {
		if candidate == value {
			return true
		}
	}
	return false
}
