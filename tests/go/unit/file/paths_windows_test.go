package file_test

import (
	. "github.com/sanyokkua/go_mark_edit/internal/file"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWindowsIdentityForRelativeAndLongPaths(t *testing.T) {
	root := t.TempDir()
	path := root
	for len(path) < 280 {
		path = filepath.Join(path, strings.Repeat("segment", 6))
	}
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatalf("create long path: %v", err)
	}
	filePath := filepath.Join(path, "document.md")
	if err := os.WriteFile(filePath, []byte("content"), 0o644); err != nil {
		t.Fatalf("write long path: %v", err)
	}
	absolute, err := IdentityForExistingPath(filePath)
	if err != nil || absolute.Path != "" || absolute.IsZero() {
		t.Fatalf("long path identity=%+v err=%v", absolute, err)
	}
	t.Chdir(root)
	relative, err := filepath.Rel(root, filePath)
	if err != nil {
		t.Fatal(err)
	}
	viaRelative, err := IdentityForExistingPath(relative)
	if err != nil || !absolute.Equal(viaRelative) {
		t.Fatalf("relative long path identity=%+v err=%v, want %+v", viaRelative, err, absolute)
	}
	version, err := CurrentDiskVersion(relative)
	if err != nil || version.FileIdentity == "" {
		t.Fatalf("relative long path disk version=%+v err=%v", version, err)
	}
}
