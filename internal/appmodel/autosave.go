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
	arm        uint64
	armed      bool
	elapsed    bool
}

type autosaveRunResult uint8

const (
	autosaveUnusable autosaveRunResult = iota
	autosaveClaimed
	autosaveBusy
	autosaveFenced
)

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
	if document != nil && document.metadata.ContentRevision != revision {
		service.mu.Unlock()
		return
	}
	if (service.shutdownDraining && !service.shutdownDiscarding) || !service.autosaveEnabled || !service.autosaveEligibleLocked(documentID, revision) {
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
	service.mu.Unlock()
	service.resumeAutosave(documentID)
}

// resumeAutosave owns timer installation and tolerates synchronous callbacks.
func (service *AppModelService) resumeAutosave(documentID string) {
	service.mu.Lock()
	document := service.state.documents[documentID]
	if document == nil || document.autosave == nil || service.shutdownDraining {
		service.mu.Unlock()
		return
	}
	entry := document.autosave
	if entry.elapsed {
		if document.autosaveInFlight != nil {
			service.mu.Unlock()
			return
		}
		revision, generation := entry.revision, entry.generation
		service.mu.Unlock()
		go service.runAutosave(documentID, revision, generation)
		return
	}
	if entry.armed {
		service.mu.Unlock()
		return
	}
	entry.arm++
	token := entry.arm
	entry.armed = true
	factory := service.autosaveTimer
	service.mu.Unlock()
	timer := factory.AfterFunc(autosaveDelay, func() {
		service.mu.Lock()
		current := service.state.documents[documentID]
		if current == nil || current.autosave != entry || !entry.armed || entry.arm != token {
			service.mu.Unlock()
			return
		}
		entry.armed = false
		entry.timer = nil
		entry.elapsed = true
		service.mu.Unlock()
		service.runAutosave(documentID, entry.revision, entry.generation)
	})
	service.mu.Lock()
	if current := service.state.documents[documentID]; current != nil && current.autosave == entry && entry.armed && entry.arm == token && !service.shutdownDraining {
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
		if service.shutdownDiscarding {
			service.mu.Unlock()
			return
		}
		entry, done := service.autosavePendingLocked(documentID)
		if entry != nil && !runScheduled {
			service.cancelAutosaveLocked(documentID)
		}
		if entry != nil && done == nil && runScheduled {
			if service.flushScheduledAutosave(documentID, entry) {
				return
			}
			continue
		}
		service.mu.Unlock()
		if done != nil {
			<-done
			continue
		}
		return
	}
}

func (service *AppModelService) autosavePendingLocked(documentID string) (*autosaveTimerEntry, chan struct{}) {
	document := service.state.documents[documentID]
	if document == nil {
		return nil, nil
	}
	return document.autosave, document.autosaveInFlight
}

// flushScheduledAutosave releases the model lock around the write and
// returns whether the surviving intent was permanently unusable.
func (service *AppModelService) flushScheduledAutosave(documentID string, entry *autosaveTimerEntry) bool {
	// Keep the entry visible until runAutosave claims it so a racing timer
	// cannot start a second write.
	if entry.timer != nil {
		entry.timer.Stop()
	}
	revision, generation := entry.revision, entry.generation
	service.mu.Unlock()
	outcome := service.runAutosave(documentID, revision, generation)
	service.mu.Lock()
	remainingDocument := service.state.documents[documentID]
	// A permanently ineligible entry cannot be claimed; keeping it would spin
	// the close flush forever. A fenced claim may still be restored instead.
	unusable := service.cancelUnusableAutosaveLocked(documentID, remainingDocument, entry, outcome)
	service.mu.Unlock()
	return unusable
}

// cancelUnusableAutosaveLocked drops only a permanently unusable intent. A
// claimed attempt can restore the same entry after a discard fence ends.
func (service *AppModelService) cancelUnusableAutosaveLocked(documentID string, document *DocumentRecord, entry *autosaveTimerEntry, outcome autosaveRunResult) bool {
	if document == nil || document.autosave != entry || document.autosaveInFlight != nil || service.shutdownDiscarding || outcome != autosaveUnusable {
		return false
	}
	service.cancelAutosaveLocked(documentID)
	return true
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
	entry.arm++
	entry.armed = false
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
		document.metadata.LineEnding != string(file.LineEndingMixed) &&
		document.metadata.Capability == string(file.CapabilityWritable) &&
		!document.detached &&
		!document.closing
}

func (service *AppModelService) runAutosave(documentID string, revision, generation uint64) autosaveRunResult {
	service.mu.Lock()
	document := service.state.documents[documentID]
	var entry *autosaveTimerEntry
	if document != nil {
		entry = document.autosave
	}
	if service.shutdownDiscarding {
		service.mu.Unlock()
		return autosaveFenced
	}
	if entry == nil || entry.revision != revision || entry.generation != generation || !service.autosaveEnabled || !service.autosaveEligibleLocked(documentID, revision) {
		service.mu.Unlock()
		return autosaveUnusable
	}
	if document.autosaveInFlight != nil {
		entry.elapsed = true
		service.mu.Unlock()
		return autosaveBusy
	}
	document.autosave = nil
	path := document.metadata.Path
	done := make(chan struct{})
	document.autosaveInFlight = done
	claimEpoch := service.discardEpoch
	service.mu.Unlock()
	committed := false
	defer func() { service.completeAutosaveClaim(documentID, revision, entry, done, claimEpoch, committed) }()

	ctx := service.runtimeContextOr(context.Background())
	if result := service.prepareWriteDisk(ctx, documentID, revision, ""); result.Status != "" {
		service.finishAutosaveUnlessFenced(ctx, documentID, claimEpoch, result)
		return autosaveClaimed
	}
	service.mu.RLock()
	detached := service.state.documents[documentID] == nil || service.state.documents[documentID].detached
	service.mu.RUnlock()
	if detached {
		return autosaveClaimed
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
		service.finishAutosaveUnlessFenced(ctx, documentID, claimEpoch, result)
		return autosaveClaimed
	}
	writeResult := service.executeWrite(ctx, snapshot, SaveOriginAutosave)
	committed = writeResult.Status == apperr.WriteStatusCommitted
	service.mu.Lock()
	fenced := service.shutdownDiscarding || service.discardEpoch != claimEpoch
	service.mu.Unlock()
	if !fenced || committed {
		service.finishAutosave(ctx, documentID, writeResult)
	}
	return autosaveClaimed
}

func (service *AppModelService) completeAutosaveClaim(documentID string, revision uint64, entry *autosaveTimerEntry, done chan struct{}, claimEpoch uint64, committed bool) {
	service.mu.Lock()
	if current := service.state.documents[documentID]; current != nil {
		if !committed && (service.shutdownDiscarding || service.discardEpoch != claimEpoch) && current.autosave == nil && service.autosaveEligibleLocked(documentID, revision) {
			entry.elapsed = true
			current.autosave = entry
		}
		if current.autosaveInFlight == done {
			current.autosaveInFlight = nil
		}
	}
	close(done)
	service.mu.Unlock()
	service.resumeAutosave(documentID)
}

func (service *AppModelService) finishAutosaveUnlessFenced(ctx context.Context, documentID string, epoch uint64, result apperr.WriteResult) {
	service.mu.RLock()
	fenced := service.shutdownDiscarding || service.discardEpoch != epoch
	service.mu.RUnlock()
	if !fenced {
		service.finishAutosave(ctx, documentID, result)
	}
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
		service.emitCommittedSaveWarning(ctx, result)
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
