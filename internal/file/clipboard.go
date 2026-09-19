package file

import "errors"

// ErrClipboardUnavailable means the host exposes no clipboard mechanism this
// build can reach. CopyPath classifies it like any other host failure; it is a
// distinct value so a caller can tell "no clipboard here" from "the write failed".
var ErrClipboardUnavailable = errors.New("host clipboard unavailable")

// ClipboardWriter is the narrow composition-root port used by CopyPath.
// The appmodel owns classification; this port only reports the host result.
type ClipboardWriter interface {
	WriteText(text string) error
}

// NewPlatformClipboardWriter returns the platform-native clipboard implementation.
//
// It shells out rather than calling wails runtime.ClipboardSetText deliberately.
// The clipboard is needed by the document model, which must not import Wails, and
// a Wails-backed writer would also need the lifecycle context — which does not
// exist yet when the composition root builds the dependency graph. Resolving that
// would mean handing the port in from main.go, i.e. exactly the optional
// injection that let both host ports ship nil. Keeping the implementation here
// lets the composition root wire it unconditionally, so no host can forget it.
func NewPlatformClipboardWriter() ClipboardWriter {
	return platformClipboardWriter{}
}
