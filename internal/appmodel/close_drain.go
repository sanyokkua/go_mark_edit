package appmodel

import "github.com/sanyokkua/go_mark_edit/internal/apperr"

/*
 * DrainBeforeClose finishes accepted autosave, editor, and layout work before a
 * one-use native close permit can exist. Pending debounced work is flushed,
 * in-flight writes are awaited, and ineligible work is cancelled. Layout is
 * flushed when possible; a layout failure is logged and does not block close.
 */
func (service *AppModelService) DrainBeforeClose() *apperr.ClassifiedError {
	for _, documentID := range service.openDocumentIDs() {
		service.flushAutosaveForClose(documentID)
		service.waitForWriteInFlight(documentID)
	}
	// Layout last. An autosave that has just completed can still publish state,
	// and persisting the layout intent after the editor work has settled is what
	// makes the drain's own ordering match the required "layout, editor, and
	// autosave work" as one boundary rather than three racing ones.
	return service.drainCloseLayout()
}

// DrainDiscardBeforeClose waits accepted work without starting held autosaves.
func (service *AppModelService) DrainDiscardBeforeClose() *apperr.ClassifiedError {
	for _, documentID := range service.openDocumentIDs() {
		service.waitForWriteInFlight(documentID)
	}
	return service.drainCloseLayout()
}

func (service *AppModelService) drainCloseLayout() *apperr.ClassifiedError {
	service.mu.Lock()
	service.layoutCloseDrains++
	service.mu.Unlock()
	defer func() {
		service.mu.Lock()
		service.layoutCloseDrains--
		service.mu.Unlock()
	}()
	if err := service.FlushPendingUILayout(); err != nil {
		service.mu.Lock()
		service.pending = nil
		service.mu.Unlock()
		service.logger.Error().Err(err).Msg("layout persistence failed during close; pending layout discarded")
	}
	return nil
}

// openDocumentIDs copies the authoritative tab order so the drain can release
// the model lock before doing any work under it. service.mu is not reentrant
// and every step of the drain takes it again.
func (service *AppModelService) openDocumentIDs() []string {
	service.mu.RLock()
	defer service.mu.RUnlock()
	return append([]string(nil), service.state.orderedDocumentIDs...)
}

// waitForWriteInFlight blocks until no atomic replacement is running for this
// document. A document that has never been written has no coordinator yet, and
// nothing to wait for.
func (service *AppModelService) waitForWriteInFlight(documentID string) {
	service.waitForDocumentIdle(documentID)
}
