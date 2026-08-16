//go:build darwin || linux

package file

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// Proves: FR-FT-037 — the clause that Copy path reports a host failure rather
// than claiming success when the host exposes no clipboard mechanism.
func TestPlatformClipboardWriterReportsUnavailableWhenNoHostToolExists(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	err := platformClipboardWriter{}.WriteText("/tmp/notes.md")

	if !errors.Is(err, ErrClipboardUnavailable) {
		t.Fatalf("WriteText with no clipboard tool on PATH = %v, want ErrClipboardUnavailable", err)
	}
}

// Proves: FR-FT-037 — the clause that Copy path copies the exact canonical path.
// A stub standing in for the host tool records what the writer actually piped to
// it, so this proves the exact bytes rather than only that the command ran.
func TestPlatformClipboardWriterPipesTheExactPathToTheHostTool(t *testing.T) {
	directory := t.TempDir()
	captured := filepath.Join(directory, "captured.txt")
	// The first candidate is pbcopy, so a stub named pbcopy is the one the probe
	// selects on either platform.
	// /bin/cat by absolute path: PATH is stripped to the stub directory below, so
	// the stub cannot resolve its own helpers by name.
	stub := "#!/bin/sh\n/bin/cat > " + captured + "\n"
	if err := os.WriteFile(filepath.Join(directory, "pbcopy"), []byte(stub), 0o755); err != nil {
		t.Fatalf("write clipboard stub: %v", err)
	}
	t.Setenv("PATH", directory)

	const path = "/Users/someone/Documents/notes with spaces & ünïcode.md"
	if err := (platformClipboardWriter{}).WriteText(path); err != nil {
		t.Fatalf("WriteText: %v", err)
	}

	written, err := os.ReadFile(captured)
	if err != nil {
		t.Fatalf("read captured clipboard text: %v", err)
	}
	if string(written) != path {
		t.Fatalf("clipboard received %q, want the exact path %q", string(written), path)
	}
}
