package file_test

import (
	"os"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestWriteProtectedClassificationPrecedenceAndNormalization(t *testing.T) {
	cases := []struct {
		name, input string
		capability  file.ReadCapability
		content     string
	}{
		{"safe CRLF", "one\r\ntwo\r\n", file.ReadCapability("write-protected-read-only"), "one\ntwo\n"},
		{"unsafe", "one\rtwo", file.CapabilityUnsafeReadOnly, "one\rtwo"},
		{"large", strings.Repeat("x", int(file.MaxWritableDocumentBytes)+1), file.CapabilityLargeReadOnly, strings.Repeat("x", int(file.MaxWritableDocumentBytes)+1)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := file.ClassifyDocumentBytes([]byte(tc.input), os.FileMode(0444))
			if got.Capability != tc.capability || got.Content != tc.content {
				t.Fatalf("capability = %q, content mismatch = %v", got.Capability, got.Content != tc.content)
			}
		})
	}
}
