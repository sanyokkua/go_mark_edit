package file

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
)

// AtomicReplaceRequest contains the immutable bytes and disk baseline for one
// same-directory replacement.
type AtomicReplaceRequest struct {
	TargetPath      string
	Data            []byte
	ExpectedVersion *DiskVersion
	ExpectedRawHash string
}

// AtomicReplaceResult reports the committed disk baseline. A result returned
// with an error can still be committed when the post-commit directory sync
// fails.
type AtomicReplaceResult struct {
	Committed bool
	Version   DiskVersion
}

// atomicReplacePhase identifies whether an AtomicReplaceError happened before
// or after the target replacement committed.
type atomicReplacePhase string

const (
	atomicReplacePreCommit  atomicReplacePhase = "pre-commit"
	atomicReplacePostCommit atomicReplacePhase = "post-commit"
)

// AtomicReplaceError preserves the commit state while exposing only a safe,
// classified error to callers. Cause remains local for errors.Is/errors.As.
type AtomicReplaceError struct {
	Committed  bool
	Reason     apperr.WriteWarningReason
	phase      atomicReplacePhase
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
	expected, expectedHash, err := atomicReplaceBaseline(request, ops)
	if err != nil {
		return AtomicReplaceResult{}, err
	}

	directory := filepath.Dir(target)
	temporary, err := ops.createTemp(directory)
	if err != nil {
		return AtomicReplaceResult{}, newAtomicReplaceError(target, false, atomicReplacePreCommit, classifyAtomicReplaceCause(err), err)
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
		return AtomicReplaceResult{}, newAtomicReplaceError(target, false, atomicReplacePreCommit, category, cause)
	}

	if err := writeAtomicTemp(temporary, request.Data, ops); err != nil {
		return failBeforeCommit(classifyAtomicReplaceCause(err), err)
	}

	mode, setMode := atomicReplacementMode(expected)
	if setMode {
		if err := ops.chmod(temporary, mode); err != nil {
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

	if expected.Exists {
		category, checkErr := recheckAtomicTarget(target, expected, expectedHash, ops)
		if checkErr != nil {
			return failBeforeCommit(category, checkErr)
		}
	}

	if err := ops.replace(temporaryPath, target); err != nil {
		return failBeforeCommit(classifyAtomicReplaceCause(err), err)
	}
	temporaryPath = ""
	return verifyAtomicCommit(target, directory, request.Data, ops)
}

func atomicReplaceBaseline(request AtomicReplaceRequest, ops atomicReplaceOps) (DiskVersion, string, error) {
	target := request.TargetPath
	if strings.TrimSpace(target) == "" {
		return DiskVersion{}, "", newAtomicReplaceError(target, false, atomicReplacePreCommit, apperr.ClassifiedIOFailure, errors.New("target path is empty"))
	}

	var expected DiskVersion
	if request.ExpectedVersion != nil {
		expected = *request.ExpectedVersion
	} else {
		var err error
		expected, err = ops.currentVersion(target)
		if err != nil {
			return DiskVersion{}, "", newAtomicReplaceError(target, false, atomicReplacePreCommit, classifyAtomicReplaceCause(err), err)
		}
	}
	baseline, err := CurrentDiskVersion(target)
	if err != nil {
		return DiskVersion{}, "", newAtomicReplaceError(target, false, atomicReplacePreCommit, classifyAtomicReplaceCause(err), err)
	}
	if !baseline.Equal(expected) {
		return DiskVersion{}, "", newAtomicReplaceError(target, false, atomicReplacePreCommit, apperr.ClassifiedConflict, errors.New("target disk version changed before replacement"))
	}

	expectedHash := request.ExpectedRawHash
	if expected.Exists && expectedHash == "" {
		expectedHash, err = rawFileHash(target, expected.Size)
		if err != nil {
			return DiskVersion{}, "", newAtomicReplaceError(target, false, atomicReplacePreCommit, classifyAtomicReplaceCause(err), err)
		}
	}
	return expected, expectedHash, nil
}

func verifyAtomicCommit(target, directory string, data []byte, ops atomicReplaceOps) (AtomicReplaceResult, error) {
	result := AtomicReplaceResult{Committed: true}
	var err error
	result.Version, err = ops.currentVersion(target)
	if err != nil {
		return result, newAtomicCommitWarning(target, apperr.WriteWarningReasonMetadataStat, err)
	}
	committedHash, hashErr := rawFileHash(target, int64(len(data)))
	writtenDigest := sha256.Sum256(data)
	if hashErr != nil {
		reason := apperr.WriteWarningReasonReadback
		if errors.Is(hashErr, errFingerprintChanged) {
			reason = apperr.WriteWarningReasonContentMismatch
		}
		return result, newAtomicCommitWarning(target, reason, hashErr)
	}
	if committedHash != hex.EncodeToString(writtenDigest[:]) {
		return result, newAtomicCommitWarning(target, apperr.WriteWarningReasonContentMismatch, errors.New("target changed after replacement"))
	}
	if err := ops.syncDir(directory); err != nil {
		return result, newAtomicCommitWarning(target, apperr.WriteWarningReasonDirectorySync, err)
	}
	return result, nil
}

func newAtomicCommitWarning(target string, reason apperr.WriteWarningReason, cause error) *AtomicReplaceError {
	warning := newAtomicReplaceError(target, true, atomicReplacePostCommit, apperr.ClassifiedPersistenceWarning, cause)
	warning.Reason = reason
	return warning
}

// writeAtomicTemp handles short writes without allowing a stalled writer to loop forever.
func writeAtomicTemp(temporary atomicTempFile, data []byte, ops atomicReplaceOps) error {
	for offset := 0; offset < len(data); {
		written, err := ops.write(temporary, data[offset:])
		if written < 0 || written > len(data)-offset {
			return errors.New("invalid write count")
		}
		offset += written
		if err != nil {
			return err
		}
		if written == 0 {
			return io.ErrNoProgress
		}
	}
	return nil
}

// recheckAtomicTarget verifies both bytes and metadata before replacement.
func recheckAtomicTarget(target string, expected DiskVersion, expectedHash string, ops atomicReplaceOps) (apperr.ClassifiedErrorCategory, error) {
	currentHash, err := rawFileHash(target, expected.Size)
	if err != nil {
		return classifyAtomicReplaceCause(err), err
	}
	if currentHash != expectedHash {
		return apperr.ClassifiedConflict, errors.New("target bytes changed before replacement")
	}
	current, err := ops.currentVersion(target)
	if err != nil {
		return classifyAtomicReplaceCause(err), err
	}
	if !current.Equal(expected) {
		return apperr.ClassifiedConflict, errors.New("target disk version changed before replacement")
	}
	return "", nil
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
	if errors.Is(err, errFingerprintChanged) {
		return apperr.ClassifiedConflict
	}
	if errors.Is(err, fs.ErrPermission) || os.IsPermission(err) {
		return apperr.ClassifiedPermissionDenied
	}
	return apperr.ClassifiedIOFailure
}

func newAtomicReplaceError(target string, committed bool, phase atomicReplacePhase, category apperr.ClassifiedErrorCategory, cause error) *AtomicReplaceError {
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
	return &AtomicReplaceError{
		Committed:  committed,
		phase:      phase,
		Classified: bridge.ClassifiedWithID(category, target, message, remediation, ""),
		Cause:      cause,
	}
}

var errFingerprintChanged = errors.New("target size or type changed while fingerprinting")

func rawFileHash(path string, expectedSize int64) (string, error) {
	if expectedSize < 0 {
		return "", errFingerprintChanged
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() || info.Size() != expectedSize {
		return "", errFingerprintChanged
	}
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer func() { _ = f.Close() }()
	info, err = f.Stat()
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() || info.Size() != expectedSize {
		return "", errFingerprintChanged
	}
	h := sha256.New()
	count, err := io.Copy(h, io.LimitReader(f, expectedSize))
	if err != nil {
		return "", err
	}
	if count != expectedSize {
		return "", errFingerprintChanged
	}
	var extra [1]byte
	n, err := f.Read(extra[:])
	if n != 0 {
		return "", errFingerprintChanged
	}
	if err != nil && !errors.Is(err, io.EOF) {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
