package appmodel

import (
	"context"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

const autosaveDelay = time.Second

// AutosaveTimerFactory is the clock seam for the backend autosave debounce.
// Production uses time.AfterFunc; tests provide a deterministic fake clock.
type AutosaveTimerFactory interface {
	AfterFunc(time.Duration, func()) AutosaveTimer
}

// AutosaveTimer is the cancellable handle returned by AutosaveTimerFactory.
type AutosaveTimer interface {
	Stop() bool
}

type systemAutosaveTimerFactory struct{}

func (systemAutosaveTimerFactory) AfterFunc(delay time.Duration, callback func()) AutosaveTimer {
	return time.AfterFunc(delay, callback)
}

type autosaveTimerEntry struct {
	revision   uint64
	generation uint64
	timer      AutosaveTimer
}

// AutosaveEnabled reports whether the scheduler will debounce further writes.
// The preference is owned by settings and pushed in here by the composition
// root; this reads back what the document model is actually doing, which is the
// only thing worth asserting after the 2026-08-14 walkthrough found the switch
// and the behaviour disagreeing.
func (service *AppModelService) AutosaveEnabled() bool {
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.autosaveEnabled
}

func (service *AppModelService) SetAutosaveEnabled(enabled bool) {
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.autosaveEnabled == enabled {
		return
	}
	service.autosaveEnabled = enabled
	if enabled {
		return
	}
	for documentID := range service.state.documents {
		service.cancelAutosaveLocked(documentID)
	}
}

func (service *AppModelService) scheduleAutosave(documentID string, revision uint64) {
	service.mu.Lock()
	document := service.state.documents[documentID]
	if service.shutdownDraining || !service.autosaveEnabled || !service.autosaveEligibleLocked(documentID, revision) {
		service.cancelAutosaveLocked(documentID)
		service.mu.Unlock()
		return
	}

	service.cancelAutosaveLocked(documentID)
	document = service.state.documents[documentID]
	if document == nil {
		service.mu.Unlock()
		return
	}
	document.autosaveGeneration++
	generation := document.autosaveGeneration
	entry := &autosaveTimerEntry{revision: revision, generation: generation}
	document.autosave = entry
	timerFactory := service.autosaveTimer
	service.mu.Unlock()

	timer := timerFactory.AfterFunc(autosaveDelay, func() {
		service.runAutosave(documentID, revision, generation)
	})

	service.mu.Lock()
	if currentDocument := service.state.documents[documentID]; currentDocument != nil && currentDocument.autosave == entry {
		entry.timer = timer
	} else if timer != nil {
		timer.Stop()
	}
	service.mu.Unlock()
}

func (service *AppModelService) flushAutosave(documentID string) {
	service.flushAutosaveMode(documentID, false)
}

// flushAutosaveForClose turns a pending debounce into accepted synchronous
// work. Closing is the one boundary where cancelling a scheduled autosave
// would strand the latest working copy and incorrectly prompt the user.
func (service *AppModelService) flushAutosaveForClose(documentID string) {
	service.flushAutosaveMode(documentID, true)
}

func (service *AppModelService) flushAutosaveMode(documentID string, runScheduled bool) {
	for {
		service.mu.Lock()
		document := service.state.documents[documentID]
		var entry *autosaveTimerEntry
		var done chan struct{}
		if document != nil {
			entry = document.autosave
			done = document.autosaveInFlight
		}
		if entry != nil && done == nil {
			if !runScheduled {
				service.cancelAutosaveLocked(documentID)
				service.mu.Unlock()
				return
			}
			// A close is an accepted flush boundary: stopping
			// the debounce timer alone would strand the latest working copy.
			// Leave the entry visible while runAutosave claims it so a timer
			// callback racing this call cannot start a second write.
			if entry.timer != nil {
				entry.timer.Stop()
			}
			revision, generation := entry.revision, entry.generation
			service.mu.Unlock()
			service.runAutosave(documentID, revision, generation)
			// runAutosave declines a document that is no longer autosave-eligible
			// — detached, read-only, or its path cleared — and leaves the entry in
			// place when it declines. Looping on an entry nothing will ever claim
			// spins forever, which is a hung close rather than the completed flush
			// FR-FT-024 requires. If the entry survived, nothing can run it:
			// cancel the debounce and stop.
			service.mu.Lock()
			remainingDocument := service.state.documents[documentID]
			if remainingDocument != nil && remainingDocument.autosave == entry {
				service.cancelAutosaveLocked(documentID)
				service.mu.Unlock()
				return
			}
			service.mu.Unlock()
			continue
		}
		if entry != nil && done != nil {
			service.cancelAutosaveLocked(documentID)
		}
		service.mu.Unlock()
		if done != nil {
			<-done
			continue
		}
		return
	}
}

func (service *AppModelService) cancelAutosaveLocked(documentID string) {
	document := service.state.documents[documentID]
	if document == nil {
		return
	}
	entry := document.autosave
	if entry == nil {
		return
	}
	document.autosave = nil
	if entry.timer != nil {
		entry.timer.Stop()
	}
}

func (service *AppModelService) autosaveEligibleLocked(documentID string, revision uint64) bool {
	document := service.state.documents[documentID]
	if document == nil || document.metadata.ContentRevision != revision {
		return false
	}
	return document.metadata.Path != "" &&
		document.metadata.Capability == string(file.CapabilityWritable) &&
		!document.detached &&
		!document.closing
}

func (service *AppModelService) runAutosave(documentID string, revision, generation uint64) {
	service.mu.Lock()
	document := service.state.documents[documentID]
	var entry *autosaveTimerEntry
	if document != nil {
		entry = document.autosave
	}
	if entry == nil || entry.revision != revision || entry.generation != generation || !service.autosaveEnabled || !service.autosaveEligibleLocked(documentID, revision) {
		service.mu.Unlock()
		return
	}
	document.autosave = nil
	path := document.metadata.Path
	done := make(chan struct{})
	document.autosaveInFlight = done
	service.mu.Unlock()
	defer func() {
		service.mu.Lock()
		if current := service.state.documents[documentID]; current != nil && current.autosaveInFlight == done {
			current.autosaveInFlight = nil
			close(done)
		}
		service.mu.Unlock()
	}()

	ctx := service.runtimeContextOr(context.Background())
	if result := service.prepareWriteDisk(ctx, documentID, revision, ""); result.Status != "" {
		service.finishAutosave(ctx, documentID, result)
		return
	}
	service.mu.RLock()
	detached := service.state.documents[documentID] == nil || service.state.documents[documentID].detached
	service.mu.RUnlock()
	if detached {
		return
	}
	snapshot, result := service.snapshotForWrite(documentID, revision, "", path, false)
	if result.Status != "" {
		// A refused autosave must not leave an authorization behind. Autosave
		// passes an empty decision token, which never matches, so a mixed-ending
		// document takes the unauthorized branch and snapshotForWrite mints a
		// fresh single-use token to hand back with the refusal. Autosave has no
		// prompt to show and drops the result, so without this the token would
		// sit in service.normalizations for the process lifetime — one more for
		// every debounce that fired. CancelNormalization exists for exactly this.
		if result.DecisionToken != "" {
			service.CancelNormalization(documentID, result.DecisionToken)
		}
		service.finishAutosave(ctx, documentID, result)
		return
	}
	service.finishAutosave(ctx, documentID, service.executeWrite(ctx, snapshot, SaveOriginAutosave))
}

// finishAutosave closes or advances the per-document failure episode after an
// autosave attempt. The state mutation happens before the emitter call so two
// timer callbacks cannot both report the same category, while the emitter is
// still reached after the model lock is released.
func (service *AppModelService) finishAutosave(ctx context.Context, documentID string, result apperr.WriteResult) {
	if result.Status == apperr.WriteStatusCommitted {
		service.mu.Lock()
		if document := service.state.documents[documentID]; document != nil {
			document.autosaveFailureCategory = ""
		}
		service.mu.Unlock()
		return
	}
	if result.Error == nil {
		return
	}

	service.mu.Lock()
	document := service.state.documents[documentID]
	if document == nil || document.autosaveFailureCategory == string(result.Error.Category) {
		service.mu.Unlock()
		return
	}
	document.autosaveFailureCategory = string(result.Error.Category)
	service.mu.Unlock()

	service.emitAsyncError(ctx, apperr.ClassifiedToWire(result.Error), "autosave failure could not be surfaced")
}
