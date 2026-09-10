package apperr

import (
	"errors"
	"strings"

	"github.com/rs/zerolog"
)

// WireError is the curated error shape sent over the Wails bridge.
type WireError struct {
	Code      ErrorCode         `json:"code"`
	Title     string            `json:"title"`
	Message   string            `json:"message"`
	Details   map[string]string `json:"details,omitempty"`
	Retryable bool              `json:"retryable"`

	// Classified fields are populated for asynchronous domain failures. The
	// legacy fields remain populated as well so existing notification consumers
	// can accept state:error while the category/remediation contract crosses the
	// bridge without a second event shape.
	Category     ClassifiedErrorCategory `json:"category,omitempty"`
	SafeSubject  string                  `json:"safeSubject,omitempty"`
	Remediation  ClassifiedRemediation   `json:"remediation,omitempty"`
	Remediations []ClassifiedRemediation `json:"remediations,omitempty"`
	DocumentID   string                  `json:"documentId,omitempty"`
	DedupKey     string                  `json:"dedupKey,omitempty"`
}

// ToWire logs an error once at the handler boundary and converts it to a safe
// bridge payload. Nil and unclassified errors become internal errors.
func ToWire(log zerolog.Logger, err error) WireError {
	appError := classifiedError(err)
	logAppError(log, appError, err)

	return WireError{
		Code:      appError.Code,
		Title:     appError.Title,
		Message:   appError.Message,
		Details:   appError.Details,
		Retryable: appError.Retryable,
	}
}

// ClassifiedToWire projects a cause-free classified error onto the event
// payload. The legacy code fields are retained for consumers that still route
// all WireError values through the generic notification catalogue; the
// classified fields are the source of truth for category and remediation.
func ClassifiedToWire(classified *ClassifiedError) WireError {
	if classified == nil {
		return WireError{}
	}

	details := make(map[string]string)
	if classified.SafeSubject != "" {
		details["subject"] = classified.SafeSubject
	}
	if classified.DedupKey != "" {
		details["dedupKey"] = classified.DedupKey
	}
	return WireError{
		Code:         wireCodeForCategory(classified.Category),
		Title:        classified.SafeSubject,
		Message:      classified.Message,
		Details:      details,
		Retryable:    classifiedHasRemediation(classified, RemediationRetry),
		Category:     classified.Category,
		SafeSubject:  classified.SafeSubject,
		Remediation:  classified.Remediation(),
		Remediations: append([]ClassifiedRemediation(nil), classified.Remediations...),
		DocumentID:   classified.DocumentID,
		DedupKey:     classified.DedupKey,
	}
}

func wireCodeForCategory(category ClassifiedErrorCategory) ErrorCode {
	switch category {
	case ClassifiedNotFound:
		return CodeNotFound
	case ClassifiedPermissionDenied:
		return CodePermission
	case ClassifiedUnsupportedInput:
		return CodeUnsupported
	case ClassifiedSystemCommandFailure:
		return CodeInternal
	default:
		return CodeIO
	}
}

func classifiedHasRemediation(classified *ClassifiedError, wanted ClassifiedRemediation) bool {
	for _, remediation := range classified.Remediations {
		if remediation == wanted {
			return true
		}
	}
	return false
}

func classifiedError(err error) *AppError {
	var appError *AppError
	if errors.As(err, &appError) && appError != nil {
		return appError
	}

	return Internal(err)
}

func logAppError(log zerolog.Logger, appError *AppError, original error) {
	event := log.Error().
		Str("code", string(appError.Code)).
		Bool("retryable", appError.Retryable)
	if original != nil {
		event.Str("error_chain", formatErrorChain(original))
	}
	event.Msg(appError.Title)
}

func formatErrorChain(err error) string {
	var messages []string
	for err != nil {
		messages = append(messages, err.Error())
		err = errors.Unwrap(err)
	}

	return strings.Join(messages, " -> ")
}
