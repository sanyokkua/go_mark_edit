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
