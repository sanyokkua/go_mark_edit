package file

import (
	"bytes"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
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

func TestAtomicReplace(t *testing.T) {
	t.Run("existing target preserves bytes and mode", testAtomicReplaceExistingTarget)

	t.Run("new target uses normal creation semantics", testAtomicReplaceNewTarget)

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
			testAtomicReplacePreCommitFailure(t, failure)
		})
	}

	t.Run("post-commit directory sync reports committed write", testAtomicReplaceDirectorySyncFailure)
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

func TestAtomicReplaceNewTargetChmodFailureCleansTemporary(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("new-target chmod applies only on Unix")
	}
	root := t.TempDir()
	target := filepath.Join(root, "new.md")
	temp := &atomicReplaceTestTemp{name: filepath.Join(root, ".temporary"), chmodErr: errors.New("chmod failed")}
	ops, removed := testAtomicReplaceOps(temp, DiskVersion{})
	result, err := atomicReplaceWithOps(AtomicReplaceRequest{TargetPath: target, Data: []byte("content")}, ops)
	assertAtomicReplaceFailure(t, err, false, apperr.ClassifiedIOFailure)
	if result.Committed || !*removed {
		t.Fatalf("result = %+v, temporary removed = %v", result, *removed)
	}
	if _, err := os.Stat(target); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("target stat error = %v, want not exist", err)
	}
}

func TestAtomicReplaceRejectsSameMetadataChangeDuringPreparation(t *testing.T) {
	target := filepath.Join(t.TempDir(), "race.md")
	if err := os.WriteFile(target, []byte("base"), 0o644); err != nil {
		t.Fatal(err)
	}
	version, err := CurrentDiskVersion(target)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(target)
	if err != nil {
		t.Fatal(err)
	}
	ops := defaultAtomicReplaceOps()
	originalSync := ops.syncFile
	ops.syncFile = func(f atomicTempFile) error {
		if err := originalSync(f); err != nil {
			return err
		}
		if err := os.WriteFile(target, []byte("disk"), info.Mode()); err != nil {
			return err
		}
		return os.Chtimes(target, info.ModTime(), info.ModTime())
	}
	result, err := atomicReplaceWithOps(AtomicReplaceRequest{TargetPath: target, Data: []byte("mine"), ExpectedVersion: &version, ExpectedRawHash: mustRawFileHash(t, target)}, ops)
	if err == nil || result.Committed {
		t.Fatalf("replacement = %+v, %v; want conflict", result, err)
	}
	data, readErr := os.ReadFile(target)
	if readErr != nil || string(data) != "disk" {
		t.Fatalf("disk = %q, %v", data, readErr)
	}
}

func TestAtomicReplaceReportsInterveningChangeAfterRename(t *testing.T) {
	target := filepath.Join(t.TempDir(), "race.md")
	if err := os.WriteFile(target, []byte("base"), 0o644); err != nil {
		t.Fatal(err)
	}
	version, err := CurrentDiskVersion(target)
	if err != nil {
		t.Fatal(err)
	}
	ops := defaultAtomicReplaceOps()
	originalReplace := ops.replace
	ops.replace = func(from, to string) error {
		if err := originalReplace(from, to); err != nil {
			return err
		}
		return os.WriteFile(to, []byte("disk"), 0o644)
	}
	result, err := atomicReplaceWithOps(AtomicReplaceRequest{TargetPath: target, Data: []byte("mine"), ExpectedVersion: &version, ExpectedRawHash: mustRawFileHash(t, target)}, ops)
	if err == nil || !result.Committed {
		t.Fatalf("replacement = %+v, %v; want committed warning", result, err)
	}
}

func testAtomicReplaceExistingTarget(t *testing.T) {
	t.Helper()
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
		ExpectedRawHash: mustRawFileHash(t, target),
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
}

func testAtomicReplaceNewTarget(t *testing.T) {
	t.Helper()
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
}

