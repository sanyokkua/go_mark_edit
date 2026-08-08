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
		return documentTransitionClassified(apperr.ClassifiedNotFound, documentID, "The document is no longer open.", apperr.RemediationCancel)
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

func (service *AppModelService) attachForegroundConflict(ctx context.Context, documentID string, outcome apperr.DocumentTransitionOutcome) apperr.DocumentTransitionOutcome {
	checked := service.CheckExternalChanges(ctx, documentID)
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
	defer service.mu.Unlock()

	if service.state.tabSetRevision != expectedTabSetRevision {
		return tabTransitionFailure(apperr.ClassifiedConflict, documentID, "The tab set changed; close must be retried.", apperr.RemediationRetry)
	}
	if _, exists := service.state.documents[documentID]; !exists {
		return tabTransitionFailure(apperr.ClassifiedNotFound, documentID, "The document is no longer open.", apperr.RemediationCancel)
	}

	before := service.snapshotLocked()
	deleteTokensForDocument(service.keepMine, documentID)
	service.removeConflictLocked(documentID)
	index := indexOfDocument(service.state.orderedDocumentIDs, documentID)
	delete(service.state.documents, documentID)
	service.state.orderedDocumentIDs = append(service.state.orderedDocumentIDs[:index], service.state.orderedDocumentIDs[index+1:]...)
	if service.state.activeDocumentID == documentID {
		service.state.activeDocumentID = ""
		if len(service.state.orderedDocumentIDs) > 0 {
			if index < len(service.state.orderedDocumentIDs) {
				service.state.activeDocumentID = service.state.orderedDocumentIDs[index]
			} else {
				service.state.activeDocumentID = service.state.orderedDocumentIDs[len(service.state.orderedDocumentIDs)-1]
			}
		}
	}
	if closedPath := before.documents[documentID].metadata.Path; closedPath != "" {
		service.rememberClosedLocked(closedPath, before.documents[documentID])
	}
	service.state.canReopenLastFile = len(service.state.recentlyClosed) > 0
	service.state.tabSetRevision++
	service.state.revision++
	patch := service.tabStatePatchLocked()
	patch.Documents = &apperr.DocumentsPatch{Remove: []string{documentID}}
	patch.RecentFiles = append([]string(nil), service.state.recentFiles...)
	patch.CanReopenLastFile = pointerTo(service.state.canReopenLastFile)
	if err := service.publishLocked(ctx, before, patch); err != nil {
		return tabTransitionFailure(apperr.ClassifiedIOFailure, documentID, "The document could not be closed.", apperr.RemediationRetry)
	}
	return service.tabTransitionSuccess(apperr.TabTransitionClosed, documentID)
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

func indexOfDocument(order []string, documentID string) int {
	for index, candidate := range order {
		if candidate == documentID {
			return index
		}
	}
	return -1
}
