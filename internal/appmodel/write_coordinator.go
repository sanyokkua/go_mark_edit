package appmodel

import (
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
}

// CommittedWriteResult records disk truth even when projection publication needs recovery.
type CommittedWriteResult struct {
	Snapshot       WriteSnapshot
	DiskVersion    file.DiskVersion
	ResyncRequired bool
}

type WriteExecutor func(WriteSnapshot) (file.DiskVersion, error)
type WritePublisher func(CommittedWriteResult) error

// DocumentWriteCoordinator serializes replacement attempts for one document.
type DocumentWriteCoordinator struct {
	mu        sync.Mutex
	executor  WriteExecutor
	publisher WritePublisher
}

// WriteCoordinator is the concise contract-level name for a document coordinator.
type WriteCoordinator = DocumentWriteCoordinator

func NewDocumentWriteCoordinator(executor WriteExecutor, publishers ...WritePublisher) *DocumentWriteCoordinator {
	var publisher WritePublisher
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
	version, err := coordinator.executor(immutable)
	if err != nil {
		return CommittedWriteResult{}, err
	}
	result := CommittedWriteResult{Snapshot: immutable, DiskVersion: version}
	if coordinator.publisher != nil && coordinator.publisher(result) != nil {
		result.ResyncRequired = true
	}
	return result, nil
}
