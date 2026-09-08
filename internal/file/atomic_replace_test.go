package file

import (
	"bytes"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

type atomicReplaceFailure struct {
	name      string
	category  apperr.ClassifiedErrorCategory
	configure func(*atomicReplaceOps, *atomicReplaceTestTemp, DiskVersion)
}

type atomicReplaceTestTemp struct {
	name     string
	data     bytes.Buffer
	writeErr error
	chmodErr error
	syncErr  error
	closeErr error
}

func (temp *atomicReplaceTestTemp) Name() string { return temp.name }

func (temp *atomicReplaceTestTemp) Write(data []byte) (int, error) {
	if temp.writeErr != nil {
		return 0, temp.writeErr
	}
	return temp.data.Write(data)
}

func (temp *atomicReplaceTestTemp) Chmod(fs.FileMode) error { return temp.chmodErr }
func (temp *atomicReplaceTestTemp) Sync() error             { return temp.syncErr }
func (temp *atomicReplaceTestTemp) Close() error            { return temp.closeErr }

// Proves: FR-FT-009
func TestAtomicReplace(t *testing.T) {
	t.Run("existing target preserves bytes and mode", func(t *testing.T) {
		root := t.TempDir()
		target := filepath.Join(root, "document.md")
		if err := os.WriteFile(target, []byte("before\r\n"), 0o640); err != nil {
			t.Fatal(err)
		}
		before, err := CurrentDiskVersion(target)
		if err != nil {
			t.Fatal(err)
		}

		result, err := AtomicReplace(AtomicReplaceRequest{
			TargetPath:      target,
			Data:            []byte("after\r\n"),
			ExpectedVersion: &before,
		})
		if err != nil {
			t.Fatalf("AtomicReplace: %v", err)
		}
		if !result.Committed {
			t.Fatalf("result = %+v, want committed", result)
		}
		got, err := os.ReadFile(target)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(got, []byte("after\r\n")) {
			t.Fatalf("target bytes = %q", got)
		}
		info, err := os.Stat(target)
		if err != nil {
			t.Fatal(err)
		}
		if gotMode := info.Mode().Perm(); gotMode != 0o640 {
			t.Fatalf("target mode = %04o, want 0640", gotMode)
		}
		entries, err := os.ReadDir(root)
		if err != nil {
			t.Fatal(err)
		}
		if len(entries) != 1 || entries[0].Name() != "document.md" {
			t.Fatalf("same-directory artifacts = %+v", entries)
		}
		if !result.Version.Equal(mustCurrentDiskVersion(t, target)) {
			t.Fatalf("result version = %+v, current = %+v", result.Version, mustCurrentDiskVersion(t, target))
		}
	})

	t.Run("new target uses normal creation semantics", func(t *testing.T) {
		root := t.TempDir()
		target := filepath.Join(root, "new.md")
		absent := DiskVersion{}
		result, err := AtomicReplace(AtomicReplaceRequest{
			TargetPath:      target,
			Data:            []byte("new file"),
			ExpectedVersion: &absent,
		})
		if err != nil {
			t.Fatalf("AtomicReplace: %v", err)
		}
		if !result.Committed {
			t.Fatalf("result = %+v, want committed", result)
		}
		got, err := os.ReadFile(target)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(got, []byte("new file")) {
			t.Fatalf("new target bytes = %q", got)
		}
		entries, err := os.ReadDir(root)
		if err != nil {
			t.Fatal(err)
		}
		if len(entries) != 1 || entries[0].Name() != "new.md" {
			t.Fatalf("same-directory artifacts = %+v", entries)
		}
	})

	for _, failure := range []atomicReplaceFailure{
		{name: "write", category: apperr.ClassifiedIOFailure, configure: func(_ *atomicReplaceOps, temp *atomicReplaceTestTemp, _ DiskVersion) {
			temp.writeErr = errors.New("write failed")
		}},
		{name: "chmod", category: apperr.ClassifiedIOFailure, configure: func(_ *atomicReplaceOps, temp *atomicReplaceTestTemp, _ DiskVersion) {
			temp.chmodErr = errors.New("chmod failed")
		}},
		{name: "sync", category: apperr.ClassifiedIOFailure, configure: func(_ *atomicReplaceOps, temp *atomicReplaceTestTemp, _ DiskVersion) {
			temp.syncErr = errors.New("sync failed")
		}},
		{name: "close", category: apperr.ClassifiedIOFailure, configure: func(_ *atomicReplaceOps, temp *atomicReplaceTestTemp, _ DiskVersion) {
			temp.closeErr = errors.New("close failed")
		}},
		{name: "recheck", category: apperr.ClassifiedConflict, configure: func(ops *atomicReplaceOps, _ *atomicReplaceTestTemp, before DiskVersion) {
			ops.currentVersion = func(string) (DiskVersion, error) {
				return DiskVersion{Exists: true, Size: before.Size + 1, Mode: before.Mode}, nil
			}
		}},
		{name: "replace", category: apperr.ClassifiedIOFailure, configure: func(ops *atomicReplaceOps, _ *atomicReplaceTestTemp, _ DiskVersion) {
			ops.replace = func(string, string) error { return errors.New("replace failed") }
		}},
	} {
		t.Run("pre-commit "+failure.name+" preserves original", func(t *testing.T) {
			root := t.TempDir()
			target := filepath.Join(root, "document.md")
			if err := os.WriteFile(target, []byte("before"), 0o640); err != nil {
				t.Fatal(err)
			}
			beforeBytes, err := os.ReadFile(target)
			if err != nil {
				t.Fatal(err)
			}
			before := mustCurrentDiskVersion(t, target)
			temp := &atomicReplaceTestTemp{name: filepath.Join(root, ".temporary")}
			ops, removed := testAtomicReplaceOps(temp, before)
			failure.configure(&ops, temp, before)

			result, err := atomicReplaceWithOps(AtomicReplaceRequest{TargetPath: target, Data: []byte("after"), ExpectedVersion: &before}, ops)
			assertAtomicReplaceFailure(t, err, false, failure.category)
			if result.Committed {
				t.Fatalf("result = %+v, want pre-commit result", result)
			}
			got, readErr := os.ReadFile(target)
			if readErr != nil {
				t.Fatal(readErr)
			}
			if !bytes.Equal(got, beforeBytes) {
				t.Fatalf("original bytes = %q, want %q", got, beforeBytes)
			}
			if !*removed {
				t.Fatalf("temporary file %q was not cleaned up", temp.name)
			}
		})
	}

	t.Run("post-commit directory sync reports committed write", func(t *testing.T) {
		root := t.TempDir()
		target := filepath.Join(root, "document.md")
		if err := os.WriteFile(target, []byte("before"), 0o640); err != nil {
			t.Fatal(err)
		}
		before := mustCurrentDiskVersion(t, target)
		ops := defaultAtomicReplaceOps()
		ops.syncDir = func(string) error { return errors.New("directory sync failed") }

		result, err := atomicReplaceWithOps(AtomicReplaceRequest{TargetPath: target, Data: []byte("after"), ExpectedVersion: &before}, ops)
		assertAtomicReplaceFailure(t, err, true, apperr.ClassifiedPersistenceWarning)
		if !result.Committed {
			t.Fatalf("result = %+v, want committed result", result)
		}
		got, readErr := os.ReadFile(target)
		if readErr != nil {
			t.Fatal(readErr)
		}
		if !bytes.Equal(got, []byte("after")) {
			t.Fatalf("committed bytes = %q", got)
		}
	})
}

func testAtomicReplaceOps(temp *atomicReplaceTestTemp, version DiskVersion) (atomicReplaceOps, *bool) {
	removed := false
	return atomicReplaceOps{
		createTemp: func(string) (atomicTempFile, error) { return temp, nil },
		write:      func(file atomicTempFile, data []byte) (int, error) { return file.Write(data) },
		chmod:      func(file atomicTempFile, mode fs.FileMode) error { return file.Chmod(mode) },
		syncFile:   func(file atomicTempFile) error { return file.Sync() },
		closeFile:  func(file atomicTempFile) error { return file.Close() },
		currentVersion: func(string) (DiskVersion, error) {
			return version, nil
		},
		remove: func(path string) error {
			removed = true
			return nil
		},
		replace: func(string, string) error { return nil },
		syncDir: func(string) error { return nil },
	}, &removed
}

func assertAtomicReplaceFailure(t *testing.T, err error, committed bool, category apperr.ClassifiedErrorCategory) {
	t.Helper()
	if err == nil {
		t.Fatal("AtomicReplace unexpectedly succeeded")
	}
	var atomicErr *AtomicReplaceError
	if !errors.As(err, &atomicErr) {
		t.Fatalf("error = %T %v, want AtomicReplaceError", err, err)
	}
	if atomicErr.Committed != committed {
		t.Fatalf("error = %+v, want committed=%t", atomicErr, committed)
	}
	if atomicErr.Classified == nil || atomicErr.Classified.Category != category {
		t.Fatalf("classified error = %+v, want category %q", atomicErr.Classified, category)
	}
}

func mustCurrentDiskVersion(t *testing.T, path string) DiskVersion {
	t.Helper()
	version, err := CurrentDiskVersion(path)
	if err != nil {
		t.Fatal(err)
	}
	return version
}
