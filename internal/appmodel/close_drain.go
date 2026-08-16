package appmodel

import (
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

/*
 * DrainBeforeClose is the process-scoped half of FR-FT-027's shutdown sequence:
 * cancel in-flight long operations and drain accepted layout, editor, and
 * autosave work, all of it before a one-use native close permit can exist.
 *
 * Until T134 shutdown drained one of the three. AuthorizeQuit called
 * FlushBeforeClose, whose entire body was FlushPendingUILayout — the SQLite
 * layout intent and nothing else. A debounced autosave that the user had
 * already earned was left armed on a timer the process was about to destroy,
 * and an explicit Save still inside AtomicReplace was neither waited for nor
 * cancelled. Both losses are silent: the permit is created, native Quit runs,
 * and the accepted revision simply never reaches disk.
 *
 * PrepareClose is the tab-scoped form of the same three steps and this copies
 * its shape deliberately, so the two cannot drift.
 *
 * The two halves of the requirement land on different mechanisms, and the
 * difference is not stylistic:
 *
 *   - Accepted autosave work is *run*. flushAutosaveForClose turns a pending
 *     debounce into a synchronous write, which is the only thing that stops a
 *     close from stranding the latest working copy.
 *   - An in-flight write is *waited for*, never cancelled. AtomicReplace has no
 *     safe interruption point; a close that cut one short would leave the very
 *     torn file the atomic path exists to prevent.
 *   - Work that can no longer run is *cancelled*. flushAutosaveForClose already
 *     does this for a document that has become autosave-ineligible, and that is
 *     the "cancel in-flight long operations" clause: the only cancellable
 *     long-running work this backend owns is debounced work whose document no
 *     longer qualifies for it.
 *
 * A failure returns the classified io-failure with Retry that the requirement
 * names. The caller must create no permit on a non-nil return.
 */
func (service *AppModelService) DrainBeforeClose() *apperr.ClassifiedError {
	for _, documentID := range service.openDocumentIDs() {
		service.flushAutosaveForClose(documentID)
		service.waitForWriteInFlight(documentID)
	}
	// Layout last. An autosave that has just completed can still publish state,
	// and persisting the layout intent after the editor work has settled is what
	// makes the drain's own ordering match FR-FT-027's "layout, editor, and
	// autosave work" as one boundary rather than three racing ones.
	if err := service.FlushPendingUILayout(); err != nil {
		classified := apperr.NewClassifiedError(
			apperr.ClassifiedIOFailure,
			"native close",
			"The application could not finish saving pending work before closing.",
			apperr.RemediationRetry,
			"",
		)
		return &classified
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
	service.mu.RLock()
	coordinator := service.writeCoordinators[documentID]
	service.mu.RUnlock()
	if coordinator == nil {
		return
	}
	coordinator.waitForIdle()
}
