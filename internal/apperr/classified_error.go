package apperr

import (
	"fmt"
	"path/filepath"
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
 * The contract's one-remediation-set-per-category table, made enforceable.
 *
 * `Validate` checked only that a remediation was in the *global* vocabulary, so
 * any category could carry any action and nothing noticed. That was invisible
 * while no remediation ever rendered; T116 wired the control, and a
 * `permission-denied` save began offering a Retry that cannot succeed — the very
 * reason the contract makes that row message-only.
 *
 * `RemediationNone` is allowed everywhere: message-only is always a valid outcome.
 *
 * `ClassifiedConflict` allows `RemediationRetry` because the contract's conflict
 * row says so. The row covers two collisions, not one: an *external change* — whose
 * actions are Reload from disk, Keep mine, Skip, and Cancel for a read-only
 * document — and a *stale tab-set or stale revision*, where re-issuing the command
 * against the fresh revision is the only action that can succeed.
 *
 * That second half was added by T159. Until then the row enumerated only the
 * external-change actions while this codebase already classified stale-revision
 * refusals as `conflict`, and this comment carried the disagreement as a filed
 * question. The owner amended the row rather than introducing a ninth category,
 * so the table below now matches the specification instead of diverging from it.
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

// AllowedRemediations reports the remediations the contract permits for one
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
	Remediation ClassifiedRemediation   `json:"remediation,omitempty"`
	DocumentID  string                  `json:"documentId,omitempty"`
	DedupKey    string                  `json:"dedupKey"`
}

func NewClassifiedError(category ClassifiedErrorCategory, subject, message string, remediation ClassifiedRemediation, documentID string) ClassifiedError {
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
	// Fail safe, in the same shape as the subject guard above: a remediation the
	// category forbids degrades to message-only rather than offering the user an
	// action that cannot work. Validate still reports it, so a wrong call site is
	// caught by a test rather than hidden by this coercion.
	if !remediationAllowedFor(category, remediation) {
		remediation = RemediationNone
	}
	result := ClassifiedError{
		Category:    category,
		SafeSubject: safeSubject,
		Message:     message,
		Remediation: remediation,
		DocumentID:  documentID,
	}
	result.DedupKey = result.DeduplicationKey()
	return result
}

// genericSubject is what a classified error shows when no safe label exists. A
// word is a small failure; an internal identifier is a contract violation.
const genericSubject = "document"

/*
 * The last line of defence for "name only the safe basename or the disambiguated
 * tab label".
 *
 * Callers should pass a real label, and the write and external-change paths now do.
 * But `mintDocumentID` produces every synthetic id in the application — documents,
 * close plans and open reservations alike — and `filepath.Base` is a no-op on one,
 * so any of the ~46 helper call sites could put `doc-0000000000000003` in front of a
 * user. It stayed hidden while `localizedErrorCopy` overwrote the title; T117 made
 * the backend's subject the rendered title, and the leak became visible.
 *
 * Rejecting the shape here means a future call site cannot reintroduce it, which a
 * per-call-site fix alone would not prevent.
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

func (classified ClassifiedError) Validate() error {
	if !containsClassifiedCategory(classified.Category) {
		return fmt.Errorf("unknown classified error category %q", classified.Category)
	}
	if !containsClassifiedRemediation(classified.Remediation) {
		return fmt.Errorf("unsupported classified error remediation %q", classified.Remediation)
	}
	if !remediationAllowedFor(classified.Category, classified.Remediation) {
		return fmt.Errorf("category %q does not permit remediation %q", classified.Category, classified.Remediation)
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
