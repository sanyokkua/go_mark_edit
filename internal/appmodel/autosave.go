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
	service.mu.Lock()
	service.cancelAutosaveLocked(documentID)
	done := service.autosaveInFlight[documentID]
	service.mu.Unlock()
	if done != nil {
		<-done
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

	ctx := context.Background()
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
		return
	}
	_ = service.executeWrite(ctx, snapshot, SaveOriginAutosave)
}
