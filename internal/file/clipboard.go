package file

// ClipboardWriter is the narrow composition-root port used by CopyPath.
// The appmodel owns classification; this port only reports the host result.
type ClipboardWriter interface {
	WriteText(text string) error
}

// ClipboardWriterFunc adapts a function to ClipboardWriter in tests and hosts.
type ClipboardWriterFunc func(string) error

func (writer ClipboardWriterFunc) WriteText(text string) error {
	return writer(text)
}
