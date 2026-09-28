package file_test

import (
	"os"
	"path/filepath"
	"testing"

	. "github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestAtomicReplaceCreatesMissingTarget(t *testing.T) {
	target := filepath.Join(t.TempDir(), "created.md")
	result, err := AtomicReplace(AtomicReplaceRequest{TargetPath: target, Data: []byte("created\n")})
	if err != nil {
		t.Fatalf("AtomicReplace missing target: %v", err)
	}
	if !result.Committed || !result.Version.Exists {
		t.Fatalf("result = %+v, want committed existing target", result)
	}
	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("read created target: %v", err)
	}
	if string(data) != "created\n" {
		t.Fatalf("created target = %q, want %q", data, "created\n")
	}
}

func TestAtomicReplaceReplacesExistingTarget(t *testing.T) {
	target := filepath.Join(t.TempDir(), "existing.md")
	if err := os.WriteFile(target, []byte("before\n"), 0o600); err != nil {
		t.Fatalf("write initial target: %v", err)
	}
	baseline, err := CurrentDiskVersion(target)
	if err != nil {
		t.Fatalf("read initial target version: %v", err)
	}
	result, err := AtomicReplace(AtomicReplaceRequest{
		TargetPath:      target,
		Data:            []byte("after\n"),
		ExpectedVersion: &baseline,
	})
	if err != nil {
		t.Fatalf("AtomicReplace existing target: %v", err)
	}
	if !result.Committed || !result.Version.Exists {
		t.Fatalf("result = %+v, want committed existing target", result)
	}
	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("read replaced target: %v", err)
	}
	if string(data) != "after\n" {
		t.Fatalf("replaced target = %q, want %q", data, "after\n")
	}
}
