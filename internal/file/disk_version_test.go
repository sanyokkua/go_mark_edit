package file

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestDiskVersionEquality(t *testing.T) {
	base := DiskVersion{
		Exists:           true,
		Size:             17,
		ModifiedUnixNano: 123456789,
		Mode:             0o640,
		FileIdentity:     "file:4:19",
	}
	tests := []struct {
		name  string
		other DiskVersion
		equal bool
	}{
		{name: "same", other: base, equal: true},
		{name: "existence", other: DiskVersion{Size: 17, ModifiedUnixNano: 123456789, Mode: 0o640, FileIdentity: "file:4:19"}},
		{name: "size", other: DiskVersion{Exists: true, Size: 18, ModifiedUnixNano: 123456789, Mode: 0o640, FileIdentity: "file:4:19"}},
		{name: "mtime nanoseconds", other: DiskVersion{Exists: true, Size: 17, ModifiedUnixNano: 123456790, Mode: 0o640, FileIdentity: "file:4:19"}},
		{name: "mode", other: DiskVersion{Exists: true, Size: 17, ModifiedUnixNano: 123456789, Mode: 0o600, FileIdentity: "file:4:19"}},
		{name: "replacement identity", other: DiskVersion{Exists: true, Size: 17, ModifiedUnixNano: 123456789, Mode: 0o640, FileIdentity: "file:4:20"}},
		{name: "optional identity absent", other: DiskVersion{Exists: true, Size: 17, ModifiedUnixNano: 123456789, Mode: 0o640}, equal: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := base.Equal(test.other); got != test.equal {
				t.Fatalf("DiskVersion.Equal(%+v) = %t, want %t", test.other, got, test.equal)
			}
		})
	}
}

func TestDiskVersionFromPathTable(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := filepath.Join(root, "document.md")
	missing, err := CurrentDiskVersion(path)
	if err != nil {
		t.Fatalf("stat missing path: %v", err)
	}
	if missing.Exists {
		t.Fatalf("missing version = %+v, want absent", missing)
	}

	if err := os.WriteFile(path, []byte("content"), 0o640); err != nil {
		t.Fatalf("write document: %v", err)
	}
	mtime := time.Unix(1_700_000_000, 123_456_789)
	if err := os.Chtimes(path, mtime, mtime); err != nil {
		t.Fatalf("set nanosecond mtime: %v", err)
	}
	present, err := CurrentDiskVersion(path)
	if err != nil {
		t.Fatalf("stat present path: %v", err)
	}
	if !present.Exists {
		t.Fatal("present version is absent")
	}
	if present.Size != int64(len("content")) {
		t.Fatalf("size = %d, want %d", present.Size, len("content"))
	}
	if present.ModifiedUnixNano != mtime.UnixNano() {
		t.Fatalf("modifiedUnixNano = %d, want %d", present.ModifiedUnixNano, mtime.UnixNano())
	}
	if present.Mode != 0o640 {
		t.Fatalf("mode = %04o, want 0640", present.Mode)
	}

	if err := os.Chmod(path, 0o600); err != nil {
		t.Fatalf("change mode: %v", err)
	}
	modeChanged, err := CurrentDiskVersion(path)
	if err != nil {
		t.Fatalf("stat mode-changed path: %v", err)
	}
	if present.Equal(modeChanged) {
		t.Fatalf("mode change was not detected: before=%+v after=%+v", present, modeChanged)
	}
	if modeChanged.Mode != 0o600 {
		t.Fatalf("changed mode = %04o, want 0600", modeChanged.Mode)
	}

	if err := os.Remove(path); err != nil {
		t.Fatalf("remove document: %v", err)
	}
	absent, err := CurrentDiskVersion(path)
	if err != nil {
		t.Fatalf("stat removed path: %v", err)
	}
	if absent.Exists {
		t.Fatalf("removed version = %+v, want absent", absent)
	}
}

func TestDiskVersionReplacementIdentity(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := filepath.Join(root, "document.md")
	replacement := filepath.Join(root, "replacement.md")
	if err := os.WriteFile(path, []byte("same"), 0o640); err != nil {
		t.Fatalf("write original: %v", err)
	}
	first, err := CurrentDiskVersion(path)
	if err != nil {
		t.Fatalf("stat original: %v", err)
	}
	if first.FileIdentity == "" {
		t.Skip("host does not expose a portable file identity")
	}
	if err := os.WriteFile(replacement, []byte("same"), 0o640); err != nil {
		t.Fatalf("write replacement: %v", err)
	}
	if err := os.Chtimes(replacement, time.Unix(1_700_000_000, 123_456_789), time.Unix(1_700_000_000, 123_456_789)); err != nil {
		t.Fatalf("set replacement mtime: %v", err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove original: %v", err)
	}
	if err := os.Rename(replacement, path); err != nil {
		t.Fatalf("replace document: %v", err)
	}
	second, err := CurrentDiskVersion(path)
	if err != nil {
		t.Fatalf("stat replacement: %v", err)
	}
	if first.FileIdentity == second.FileIdentity {
		t.Fatalf("replacement identity = %q, want a different identity from %q", second.FileIdentity, first.FileIdentity)
	}
	if first.Equal(second) {
		t.Fatalf("replacement was considered equal: before=%+v after=%+v", first, second)
	}
}

func TestCurrentDiskVersionRejectsInvalidPath(t *testing.T) {
	if _, err := CurrentDiskVersion(""); err == nil {
		t.Fatal("empty path should return an error")
	}
}
