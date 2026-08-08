package file

import (
	"errors"
	"testing"
)

func TestClipboardWriterFuncForwardsExactTextAndFailure(t *testing.T) {
	want := errors.New("clipboard unavailable")
	var got string
	writer := ClipboardWriterFunc(func(text string) error {
		got = text
		return want
	})
	if err := writer.WriteText("/private/notes.md"); !errors.Is(err, want) {
		t.Fatalf("WriteText error = %v, want %v", err, want)
	}
	if got != "/private/notes.md" {
		t.Fatalf("WriteText text = %q, want exact path", got)
	}
}
