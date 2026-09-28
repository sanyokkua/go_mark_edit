// Package apperr defines the safe, Wails-serializable error contract.
package apperr

import "path/filepath"

// ErrorCode classifies errors crossing the Wails bridge.
type ErrorCode string

const (
	CodeValidation  ErrorCode = "validation"
	CodeNotFound    ErrorCode = "not_found"
	CodeIO          ErrorCode = "io"
	CodePermission  ErrorCode = "permission"
	CodeBusy        ErrorCode = "busy"
	CodeTimeout     ErrorCode = "timeout"
	CodeCancelled   ErrorCode = "cancelled"
	CodeUnsupported ErrorCode = "unsupported"
	CodeInternal    ErrorCode = "internal"
)

// AllErrorCodes maps every ErrorCode value to its TypeScript enum member name.
var AllErrorCodes = []struct {
	Value  ErrorCode
	TSName string
}{
	{CodeValidation, "Validation"},
	{CodeNotFound, "NotFound"},
	{CodeIO, "IO"},
	{CodePermission, "Permission"},
	{CodeBusy, "Busy"},
	{CodeTimeout, "Timeout"},
	{CodeCancelled, "Cancelled"},
	{CodeUnsupported, "Unsupported"},
	{CodeInternal, "Internal"},
}

// AppError is the classified backend error. Its cause stays local and is never
// serialized to the frontend.
type AppError struct {
	Code      ErrorCode
	Title     string
	Message   string
	Details   map[string]string
	Retryable bool
	cause     error
}

// Error implements error.
func (err *AppError) Error() string {
	return err.Message
}

// Unwrap exposes the local cause to Go error inspection without serializing it.
func (err *AppError) Unwrap() error {
	return err.cause
}

// Validation reports a rejected user input. Its arguments must be safe to show
// in the UI.
func Validation(field, expected, got string) *AppError {
	return &AppError{
		Code:    CodeValidation,
		Title:   "Invalid input",
		Message: "A value needs to be corrected.",
		Details: map[string]string{
			"field":    field,
			"expected": expected,
			"got":      got,
		},
	}
}

// NotFound reports a missing file or record without exposing its full path.
func NotFound(path string) *AppError {
	return &AppError{
		Code:    CodeNotFound,
		Title:   "Not found",
		Message: "The requested item could not be found.",
		Details: map[string]string{
			"name": filepath.Base(path),
		},
	}
}

// IO reports a local read or write failure.
func IO(operation string, cause error) *AppError {
	return &AppError{
		Code:    CodeIO,
		Title:   "File operation failed",
		Message: "The file operation could not be completed.",
		Details: map[string]string{
			"operation": operation,
		},
		Retryable: true,
		cause:     cause,
	}
}

// Busy reports that an exclusive operation is already running.
func Busy() *AppError {
	return &AppError{
		Code:    CodeBusy,
		Title:   "Operation in progress",
		Message: "Another operation is already in progress.",
	}
}

// Unsupported reports an unavailable operation or unmet precondition.
func Unsupported(operation string) *AppError {
	return &AppError{
		Code:    CodeUnsupported,
		Title:   "Operation unavailable",
		Message: "This operation is not available.",
		Details: map[string]string{
			"operation": operation,
		},
	}
}

// Internal reports an unexpected error without exposing its cause to the UI.
func Internal(cause error) *AppError {
	return &AppError{
		Code:      CodeInternal,
		Title:     "Something went wrong",
		Message:   "An unexpected error occurred.",
		Retryable: true,
		cause:     cause,
	}
}
