package appmodel

import (
	"context"
	"time"

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
	for documentID := range service.autosaveTimers {
		service.cancelAutosaveLocked(documentID)
	}
}

// NewAppModelServiceWithAutosaveTimer exposes the injected-clock constructor
// used by lifecycle tests without changing the production composition root.
func NewAppModelServiceWithAutosaveTimer(emitter StatePatchEmitter, timer AutosaveTimerFactory) *AppModelService {
	service := NewAppModelService(emitter)
	if timer != nil {
		service.mu.Lock()
		service.autosaveTimer = timer
		service.mu.Unlock()
	}
	return service
}

func (service *AppModelService) scheduleAutosave(documentID string, revision uint64) {
	service.mu.Lock()
	if !service.autosaveEnabled || !service.autosaveEligibleLocked(documentID, revision) {
		service.cancelAutosaveLocked(documentID)
		service.mu.Unlock()
		return
	}

	service.cancelAutosaveLocked(documentID)
	service.autosaveGeneration++
	generation := service.autosaveGeneration
	entry := &autosaveTimerEntry{revision: revision, generation: generation}
	service.autosaveTimers[documentID] = entry
	timerFactory := service.autosaveTimer
	service.mu.Unlock()

	timer := timerFactory.AfterFunc(autosaveDelay, func() {
		service.runAutosave(documentID, revision, generation)
	})

	service.mu.Lock()
	if current := service.autosaveTimers[documentID]; current == entry {
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
		entry := service.autosaveTimers[documentID]
		done := service.autosaveInFlight[documentID]
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
	entry := service.autosaveTimers[documentID]
	if entry == nil {
		return
	}
	delete(service.autosaveTimers, documentID)
	if entry.timer != nil {
		entry.timer.Stop()
	}
}

func (service *AppModelService) autosaveEligibleLocked(documentID string, revision uint64) bool {
	document, ok := service.state.documents[documentID]
	if !ok || document.metadata.ContentRevision != revision {
		return false
	}
	return document.metadata.Path != "" &&
		document.metadata.Capability == string(file.CapabilityWritable) &&
		!document.detached
}

func (service *AppModelService) runAutosave(documentID string, revision, generation uint64) {
	service.mu.Lock()
	entry, scheduled := service.autosaveTimers[documentID]
	if !scheduled || entry.revision != revision || entry.generation != generation || !service.autosaveEnabled || !service.autosaveEligibleLocked(documentID, revision) {
		service.mu.Unlock()
		return
	}
	delete(service.autosaveTimers, documentID)
	path := service.state.documents[documentID].metadata.Path
	done := make(chan struct{})
	service.autosaveInFlight[documentID] = done
	service.mu.Unlock()
	defer func() {
		service.mu.Lock()
		if service.autosaveInFlight[documentID] == done {
			delete(service.autosaveInFlight, documentID)
			close(done)
		}
		service.mu.Unlock()
	}()

	ctx := service.runtimeContextOr(context.Background())
	if result := service.prepareWriteDisk(ctx, documentID, revision, ""); result.Status != "" {
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
		return
	}
	_ = service.executeWrite(ctx, snapshot, SaveOriginAutosave)
}
