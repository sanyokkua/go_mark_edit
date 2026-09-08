package file

import "testing"

// Proves: FR-FT-037 — only the clause that a host clipboard implementation
// exists for Copy path to reach. What it writes is proved by the unix probe test
// and by the appmodel CopyPath tests.
func TestNewPlatformClipboardWriterReturnsAnImplementation(t *testing.T) {
	if NewPlatformClipboardWriter() == nil {
		t.Fatal("NewPlatformClipboardWriter returned nil")
	}
}