func testAtomicReplaceDirectorySyncFailure(t *testing.T) {
	t.Helper()
	root := t.TempDir()
	target := filepath.Join(root, "document.md")
	if err := os.WriteFile(target, []byte("before"), 0o640); err != nil {
		t.Fatal(err)
	}
	before := mustCurrentDiskVersion(t, target)
	ops := defaultAtomicReplaceOps()
	ops.syncDir = func(string) error { return errors.New("directory sync failed") }

	result, err := atomicReplaceWithOps(AtomicReplaceRequest{TargetPath: target, Data: []byte("after"), ExpectedVersion: &before, ExpectedRawHash: mustRawFileHash(t, target)}, ops)
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
}

func testAtomicReplacePreCommitFailure(t *testing.T, failure atomicReplaceFailure) {
	t.Helper()
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

	result, err := atomicReplaceWithOps(AtomicReplaceRequest{TargetPath: target, Data: []byte("after"), ExpectedVersion: &before, ExpectedRawHash: mustRawFileHash(t, target)}, ops)
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
}

func TestAtomicCommitWarningsIdentifyFailedCheck(t *testing.T) {
	for _, reason := range []string{"metadata-stat", "readback", "content-mismatch", "directory-sync", "size-mismatch"} {
		t.Run(reason, func(t *testing.T) {
			target := filepath.Join(t.TempDir(), "saved.md")
			if err := os.WriteFile(target, []byte("saved"), 0o644); err != nil {
				t.Fatal(err)
			}
			ops := defaultAtomicReplaceOps()
			want := reason
			switch reason {
			case "metadata-stat":
				ops.currentVersion = func(string) (DiskVersion, error) { return DiskVersion{}, errors.New("private metadata diagnostic") }
			case "readback":
				ops.currentVersion = func(path string) (DiskVersion, error) {
					version, err := CurrentDiskVersion(path)
					if removeErr := os.Remove(path); removeErr != nil {
						t.Fatal(removeErr)
					}
					return version, err
				}
			case "content-mismatch":
				if err := os.WriteFile(target, []byte("other"), 0o644); err != nil {
					t.Fatal(err)
				}
			case "size-mismatch":
				want = "content-mismatch"
				if err := os.WriteFile(target, []byte("other length"), 0o644); err != nil {
					t.Fatal(err)
				}
			case "directory-sync":
				ops.syncDir = func(string) error { return errors.New("private directory diagnostic") }
			}
			result, err := verifyAtomicCommit(target, filepath.Dir(target), []byte("saved"), ops)
			assertAtomicReplaceFailure(t, err, true, apperr.ClassifiedPersistenceWarning)
			if !result.Committed {
				t.Fatal("replacement was not retained as committed")
			}
			if got := err.(*AtomicReplaceError).Reason; string(got) != want {
				t.Fatalf("warning reason = %v, want %s", got, want)
			}
			if strings.Contains(err.Error(), "private") {
				t.Fatalf("unsafe message = %q", err.Error())
			}
		})
	}
}

