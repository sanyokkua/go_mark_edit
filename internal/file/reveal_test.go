package file

import (
	"errors"
	"testing"
)

func TestRevealPortFuncForwardsExactPathAndFailure(t *testing.T) {
	want := errors.New("reveal unavailable")
	var got string
	port := RevealPortFunc(func(path string) error {
		got = path
		return want
	})
	if err := port.Reveal("/private/notes.md"); !errors.Is(err, want) {
		t.Fatalf("Reveal error = %v, want %v", err, want)
	}
	if got != "/private/notes.md" {
		t.Fatalf("Reveal path = %q, want exact path", got)
	}
}

func TestPlatformRevealPortIsAvailableOnSupportedHosts(t *testing.T) {
	if NewPlatformRevealPort() == nil {
		t.Fatal("NewPlatformRevealPort returned nil")
	}
}
