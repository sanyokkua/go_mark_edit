package appmodel

import (
	"context"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

const maxOpenDocuments = 40

// NewDocument performs one revision-checked backend transition. It never
// creates a file or a recent-file entry; the returned acknowledgement is the
// only source payload that may be installed after the projection catches up.
func (service *AppModelService) NewDocument(ctx context.Context, expectedTabSetRevision uint64) apperr.DocumentTransitionOutcome {
	service.mu.Lock()
	defer service.mu.Unlock()

	if service.state.tabSetRevision != expectedTabSetRevision {
		return documentTransitionFailure(
			apperr.ClassifiedConflict,
			"The tab set changed; New must be retried.",
			apperr.RemediationRetry,
		)
	}
	if len(service.state.orderedDocumentIDs) >= maxOpenDocuments {
		return documentTransitionFailure(
			apperr.ClassifiedCapacityLimit,
			"The window already contains 40 documents.",
			apperr.RemediationCancel,
		)
	}

	before := service.snapshotLocked()
	documentID := mintDocumentID()
	document := newUntitledEditorDocument(documentID)
	service.state.documents[documentID] = document
	service.state.orderedDocumentIDs = append(service.state.orderedDocumentIDs, documentID)
	service.state.activeDocumentID = documentID
	service.state.tabSetRevision++
	patch := service.documentPatchLocked(documentID)
	if err := service.publishLocked(ctx, before, patch); err != nil {
		return documentTransitionFailure(
			apperr.ClassifiedIOFailure,
			"The new document could not be published.",
			apperr.RemediationRetry,
		)
	}

	return apperr.DocumentTransitionOutcome{Data: &apperr.ActiveBufferAcknowledgement{
		DocumentID:         documentID,
		DocumentRevision:   document.metadata.ContentRevision,
		ProjectionRevision: service.state.revision,
		Content:            document.content,
	}}
}

func newUntitledEditorDocument(documentID string) *openDocument {
	return &openDocument{
		metadata: apperr.DocumentMetadata{
			DocumentID:  documentID,
			Title:       "Untitled",
			DisplayName: "Untitled",
			Encoding:    "utf-8",
			BOM:         "absent",
			LineEnding:  "lf",
			Capability:  "writable",
			SizeClass:   "small",
			View: apperr.DocView{
				Arrangement:    ArrangementEditor,
				EditorVisible:  true,
				PreviewVisible: false,
				Cursor:         apperr.CursorPosition{Line: 1, Column: 1},
				Selection: apperr.SelectionRange{
					Start: apperr.CursorPosition{Line: 1, Column: 1},
					End:   apperr.CursorPosition{Line: 1, Column: 1},
				},
			},
		},
	}
}

func documentTransitionFailure(category apperr.ClassifiedErrorCategory, message string, remediation apperr.ClassifiedRemediation) apperr.DocumentTransitionOutcome {
	errorValue := apperr.NewClassifiedError(category, "Untitled", message, remediation, "")
	return apperr.DocumentTransitionOutcome{Error: &errorValue}
}
