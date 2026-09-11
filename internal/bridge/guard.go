package bridge

import (
	"reflect"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

var failureType = reflect.TypeFor[apperr.Failure]()

// Guard is the one panic recovery used at a bound handler boundary. It is
// intended for a named result: `defer bridge.Guard(&result)`.
func Guard(result any) {
	if recover() == nil {
		return
	}
	failure := Fail(
		apperr.ClassifiedInternal,
		"bridge",
		"The operation could not be completed.",
		apperr.RemediationNone,
	)
	setFailure(result, failure)
	setLegacyEnvelope(result)
}

func runGuarded(result any, run func()) {
	defer Guard(result)
	run()
}

func setFailure(target any, failure apperr.Failure) bool {
	value := reflect.ValueOf(target)
	if !value.IsValid() || value.Kind() != reflect.Pointer || value.IsNil() {
		return false
	}
	value = value.Elem()
	if value.Kind() != reflect.Struct {
		return false
	}
	field := value.FieldByName("Failure")
	if !field.IsValid() || !field.CanSet() || field.Type() != failureType {
		return false
	}
	field.Set(reflect.ValueOf(failure))
	return true
}

func withRequestID[T any](outcome T, requestID string) T {
	value := reflect.ValueOf(&outcome).Elem()
	if value.Kind() != reflect.Struct {
		return outcome
	}
	field := value.FieldByName("Failure")
	if !field.IsValid() || !field.CanAddr() || field.Type() != failureType {
		return outcome
	}
	failure := field.Interface().(apperr.Failure)
	if failure.Category == "" && failure.Subject == "" && failure.Message == "" && failure.Remediation == apperr.RemediationNone {
		return outcome
	}
	if failure.ID == "" {
		failure.ID = requestID
		field.Set(reflect.ValueOf(failure))
	}
	return outcome
}

// setLegacyEnvelope keeps older callers source-compatible while handlers are
// migrated to the embedded Failure field. It is deliberately bridge-local;
// new handlers read Failure and do not construct either legacy error shape.
func setLegacyEnvelope(target any) {
	value := reflect.ValueOf(target)
	if !value.IsValid() || value.Kind() != reflect.Pointer || value.IsNil() {
		return
	}
	value = value.Elem()
	if value.Kind() != reflect.Struct {
		return
	}

	setLegacyError(value, &apperr.ClassifiedError{
		Category:    apperr.ClassifiedSystemCommandFailure,
		SafeSubject: "bridge",
		Message:     "The operation could not be completed.",
		Remediations: []apperr.ClassifiedRemediation{
			apperr.RemediationRetry,
		},
		DedupKey: "bridge:" + string(apperr.ClassifiedSystemCommandFailure),
	})

	setStatus(value, apperr.OpenStatusRefused)
	setStatus(value, apperr.WriteStatusRefused)
	setStatus(value, apperr.PathCommandRefused)
	setStatus(value, apperr.ConflictStatusRefused)
	setStatus(value, apperr.TabTransitionRefused)
}

func setLegacyError(value reflect.Value, classified *apperr.ClassifiedError) {
	if !value.IsValid() || value.Kind() != reflect.Struct {
		return
	}
	errorField := value.FieldByName("Error")
	if errorField.IsValid() && errorField.CanSet() && errorField.Kind() == reflect.Pointer {
		classifiedType := reflect.TypeFor[*apperr.ClassifiedError]()
		if errorField.Type() == reflect.TypeFor[*apperr.WireError]() {
			errorField.Set(reflect.ValueOf(&apperr.WireError{
				Code:      apperr.CodeInternal,
				Title:     "Something went wrong",
				Message:   "An unexpected error occurred.",
				Retryable: true,
			}))
		} else if errorField.Type() == classifiedType {
			errorField.Set(reflect.ValueOf(classified))
		}
	}
}

func setStatus(value reflect.Value, status any) {
	if !value.IsValid() || value.Kind() != reflect.Struct {
		return
	}
	field := value.FieldByName("Status")
	if !field.IsValid() || !field.CanSet() {
		return
	}
	statusValue := reflect.ValueOf(status)
	if statusValue.Type() == field.Type() {
		field.Set(statusValue)
	}
}
