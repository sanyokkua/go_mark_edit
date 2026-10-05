package file_test

import (
	. "github.com/sanyokkua/go_mark_edit/internal/file"
	"os"
	"path/filepath"
	"runtime"
	"strings"
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
	observedInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat document after setting mtime: %v", err)
	}
	if present.ModifiedUnixNano != observedInfo.ModTime().UnixNano() {
		t.Fatalf("modifiedUnixNano = %d, want filesystem-reported %d", present.ModifiedUnixNano, observedInfo.ModTime().UnixNano())
	}
	if present.Mode != observedInfo.Mode().Perm() || present.Mode&0o200 == 0 {
		t.Fatalf("mode = %04o, want filesystem-reported writable mode %04o", present.Mode, observedInfo.Mode().Perm())
	}

	if err := os.Chmod(path, 0o400); err != nil {
		t.Fatalf("change mode: %v", err)
	}
	modeChanged, err := CurrentDiskVersion(path)
	if err != nil {
		t.Fatalf("stat mode-changed path: %v", err)
	}
	if present.Equal(modeChanged) {
		t.Fatalf("mode change was not detected: before=%+v after=%+v", present, modeChanged)
	}
	changedInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat document after chmod: %v", err)
	}
	if modeChanged.Mode != changedInfo.Mode().Perm() || modeChanged.Mode == present.Mode {
		t.Fatalf("changed mode = %04o, want filesystem-reported mode different from %04o", modeChanged.Mode, present.Mode)
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
	mtime := time.Unix(1_700_000_000, 0)
	if err := os.Chtimes(path, mtime, mtime); err != nil {
		t.Fatalf("set original mtime: %v", err)
	}
	first, err := CurrentDiskVersion(path)
	if err != nil {
		t.Fatalf("stat original: %v", err)
	}
	if first.FileIdentity == "" && runtime.GOOS != "windows" {
		t.Skip("host does not expose a portable file identity")
	}
	if first.FileIdentity == "" {
		t.Fatal("Windows existing file has empty disk identity")
	}
	if err := os.WriteFile(replacement, []byte("same"), 0o640); err != nil {
		t.Fatalf("write replacement: %v", err)
	}
	if err := os.Chtimes(replacement, mtime, mtime); err != nil {
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
	if second.Size != first.Size || second.ModifiedUnixNano != first.ModifiedUnixNano || second.Mode != first.Mode {
		t.Fatalf("replacement metadata differs: before=%+v after=%+v", first, second)
	}
	if runtime.GOOS == "windows" && !strings.HasPrefix(second.FileIdentity, "volume:") {
		t.Fatalf("Windows identity = %q, want volume/index", second.FileIdentity)
	}
	if first.FileIdentity == second.FileIdentity {
		t.Fatalf("replacement identity = %q, want a different identity from %q", second.FileIdentity, first.FileIdentity)
	}
	if first.Equal(second) {
		t.Fatalf("replacement was considered equal: before=%+v after=%+v", first, second)
	}
}

func TestDiskVersionHardLinksShareIdentity(t *testing.T) {
	root := t.TempDir()
	firstPath := filepath.Join(root, "first.md")
	secondPath := filepath.Join(root, "second.md")
	if err := os.WriteFile(firstPath, []byte("content"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(firstPath, secondPath); err != nil {
		t.Fatalf("create hard link: %v", err)
	}
	first, err := CurrentDiskVersion(firstPath)
	if err != nil {
		t.Fatal(err)
	}
	second, err := CurrentDiskVersion(secondPath)
	if err != nil {
		t.Fatal(err)
	}
	if first.FileIdentity == "" || first.FileIdentity != second.FileIdentity || !first.Equal(second) {
		t.Fatalf("hard-link disk versions differ: first=%+v second=%+v", first, second)
	}
}

func TestCurrentDiskVersionRejectsInvalidPath(t *testing.T) {
	if _, err := CurrentDiskVersion(""); err == nil {
		t.Fatal("empty path should return an error")
	}
}
