package appmodel

import (
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// DocumentRecord is the single lifetime record for an open document. The state
// index is the only service-owned collection of live records; transient work
// belongs to the record it names and is released by dispose.
type DocumentRecord struct {
	id                      string
	identity                file.Identity
	canonicalPath           string
	bufferRevision          uint64
	committedRevision       uint64
	publicationCommitID     uint64
	writeQueue              *DocumentWriteCoordinator
	autosave                *autosaveTimerEntry
	autosaveInFlight        chan struct{}
	autosaveGeneration      uint64
	activationToken         string
	saveReservation         *saveReservation
	normalization           *normalizationAuthorization
	conflict                *documentConflict
	keepMine                map[string]*keepMineAuthorization
	metadata                apperr.DocumentMetadata
	content                 string
	baseline                string
	baselineVersion         file.DiskVersion
	baselineCharacteristics file.FileCharacteristics
	baselineOrigin          SaveOrigin
	failedWrite             bool
	detached                bool
	normalizationEnding     string
	baselineRawHash         string
	conflictBlocked         bool
	writeInFlight           bool
	closing                 bool
	hasSavedView            bool
}

// openDocument is retained as an internal spelling while the older lifecycle
// callers are migrated to the record owner.
type openDocument = DocumentRecord

// dispose is the one terminal path for an open document. Callers must have
// already drained accepted writes; the coordinator is then unreachable after
// this function returns.
func (service *AppModelService) dispose(documentID string) {
	document := service.state.documents[documentID]
	if document == nil {
		return
	}
	if document.autosave != nil {
		if document.autosave.timer != nil {
			document.autosave.timer.Stop()
		}
		document.autosave = nil
	}
	document.autosaveInFlight = nil
	document.writeQueue = nil
	document.activationToken = ""
	document.saveReservation = nil
	document.normalization = nil
	document.conflict = nil
	document.keepMine = nil
	document.id = ""
	document.identity = file.Identity{}
	document.canonicalPath = ""
	document.bufferRevision = 0
	document.committedRevision = 0
	document.publicationCommitID = 0
	document.metadata = apperr.DocumentMetadata{}
	document.content = ""
	document.baseline = ""
	document.baselineVersion = file.DiskVersion{}
	document.baselineCharacteristics = file.FileCharacteristics{}
	document.baselineOrigin = ""
	document.failedWrite = false
	document.detached = false
	document.normalizationEnding = ""
	document.baselineRawHash = ""
	document.conflictBlocked = false
	document.writeInFlight = false
	document.closing = false
	document.hasSavedView = false
	delete(service.state.documents, documentID)
}

func (service *AppModelService) clearClosingLocked(documentIDs []string) {
	for _, documentID := range documentIDs {
		if document := service.state.documents[documentID]; document != nil {
			document.closing = false
		}
	}
}

func (document *DocumentRecord) setBufferRevision(revision uint64) {
	document.bufferRevision = revision
}

func (document *DocumentRecord) effectiveMetadata() apperr.DocumentMetadata {
	metadata := document.metadata
	status := saveStatusForDocument((*openDocument)(document))
	metadata.Status = string(status)
	metadata.Dirty = status == SaveStatusUnsavedChanges
	metadata.Detached = document.detached
	metadata.ConflictBlocked = document.conflictBlocked
	metadata.WriteInFlight = document.writeInFlight
	return metadata
}

func normalizationAuthorizationForLocked(document *DocumentRecord, token string) (*normalizationAuthorization, bool) {
	if document == nil || document.normalization == nil || document.normalization.token != token {
		return nil, false
	}
	return document.normalization, true
}

// waitForIdle is intentionally kept next to the lifecycle disposal contract:
// no record may be disposed while its write queue can still own disk work.
func (service *AppModelService) waitForDocumentIdle(documentID string) {
	for {
		service.mu.RLock()
		document := service.state.documents[documentID]
		var queue *DocumentWriteCoordinator
		var autosaveDone chan struct{}
		if document != nil {
			queue = document.writeQueue
			autosaveDone = document.autosaveInFlight
		}
		service.mu.RUnlock()

		if document == nil {
			return
		}
		if queue != nil {
			queue.waitForIdle()
		}
		if autosaveDone != nil {
			<-autosaveDone
			continue
		}

		service.mu.RLock()
		current := service.state.documents[documentID]
		stillWriting := current != nil && current.writeInFlight
		service.mu.RUnlock()
		if !stillWriting {
			return
		}
		// A write can be accepted after the queue snapshot above and before its
		// first Commit call. Re-checking the model state prevents close from
		// treating that queue as idle and disposing its document prematurely.
		time.Sleep(time.Millisecond)
	}
}
