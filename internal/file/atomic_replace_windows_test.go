//go:build windows

package file

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestAtomicReplaceWindowsUsesReplaceExistingPort(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "document.md")
	temporary := filepath.Join(root, ".temporary")
	if err := os.WriteFile(target, []byte("before"), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(temporary, []byte("after"), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := replaceAtomicFile(temporary, target); err != nil {
		t.Fatalf("ReplaceFileW port: %v", err)
	}
	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, []byte("after")) {
		t.Fatalf("target bytes = %q", got)
	}
}
