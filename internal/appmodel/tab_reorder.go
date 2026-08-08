package appmodel

import (
	"context"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// ReorderDocument accepts one-position moves only. Edge requests are explicit
// successful no-ops so a drag/keyboard caller cannot invent a local projection.
func (service *AppModelService) ReorderDocument(ctx context.Context, documentID string, targetIndex int, expectedTabSetRevision uint64) apperr.TabTransitionOutcome {
	service.mu.Lock()
	defer service.mu.Unlock()

	if service.state.tabSetRevision != expectedTabSetRevision {
		return tabTransitionFailure(apperr.ClassifiedConflict, documentID, "The tab set changed; reorder must be retried.", apperr.RemediationRetry)
	}
	index := indexOfDocument(service.state.orderedDocumentIDs, documentID)
	if index < 0 {
		return tabTransitionFailure(apperr.ClassifiedNotFound, documentID, "The document is no longer open.", apperr.RemediationCancel)
	}
	if targetIndex == index || (index == 0 && targetIndex == -1) || (index == len(service.state.orderedDocumentIDs)-1 && targetIndex == len(service.state.orderedDocumentIDs)) {
		return service.tabTransitionSuccess(apperr.TabTransitionNoop, documentID)
	}
	if targetIndex < 0 || targetIndex >= len(service.state.orderedDocumentIDs) || targetIndex < index-1 || targetIndex > index+1 {
		return tabTransitionFailure(apperr.ClassifiedUnsupportedInput, documentID, "The requested tab position is invalid.", apperr.RemediationCancel)
	}

	before := service.snapshotLocked()
	if targetIndex < index {
		service.state.orderedDocumentIDs[index-1], service.state.orderedDocumentIDs[index] = service.state.orderedDocumentIDs[index], service.state.orderedDocumentIDs[index-1]
	} else {
		service.state.orderedDocumentIDs[index], service.state.orderedDocumentIDs[index+1] = service.state.orderedDocumentIDs[index+1], service.state.orderedDocumentIDs[index]
	}
	service.state.tabSetRevision++
	service.state.revision++
	if err := service.publishLocked(ctx, before, service.tabStatePatchLocked()); err != nil {
		return tabTransitionFailure(apperr.ClassifiedIOFailure, documentID, "The tab order could not be published.", apperr.RemediationRetry)
	}
	return service.tabTransitionSuccess(apperr.TabTransitionReordered, documentID)
}

func (service *AppModelService) tabStatePatchLocked() apperr.AppStatePatch {
	return apperr.AppStatePatch{
		Revision:           service.state.revision,
		TabSetRevision:     pointerTo(service.state.tabSetRevision),
		OrderedDocumentIDs: append([]string(nil), service.state.orderedDocumentIDs...),
		ActiveDocument:     activeDocumentPatch(service.state.activeDocumentID),
	}
}

func (service *AppModelService) tabTransitionSuccess(status apperr.TabTransitionStatus, documentID string) apperr.TabTransitionOutcome {
	result := apperr.TabTransitionOutcome{
		Status: status, DocumentID: documentID, ProjectionRevision: service.state.revision,
		TabSetRevision: service.state.tabSetRevision, OrderedDocumentIDs: append([]string(nil), service.state.orderedDocumentIDs...),
		ActiveDocumentID: service.state.activeDocumentID,
	}
	if service.state.activeDocumentID != "" {
		if document, ok := service.state.documents[service.state.activeDocumentID]; ok {
			result.ActiveBuffer = &apperr.ActiveBufferAcknowledgement{
				DocumentID: service.state.activeDocumentID, DocumentRevision: document.metadata.ContentRevision,
				ProjectionRevision: service.state.revision, Content: document.content,
			}
		}
	}
	return result
}

func tabTransitionFailure(category apperr.ClassifiedErrorCategory, subject, message string, remediation apperr.ClassifiedRemediation) apperr.TabTransitionOutcome {
	classified := apperr.NewClassifiedError(category, subject, message, remediation, subject)
	return apperr.TabTransitionOutcome{Status: apperr.TabTransitionRefused, DocumentID: subject, Error: &classified}
}
