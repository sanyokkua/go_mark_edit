// Package bridge owns the small protocol shared by Wails-bound handlers.
package bridge

import (
	"errors"
	"strings"
)

// Request identifies one logical bridge command. A retry keeps the same ID so
// the backend can return the original outcome instead of repeating side
// effects.
type Request struct {
	ID string `json:"id"`
}

// Validate reports whether the request carries the identity required by the
// outcome cache.
func (request Request) Validate() error {
	if strings.TrimSpace(request.ID) == "" {
		return errors.New("bridge request id is required")
	}
	return nil
}

// IsValid is the allocation-free form used on the handler hot path.
func (request Request) IsValid() bool {
	return request.Validate() == nil
}

// ValidateRequest is the package-level form for callers that do not need a
// method value.
func ValidateRequest(request Request) error {
	return request.Validate()
}
