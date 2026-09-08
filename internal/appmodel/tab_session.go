package appmodel

import (
	"context"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// ActivateDocument changes only the backend-owned active identity. The returned
// acknowledgement is the sole source payload that may be installed by a caller.
func (service *AppModelService) ActivateDocument(ctx context.Context, documentID string, expectedTabSetRevision uint64) apperr.DocumentTransitionOutcome {
	service.mu.Lock()

	if service.state.tabSetRevision != expectedTabSetRevision {
		service.mu.Unlock()
		return documentTransitionClassified(apperr.ClassifiedConflict, documentID, "The tab set changed; activation must be retried.", apperr.RemediationRetry)
	}
	document, exists := service.state.documents[documentID]
	if !exists {
		service.mu.Unlock()
		return documentTransitionClassified(apperr.ClassifiedNotFound, documentID, "The document is no longer open.", apperr.RemediationNone)
	}
	if service.state.activeDocumentID == documentID {
		outcome := activeDocumentTransition(documentID, service.state.revision, document)
		service.mu.Unlock()
		return service.attachForegroundConflict(ctx, documentID, outcome)
	}

	before := service.snapshotLocked()
	service.state.activeDocumentID = documentID
	service.state.tabSetRevision++
	patch := service.documentPatchLocked(documentID)
	if err := service.publishLocked(ctx, before, patch); err != nil {
		service.mu.Unlock()
		return documentTransitionClassified(apperr.ClassifiedIOFailure, documentID, "The active document could not be published.", apperr.RemediationRetry)
	}
	outcome := activeDocumentTransition(documentID, service.state.revision, document)
	service.mu.Unlock()
	return service.attachForegroundConflict(ctx, documentID, outcome)
}

// attachForegroundConflict is FR-FT-020's tab-activation occasion, which is why
// it goes through CheckDocumentDisk: the requirement lists "tab activation and
// window focus or resume" as separate events, and the two aliases exist so each
// occasion reads as itself at its call site. Window focus and resume cannot be
// observed here at all — Wails v2 exposes no such lifecycle hook — so that half
// enters through the handler, which routes to ForegroundCheck.
func (service *AppModelService) attachForegroundConflict(ctx context.Context, documentID string, outcome apperr.DocumentTransitionOutcome) apperr.DocumentTransitionOutcome {
	checked := service.CheckDocumentDisk(ctx, documentID)
	if checked.Status == apperr.ConflictStatusDetected {
		outcome.Conflict = checked.Preview
	}
	return outcome
}

func activeDocumentTransition(documentID string, projectionRevision uint64, document *openDocument) apperr.DocumentTransitionOutcome {
	return apperr.DocumentTransitionOutcome{Data: &apperr.ActiveBufferAcknowledgement{
		DocumentID: documentID, DocumentRevision: document.metadata.ContentRevision,
		ProjectionRevision: projectionRevision, Content: document.content,
	}}
}

func documentTransitionClassified(category apperr.ClassifiedErrorCategory, subject, message string, remediation apperr.ClassifiedRemediation) apperr.DocumentTransitionOutcome {
	classified := apperr.NewClassifiedError(category, subject, message, remediation, subject)
	return apperr.DocumentTransitionOutcome{Error: &classified}
}

// CloseDocument removes one backend-owned tab and selects the next tab at the
// same insertion point, or the previous tab when the closed tab was last.
func (service *AppModelService) CloseDocument(ctx context.Context, documentID string, expectedTabSetRevision uint64) apperr.TabTransitionOutcome {
	service.mu.Lock()
	if service.state.tabSetRevision != expectedTabSetRevision {
		service.mu.Unlock()
		return tabTransitionFailure(apperr.ClassifiedConflict, documentID, "The tab set changed; close must be retried.", apperr.RemediationRetry)
	}
	if _, exists := service.state.documents[documentID]; !exists {
		service.mu.Unlock()
		return tabTransitionFailure(apperr.ClassifiedNotFound, documentID, "The document is no longer open.", apperr.RemediationNone)
	}
	service.mu.Unlock()

	// FR-FT-024: a pending working-copy flush must complete before the document
	// is removed. Evaluating Dirty first refused a tab whose autosave debounce
	// was still pending, prompting for work the application had already accepted
	// and was about to write. Running it synchronously is what turns that into a
	// silent clean close, which is why PrepareClose has always flushed here.
	service.flushAutosaveForClose(documentID)

	service.mu.Lock()
	if service.state.tabSetRevision != expectedTabSetRevision {
		service.mu.Unlock()
		return tabTransitionFailure(apperr.ClassifiedConflict, documentID, "The tab set changed; close must be retried.", apperr.RemediationRetry)
	}
	document, exists := service.state.documents[documentID]
	if !exists {
		service.mu.Unlock()
		return tabTransitionFailure(apperr.ClassifiedNotFound, documentID, "The document is no longer open.", apperr.RemediationNone)
	}
	// Still dirty after the flush means there was nothing accepted to write, or
	// the write did not clean the document — either way it needs a close plan.
	// writeInFlight can only be a concurrent explicit save now, since the flush
	// above waits out any autosave; removing the document mid-write is what this
	// still refuses.
	if service.effectiveDocumentMetadataLocked(document).Dirty || document.writeInFlight {
		service.mu.Unlock()
		return tabTransitionFailure(apperr.ClassifiedConflict, documentID, "The document has unsaved changes; prepare a close plan first.", apperr.RemediationRetry)
	}
	service.mu.Unlock()
	return service.closeDocuments(ctx, []string{documentID}, &expectedTabSetRevision)
}

func (service *AppModelService) rememberClosedLocked(path string, document *openDocument) {
	identity := document.canonicalIdentity
	entry := recentlyClosedDocument{path: path, identity: identity, view: document.metadata.View}
	filtered := make([]recentlyClosedDocument, 0, 41)
	filtered = append(filtered, entry)
	for _, existing := range service.state.recentlyClosed {
		if existing.path == path || (identity != "" && existing.identity == identity) {
			continue
		}
		if len(filtered) == 40 {
			break
		}
		filtered = append(filtered, existing)
	}
	service.state.recentlyClosed = filtered
}

func (service *AppModelService) removeClosedEntryLocked(path string) {
	filtered := service.state.recentlyClosed[:0]
	for _, entry := range service.state.recentlyClosed {
		if entry.path != path {
			filtered = append(filtered, entry)
		}
	}
	service.state.recentlyClosed = filtered
	service.state.canReopenLastFile = len(filtered) > 0
}

func (service *AppModelService) consumeClosedEntry(ctx context.Context, path string) {
	service.mu.Lock()
	before := service.snapshotLocked()
	service.removeClosedEntryLocked(path)
	service.state.revision++
	patch := apperr.AppStatePatch{Revision: service.state.revision, CanReopenLastFile: pointerTo(service.state.canReopenLastFile)}
	_ = service.publishLocked(ctx, before, patch)
	service.mu.Unlock()
}

func indexOfDocument(order []string, documentID string) int {
	for index, candidate := range order {
		if candidate == documentID {
			return index
		}
	}
	return -1
}
