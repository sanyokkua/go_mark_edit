package bridge

import (
	"reflect"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// Classified projects one bridge failure into the legacy classified pointer
// used by non-bound service ports during the request-envelope migration.
// Failure remains the source value; this projection exists only until those
// ports are moved to result envelopes.
func Classified(args ...any) *apperr.ClassifiedError {
	failure, documentID := failureFromArgs(args...)
	return classifiedFromFailure(failure, documentID)
}

// ClassifiedWithID preserves a document identity when a service has already
// resolved the user-safe subject under its model lock.
func ClassifiedWithID(category apperr.ClassifiedErrorCategory, subject, message string, remediation apperr.ClassifiedRemediation, documentID string) *apperr.ClassifiedError {
	return classifiedFromFailure(Fail(category, subject, message, remediation), documentID)
}

// ClassifiedWithRemediations keeps the legacy multi-action projection for the
// two command surfaces whose contract offers more than one recovery action.
// Its base fields still come from Fail, so subject and message safety stay in
// the bridge constructor path.
func ClassifiedWithRemediations(category apperr.ClassifiedErrorCategory, subject, message string, remediations []apperr.ClassifiedRemediation, documentID string) *apperr.ClassifiedError {
	failure := Fail(category, subject, message, apperr.RemediationNone)
	allowed := make(map[apperr.ClassifiedRemediation]bool)
	for _, remediation := range apperr.AllowedRemediations(category) {
		allowed[remediation] = true
	}
	filtered := make([]apperr.ClassifiedRemediation, 0, len(remediations))
	for _, remediation := range remediations {
		if remediation == apperr.RemediationNone || !allowed[remediation] {
			continue
		}
		seen := false
		for _, existing := range filtered {
			if existing == remediation {
				seen = true
				break
			}
		}
		if !seen {
			filtered = append(filtered, remediation)
		}
	}
	classified := apperr.ClassifiedError{
		Category:     failure.Category,
		SafeSubject:  failure.Subject,
		Message:      failure.Message,
		Remediations: filtered,
		DocumentID:   documentID,
	}
	classified.DedupKey = classified.DeduplicationKey()
	return &classified
}

// FailureFromClassified projects the legacy classified value into the shared
// result envelope. It preserves the first remediation in the new singular field;
// callers that still expose the legacy error retain the complete action list.
func FailureFromClassified(classified *apperr.ClassifiedError) apperr.Failure {
	if classified == nil {
		return apperr.Failure{}
	}
	remediation := apperr.RemediationNone
	if len(classified.Remediations) > 0 {
		remediation = classified.Remediations[0]
	}
	return apperr.Failure{
		Category:    classified.Category,
		Subject:     classified.SafeSubject,
		Message:     classified.Message,
		Remediation: remediation,
		ID:          classified.DocumentID,
	}
}

func classifiedFromFailure(failure apperr.Failure, documentID string) *apperr.ClassifiedError {
	classified := apperr.ClassifiedError{
		Category:    failure.Category,
		SafeSubject: failure.Subject,
		Message:     failure.Message,
		DocumentID:  documentID,
	}
	if failure.Remediation != apperr.RemediationNone {
		classified.Remediations = []apperr.ClassifiedRemediation{failure.Remediation}
	}
	classified.DedupKey = classified.DeduplicationKey()
	return &classified
}

// Refused builds a typed refusal result from the shared Failure constructor.
// The variadic shape keeps the migration source-compatible with the former
// result helpers while every result now receives its embedded Failure first.
func Refused[T any](args ...any) (result T) {
	failure, documentID := failureFromArgs(args...)
	return resultFromFailure[T](failure, documentID,
		apperr.OpenStatusRefused,
		apperr.WriteStatusRefused,
		apperr.PathCommandRefused,
		apperr.ConflictStatusRefused,
		apperr.TabTransitionRefused,
	)
}

// Conflict builds a typed write-conflict result from the shared Failure
// constructor. It preserves the write command's distinct conflict status while
// using the same envelope and legacy projection as Refused.
func Conflict[T any](args ...any) (result T) {
	failure, documentID := failureFromArgs(args...)
	return resultFromFailure[T](failure, documentID, apperr.WriteStatusConflict)
}

// FromClassified projects an already-classified domain error into a typed
// envelope without discarding its complete legacy remediation list.
func FromClassified[T any](classified *apperr.ClassifiedError, statuses ...any) (result T) {
	if classified == nil {
		return result
	}
	setFailure(&result, FailureFromClassified(classified))
	value := reflect.ValueOf(&result).Elem()
	setLegacyError(value, classified)
	for _, status := range statuses {
		setStatus(value, status)
	}
	setDocumentID(value, classified.DocumentID)
	return result
}

func resultFromFailure[T any](failure apperr.Failure, documentID string, statuses ...any) (result T) {
	setFailure(&result, failure)
	setLegacyError(reflect.ValueOf(&result).Elem(), classifiedFromFailure(failure, documentID))

	value := reflect.ValueOf(&result).Elem()
	for _, status := range statuses {
		setStatus(value, status)
	}
	setDocumentID(value, documentID)
	return result
}

func setDocumentID(value reflect.Value, documentID string) {
	if documentID == "" || !value.IsValid() || value.Kind() != reflect.Struct {
		return
	}
	field := value.FieldByName("DocumentID")
	if field.IsValid() && field.CanSet() && field.Kind() == reflect.String {
		field.SetString(documentID)
	}
}

func failureFromArgs(args ...any) (apperr.Failure, string) {
	category := apperr.ClassifiedInternal
	subject := "document"
	message := "The operation could not be completed."
	remediation := apperr.RemediationNone
	documentID := ""

	strings := make([]string, 0, len(args))
	for _, arg := range args {
		switch value := arg.(type) {
		case apperr.ClassifiedErrorCategory:
			category = value
		case apperr.ClassifiedRemediation:
			remediation = value
		case string:
			strings = append(strings, value)
		}
	}

	switch len(args) {
	case 2:
		if len(strings) == 1 {
			message = strings[0]
			subject = "Save As target"
		}
	case 3:
		if len(strings) == 1 {
			message = strings[0]
			subject = "Untitled"
		}
	case 4:
		if len(strings) == 2 {
			subject = strings[0]
			message = strings[1]
			if _, firstIsCategory := args[0].(apperr.ClassifiedErrorCategory); firstIsCategory {
				documentID = subject
			}
		}
	case 5:
		if len(strings) == 3 {
			if _, firstIsCategory := args[0].(apperr.ClassifiedErrorCategory); firstIsCategory {
				documentID = strings[0]
				subject = strings[1]
				message = strings[2]
			} else {
				subject = strings[0]
				documentID = strings[1]
				message = strings[2]
			}
		}
	}

	return Fail(category, subject, message, remediation), documentID
}
