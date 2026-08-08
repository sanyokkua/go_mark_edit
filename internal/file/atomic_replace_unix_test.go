//go:build darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package file

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAtomicReplaceUnixSyncsParentDirectory(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "document.md")
	if err := os.WriteFile(target, []byte("before"), 0o640); err != nil {
		t.Fatal(err)
	}
	before := mustCurrentDiskVersion(t, target)
	ops := defaultAtomicReplaceOps()
	var synced string
	ops.syncDir = func(directory string) error {
		synced = directory
		return nil
	}

	if _, err := atomicReplaceWithOps(AtomicReplaceRequest{TargetPath: target, Data: []byte("after"), ExpectedVersion: &before}, ops); err != nil {
		t.Fatalf("atomic replacement: %v", err)
	}
	if synced != root {
		t.Fatalf("synced directory = %q, want %q", synced, root)
	}
}
