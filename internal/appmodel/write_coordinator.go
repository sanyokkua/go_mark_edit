package appmodel

import (
	"errors"
	"sync"

	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// WriteSnapshot is an immutable revision-bound disk write request.
type WriteSnapshot struct {
	DocumentID          string
	ContentRevision     uint64
	CanonicalContent    string
	TargetPath          string
	ExpectedDiskVersion *file.DiskVersion
	EncodedData         []byte
}

// committedWriteError lets the coordinator preserve disk truth when the
// replacement succeeded but a post-commit durability step reported a warning.
type committedWriteError struct {
	version file.DiskVersion
	err     error
}

func (err *committedWriteError) Error() string { return err.err.Error() }
func (err *committedWriteError) Unwrap() error { return err.err }

// CommittedWriteResult records disk truth even when projection publication needs recovery.
type CommittedWriteResult struct {
	Snapshot       WriteSnapshot
	DiskVersion    file.DiskVersion
	ResyncRequired bool
}

type WriteExecutor func(WriteSnapshot) (file.DiskVersion, error)
type writePublisher func(CommittedWriteResult) error

// WriteCommitObserver observes the coordinator's disk-commit acknowledgement.
// It is intentionally separate from publication so evidence cannot substitute
// for or delay the production write path.
type WriteCommitObserver func(CommittedWriteResult, SaveOrigin)

// DocumentWriteCoordinator serializes replacement attempts for one document.
type DocumentWriteCoordinator struct {
	mu            sync.Mutex
	executor      WriteExecutor
	publisher     writePublisher
	lastCommitted *CommittedWriteResult
}

func NewDocumentWriteCoordinator(executor WriteExecutor, publishers ...writePublisher) *DocumentWriteCoordinator {
	var publisher writePublisher
	if len(publishers) > 0 {
		publisher = publishers[0]
	}
	return &DocumentWriteCoordinator{executor: executor, publisher: publisher}
}

func (coordinator *DocumentWriteCoordinator) Commit(snapshot WriteSnapshot) (CommittedWriteResult, error) {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()

	immutable := snapshot
	if snapshot.ExpectedDiskVersion != nil {
		version := *snapshot.ExpectedDiskVersion
		immutable.ExpectedDiskVersion = &version
	}
	if snapshot.EncodedData != nil {
		immutable.EncodedData = append([]byte(nil), snapshot.EncodedData...)
	}
	if coordinator.lastCommitted != nil && reusableCommit(*coordinator.lastCommitted, immutable) {
		return cloneCommittedWriteResult(*coordinator.lastCommitted), nil
	}
	version, err := coordinator.executor(immutable)
	if err != nil {
		var committedErr *committedWriteError
		if errors.As(err, &committedErr) {
			result := CommittedWriteResult{
				Snapshot:       immutable,
				DiskVersion:    committedErr.version,
				ResyncRequired: true,
			}
			if coordinator.publisher != nil && coordinator.publisher(result) != nil {
				result.ResyncRequired = true
			}
			coordinator.lastCommitted = committedWriteResultPointer(result)
			return result, committedErr.err
		}
		return CommittedWriteResult{}, err
	}
	result := CommittedWriteResult{Snapshot: immutable, DiskVersion: version}
	if coordinator.publisher != nil && coordinator.publisher(result) != nil {
		result.ResyncRequired = true
	}
	coordinator.lastCommitted = committedWriteResultPointer(result)
	return result, nil
}

// waitForIdle blocks until no replacement is in flight for this document.
//
// Taking the same mutex Commit holds is the whole wait, and it is deliberately
// a wait rather than a cancellation: AtomicReplace has no safe interruption
// point, so the close drain lets a running replacement finish instead of
// tearing the file it is replacing.
func (coordinator *DocumentWriteCoordinator) waitForIdle() {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
}

func reusableCommit(committed CommittedWriteResult, requested WriteSnapshot) bool {
	if committed.Snapshot.DocumentID != requested.DocumentID || committed.Snapshot.ContentRevision != requested.ContentRevision || committed.Snapshot.CanonicalContent != requested.CanonicalContent || committed.Snapshot.TargetPath != requested.TargetPath {
		return false
	}
	if requested.ExpectedDiskVersion == nil {
		return committed.Snapshot.ExpectedDiskVersion == nil
	}
	return committed.DiskVersion.Equal(*requested.ExpectedDiskVersion)
}

func committedWriteResultPointer(result CommittedWriteResult) *CommittedWriteResult {
	cloned := cloneCommittedWriteResult(result)
	return &cloned
}

func cloneCommittedWriteResult(result CommittedWriteResult) CommittedWriteResult {
	cloned := result
	cloned.Snapshot = cloneWriteSnapshot(result.Snapshot)
	return cloned
}

func cloneWriteSnapshot(snapshot WriteSnapshot) WriteSnapshot {
	cloned := snapshot
	if snapshot.ExpectedDiskVersion != nil {
		version := *snapshot.ExpectedDiskVersion
		cloned.ExpectedDiskVersion = &version
	}
	if snapshot.EncodedData != nil {
		cloned.EncodedData = append([]byte(nil), snapshot.EncodedData...)
	}
	return cloned
}
