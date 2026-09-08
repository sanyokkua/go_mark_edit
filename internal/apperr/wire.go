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
