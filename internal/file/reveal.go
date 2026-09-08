package file

import "errors"

// ErrRevealUnavailable means the host accepted the request type but cannot
// select this exact file; the containing-folder fallback may still be absent.
var ErrRevealUnavailable = errors.New("file reveal unavailable")

// RevealPort asks the host file manager to reveal an exact path where supported,
// or its containing directory as the platform fallback.
type RevealPort interface {
	Reveal(path string) error
}

// RevealPortFunc adapts a function to RevealPort in tests and hosts.
type RevealPortFunc func(string) error

func (port RevealPortFunc) Reveal(path string) error {
	return port(path)
}

// NewPlatformRevealPort returns the platform-native reveal implementation.
func NewPlatformRevealPort() RevealPort {
	return platformRevealPort{}
}