func TestAtomicReplaceNewTargetNeverReplacesFileCreatedBeforeCommit(t *testing.T) {
	target := filepath.Join(t.TempDir(), "new.md")
	ops := defaultAtomicReplaceOps()
	realReplace, realCreate := ops.replace, ops.create
	appear := func() {
		if err := os.WriteFile(target, []byte("other program"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	ops.replace = func(from, to string) error { appear(); return realReplace(from, to) }
	ops.create = func(from, to string) error { appear(); return realCreate(from, to) }

	result, err := atomicReplaceWithOps(AtomicReplaceRequest{TargetPath: target, Data: []byte("mine")}, ops)
	if err == nil || result.Committed {
		t.Fatalf("replacement = %+v, %v; want conflict", result, err)
	}
	data, readErr := os.ReadFile(target)
	if readErr != nil || string(data) != "other program" {
		t.Fatalf("disk = %q, %v", data, readErr)
	}
	entries, _ := os.ReadDir(filepath.Dir(target))
	if len(entries) != 1 {
		t.Fatalf("leftover temporary files: %v", entries)
	}
}

func mustRawFileHash(t *testing.T, path string) string {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	hash, err := rawFileHash(path, info.Size())
	if err != nil {
		t.Fatal(err)
	}
	return hash
}

// recordedCreateOps runs the no-replace creation against real files while
// letting a test replace individual system calls and observe which ran.
type recordedCreateOps struct {
	calls []string
	ops   atomicCreateOps
}

func newRecordedCreateOps() *recordedCreateOps {
	recorded := &recordedCreateOps{}
	platform := defaultAtomicCreateOps()
	recorded.ops = atomicCreateOps{
		exclusive: func(from, to string) error {
			recorded.calls = append(recorded.calls, "exclusive")
			return platform.exclusive(from, to)
		},
		link: func(from, to string) error {
			recorded.calls = append(recorded.calls, "link")
			return platform.link(from, to)
		},
		remove: func(path string) error {
			recorded.calls = append(recorded.calls, "remove")
			return platform.remove(path)
		},
		lstat: func(path string) (fs.FileInfo, error) {
			recorded.calls = append(recorded.calls, "lstat")
			return platform.lstat(path)
		},
		rename: func(from, to string) error {
			recorded.calls = append(recorded.calls, "rename")
			return platform.rename(from, to)
		},
	}
	return recorded
}

func preparedCreate(t *testing.T) (string, string) {
	t.Helper()
	directory := t.TempDir()
	temporary := filepath.Join(directory, ".gomarkedit-temporary")
	if err := os.WriteFile(temporary, []byte("mine"), 0o600); err != nil {
		t.Fatal(err)
	}
	return temporary, filepath.Join(directory, "new.md")
}

func assertCreated(t *testing.T, target string) {
	t.Helper()
	data, err := os.ReadFile(target)
	if err != nil || string(data) != "mine" {
		t.Fatalf("target = %q, %v; want the new content", data, err)
	}
}

func unsupported(err syscall.Errno) func(string, string) error {
	return func(from, to string) error { return &os.LinkError{Op: "rename", Old: from, New: to, Err: err} }
}

func TestAtomicCreateFallsBackToLinkWhenExclusiveRenameIsUnsupported(t *testing.T) {
	for _, errno := range []syscall.Errno{syscall.ENOSYS, syscall.EINVAL, syscall.ENOTSUP} {
		t.Run(errno.Error(), func(t *testing.T) {
			temporary, target := preparedCreate(t)
			recorded := newRecordedCreateOps()
			recorded.ops.exclusive = unsupported(errno)

			if err := createAtomicFileWithOps(temporary, target, recorded.ops); err != nil {
				t.Fatalf("create: %v", err)
			}
			assertCreated(t, target)
			if _, err := os.Lstat(temporary); !errors.Is(err, fs.ErrNotExist) {
				t.Fatalf("temporary still present: %v", err)
			}
			if strings.Join(recorded.calls, ",") != "link,remove" {
				t.Fatalf("calls = %v, want link then remove", recorded.calls)
			}
		})
	}
}

func TestAtomicCreateReportsAPermissionRefusalWithoutAnotherAttempt(t *testing.T) {
	temporary, target := preparedCreate(t)
	recorded := newRecordedCreateOps()
	recorded.ops.exclusive = unsupported(syscall.EPERM)

	err := createAtomicFileWithOps(temporary, target, recorded.ops)

	if !errors.Is(err, syscall.EPERM) {
		t.Fatalf("create error = %v, want the permission refusal", err)
	}
	if len(recorded.calls) != 0 {
		t.Fatalf("calls after the refusal = %v, want none", recorded.calls)
	}
	if _, statErr := os.Lstat(target); !errors.Is(statErr, fs.ErrNotExist) {
		t.Fatalf("target exists after a refused create: %v", statErr)
	}
}

func TestAtomicCreateCountsALinkedTargetAsCommittedWhenTheTemporaryCannotBeRemoved(t *testing.T) {
	temporary, target := preparedCreate(t)
	recorded := newRecordedCreateOps()
	recorded.ops.exclusive = unsupported(syscall.ENOTSUP)
	recorded.ops.remove = func(string) error { return syscall.EIO }

	if err := createAtomicFileWithOps(temporary, target, recorded.ops); err != nil {
		t.Fatalf("create error = %v, want success once the target is linked", err)
	}
	assertCreated(t, target)
}

func TestAtomicReplaceCommitsANewTargetWhoseLinkedTemporaryCannotBeRemoved(t *testing.T) {
	target := filepath.Join(t.TempDir(), "new.md")
	recorded := newRecordedCreateOps()
	recorded.ops.exclusive = unsupported(syscall.ENOTSUP)
	recorded.ops.remove = func(string) error { return syscall.EIO }
	ops := defaultAtomicReplaceOps()
	ops.create = func(from, to string) error { return createAtomicFileWithOps(from, to, recorded.ops) }

	result, err := atomicReplaceWithOps(AtomicReplaceRequest{TargetPath: target, Data: []byte("mine")}, ops)

	if err != nil || !result.Committed {
		t.Fatalf("replacement = %+v, %v; want committed", result, err)
	}
	assertCreated(t, target)
}

func TestAtomicCreateUsesACheckedRenameOnlyWhenHardLinksAreUnsupported(t *testing.T) {
	temporary, target := preparedCreate(t)
	recorded := newRecordedCreateOps()
	recorded.ops.exclusive = unsupported(syscall.EINVAL)
	// link(2) reports EPERM when the filesystem cannot create hard links.
	recorded.ops.link = func(from, to string) error {
		recorded.calls = append(recorded.calls, "link")
		return &os.LinkError{Op: "link", Old: from, New: to, Err: syscall.EPERM}
	}

	if err := createAtomicFileWithOps(temporary, target, recorded.ops); err != nil {
		t.Fatalf("create: %v", err)
	}
	assertCreated(t, target)
	if strings.Join(recorded.calls, ",") != "link,lstat,rename" {
		t.Fatalf("calls = %v, want link, lstat, rename", recorded.calls)
	}
}

func TestAtomicCreateCheckedRenameNeverReplacesAnExistingTarget(t *testing.T) {
	temporary, target := preparedCreate(t)
	if err := os.WriteFile(target, []byte("other program"), 0o600); err != nil {
		t.Fatal(err)
	}
	recorded := newRecordedCreateOps()
	recorded.ops.exclusive = unsupported(syscall.ENOSYS)
	recorded.ops.link = unsupported(syscall.ENOTSUP)

	err := createAtomicFileWithOps(temporary, target, recorded.ops)

	if !errors.Is(err, fs.ErrExist) {
		t.Fatalf("create error = %v, want fs.ErrExist", err)
	}
	if data, readErr := os.ReadFile(target); readErr != nil || string(data) != "other program" {
		t.Fatalf("target = %q, %v; want the existing file kept", data, readErr)
	}
}

func TestAtomicCreateReportsALinkFailureThatIsNotAMissingCapability(t *testing.T) {
	temporary, target := preparedCreate(t)
	recorded := newRecordedCreateOps()
	recorded.ops.exclusive = unsupported(syscall.ENOTSUP)
	recorded.ops.link = unsupported(syscall.EACCES)

	err := createAtomicFileWithOps(temporary, target, recorded.ops)

	if !errors.Is(err, syscall.EACCES) {
		t.Fatalf("create error = %v, want the link failure", err)
	}
	if _, statErr := os.Lstat(target); !errors.Is(statErr, fs.ErrNotExist) {
		t.Fatalf("target exists after a failed link: %v", statErr)
	}
}
