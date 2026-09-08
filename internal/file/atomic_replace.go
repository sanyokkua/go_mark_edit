package file

import (
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// AtomicReplaceRequest contains the immutable bytes and disk baseline for one
// same-directory replacement.
type AtomicReplaceRequest struct {
	TargetPath      string
	Data            []byte
	ExpectedVersion *DiskVersion
}

// AtomicReplaceResult reports the committed disk baseline. A result returned
// with an error can still be committed when the post-commit directory sync
// fails.
type AtomicReplaceResult struct {
	Committed bool
	Version   DiskVersion
}

// AtomicReplacePhase identifies whether an AtomicReplaceError happened before
// or after the target replacement committed.
type AtomicReplacePhase string

const (
	AtomicReplacePreCommit  AtomicReplacePhase = "pre-commit"
	AtomicReplacePostCommit AtomicReplacePhase = "post-commit"
)

// AtomicReplaceError preserves the commit state while exposing only a safe,
// classified error to callers. Cause remains local for errors.Is/errors.As.
type AtomicReplaceError struct {
	Committed  bool
	Phase      AtomicReplacePhase
	Classified *apperr.ClassifiedError
	Cause      error
}

func (err *AtomicReplaceError) Error() string {
	if err == nil {
		return ""
	}
	if err.Classified != nil && err.Classified.Message != "" {
		return err.Classified.Message
	}
	if err.Cause != nil {
		return err.Cause.Error()
	}
	return "atomic replacement failed"
}

func (err *AtomicReplaceError) Unwrap() error {
	if err == nil {
		return nil
	}
	return err.Cause
}

type atomicTempFile interface {
	Name() string
	Write([]byte) (int, error)
	Chmod(fs.FileMode) error
	Sync() error
	Close() error
}

// atomicReplaceOps is the narrow I/O seam used to exercise every failure
// boundary without changing the production replacement sequence.
type atomicReplaceOps struct {
	createTemp     func(string) (atomicTempFile, error)
	write          func(atomicTempFile, []byte) (int, error)
	chmod          func(atomicTempFile, fs.FileMode) error
	syncFile       func(atomicTempFile) error
	closeFile      func(atomicTempFile) error
	currentVersion func(string) (DiskVersion, error)
	remove         func(string) error
	replace        func(string, string) error
	syncDir        func(string) error
}

// AtomicReplace writes and replaces a target using the host platform port.
func AtomicReplace(request AtomicReplaceRequest) (AtomicReplaceResult, error) {
	return atomicReplaceWithOps(request, defaultAtomicReplaceOps())
}

func defaultAtomicReplaceOps() atomicReplaceOps {
	return atomicReplaceOps{
		createTemp:     createAtomicTemp,
		write:          func(file atomicTempFile, data []byte) (int, error) { return file.Write(data) },
		chmod:          func(file atomicTempFile, mode fs.FileMode) error { return file.Chmod(mode) },
		syncFile:       func(file atomicTempFile) error { return file.Sync() },
		closeFile:      func(file atomicTempFile) error { return file.Close() },
		currentVersion: CurrentDiskVersion,
		remove:         os.Remove,
		replace:        replaceAtomicFile,
		syncDir:        syncParentDirectory,
	}
}

func createAtomicTemp(directory string) (atomicTempFile, error) {
	return os.CreateTemp(directory, ".gomarkedit-*")
}

func atomicReplaceWithOps(request AtomicReplaceRequest, ops atomicReplaceOps) (AtomicReplaceResult, error) {
	ops = withDefaultAtomicReplaceOps(ops)
	target := request.TargetPath
	if strings.TrimSpace(target) == "" {
		return AtomicReplaceResult{}, newAtomicReplaceError(request.TargetPath, false, AtomicReplacePreCommit, apperr.ClassifiedIOFailure, errors.New("target path is empty"))
	}

	var expected DiskVersion
	if request.ExpectedVersion != nil {
		expected = *request.ExpectedVersion
	} else {
		var err error
		expected, err = ops.currentVersion(target)
		if err != nil {
			return AtomicReplaceResult{}, newAtomicReplaceError(target, false, AtomicReplacePreCommit, classifyAtomicReplaceCause(err), err)
		}
	}
	baseline, err := CurrentDiskVersion(target)
	if err != nil {
		return AtomicReplaceResult{}, newAtomicReplaceError(target, false, AtomicReplacePreCommit, classifyAtomicReplaceCause(err), err)
	}
	if !baseline.Equal(expected) {
		return AtomicReplaceResult{}, newAtomicReplaceError(target, false, AtomicReplacePreCommit, apperr.ClassifiedConflict, errors.New("target disk version changed before replacement"))
	}

	directory := filepath.Dir(target)
	temporary, err := ops.createTemp(directory)
	if err != nil {
		return AtomicReplaceResult{}, newAtomicReplaceError(target, false, AtomicReplacePreCommit, classifyAtomicReplaceCause(err), err)
	}
	temporaryPath := temporary.Name()
	closed := false
	cleanup := func() {
		if !closed {
			_ = ops.closeFile(temporary)
			closed = true
		}
		if temporaryPath != "" {
			_ = ops.remove(temporaryPath)
		}
	}
	failBeforeCommit := func(category apperr.ClassifiedErrorCategory, cause error) (AtomicReplaceResult, error) {
		cleanup()
		return AtomicReplaceResult{}, newAtomicReplaceError(target, false, AtomicReplacePreCommit, category, cause)
	}

	for offset := 0; offset < len(request.Data); {
		written, writeErr := ops.write(temporary, request.Data[offset:])
		remaining := len(request.Data) - offset
		if written < 0 || written > remaining {
			return failBeforeCommit(apperr.ClassifiedIOFailure, errors.New("invalid write count"))
		}
		offset += written
		if writeErr != nil {
			return failBeforeCommit(classifyAtomicReplaceCause(writeErr), writeErr)
		}
		if written == 0 {
			return failBeforeCommit(apperr.ClassifiedIOFailure, io.ErrNoProgress)
		}
	}
	if expected.Exists {
		if err := ops.chmod(temporary, expected.Mode); err != nil {
			return failBeforeCommit(classifyAtomicReplaceCause(err), err)
		}
	}
	if err := ops.syncFile(temporary); err != nil {
		return failBeforeCommit(classifyAtomicReplaceCause(err), err)
	}
	if err := ops.closeFile(temporary); err != nil {
		closed = true
		return failBeforeCommit(classifyAtomicReplaceCause(err), err)
	}
	closed = true

	current, err := ops.currentVersion(target)
	if err != nil {
		return failBeforeCommit(classifyAtomicReplaceCause(err), err)
	}
	if !current.Equal(expected) {
		return failBeforeCommit(apperr.ClassifiedConflict, errors.New("target disk version changed before replacement"))
	}

	if err := ops.replace(temporaryPath, target); err != nil {
		return failBeforeCommit(classifyAtomicReplaceCause(err), err)
	}
	temporaryPath = ""
	result := AtomicReplaceResult{Committed: true}

	result.Version, err = CurrentDiskVersion(target)
	if err != nil {
		return result, newAtomicReplaceError(target, true, AtomicReplacePostCommit, apperr.ClassifiedPersistenceWarning, err)
	}
	if err := ops.syncDir(directory); err != nil {
		return result, newAtomicReplaceError(target, true, AtomicReplacePostCommit, apperr.ClassifiedPersistenceWarning, err)
	}
	return result, nil
}

func withDefaultAtomicReplaceOps(ops atomicReplaceOps) atomicReplaceOps {
	defaults := defaultAtomicReplaceOps()
	if ops.createTemp == nil {
		ops.createTemp = defaults.createTemp
	}
	if ops.write == nil {
		ops.write = defaults.write
	}
	if ops.chmod == nil {
		ops.chmod = defaults.chmod
	}
	if ops.syncFile == nil {
		ops.syncFile = defaults.syncFile
	}
	if ops.closeFile == nil {
		ops.closeFile = defaults.closeFile
	}
	if ops.currentVersion == nil {
		ops.currentVersion = defaults.currentVersion
	}
	if ops.remove == nil {
		ops.remove = defaults.remove
	}
	if ops.replace == nil {
		ops.replace = defaults.replace
	}
	if ops.syncDir == nil {
		ops.syncDir = defaults.syncDir
	}
	return ops
}

func classifyAtomicReplaceCause(err error) apperr.ClassifiedErrorCategory {
	if errors.Is(err, fs.ErrPermission) || os.IsPermission(err) {
		return apperr.ClassifiedPermissionDenied
	}
	return apperr.ClassifiedIOFailure
}

func newAtomicReplaceError(target string, committed bool, phase AtomicReplacePhase, category apperr.ClassifiedErrorCategory, cause error) *AtomicReplaceError {
	message := "The document could not be saved."
	switch category {
	case apperr.ClassifiedConflict:
		message = "The document changed on disk before it could be saved."
	case apperr.ClassifiedPermissionDenied:
		message = "The document could not be saved because permission was denied."
	case apperr.ClassifiedPersistenceWarning:
		message = "The document was saved, but its durability could not be confirmed."
	}
	/*
	 * Per category, not a default plus exceptions. This defaulted every category to
	 * Retry, so a permission-denied write carried an action the contract makes
	 * message-only precisely because retrying the identical action cannot succeed.
	 * `apperr` now refuses that pairing outright; naming each row here means the
	 * refusal never has to fire.
	 */
	remediation := apperr.RemediationNone
	switch category {
	case apperr.ClassifiedConflict:
		remediation = apperr.RemediationReload
	case apperr.ClassifiedIOFailure:
		remediation = apperr.RemediationRetry
	}
	classified := apperr.NewClassifiedError(category, target, message, remediation, "")
	return &AtomicReplaceError{
		Committed:  committed,
		Phase:      phase,
		Classified: &classified,
		Cause:      cause,
	}
}
