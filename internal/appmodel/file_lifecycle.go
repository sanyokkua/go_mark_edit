package appmodel

import (
	"context"
	"fmt"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

const maxOpenDocuments = 40

const (
	OpenModeEditor      = "editor"
	OpenModeViewer      = "viewer"
	OpenStatusCancelled = apperr.OpenStatusCancelled
	OpenStatusFocused   = apperr.OpenStatusFocused
	OpenStatusOpened    = apperr.OpenStatusOpened
	OpenStatusRefused   = apperr.OpenStatusRefused
)

// DocumentOpenDialog is the only native dependency needed by OpenFromDialog.
type DocumentOpenDialog interface {
	ChooseOpenFile(context.Context) (string, error)
}

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

// OpenPath is the synchronous convenience command used by tests and the later handler wiring. It
// still runs through the prepare/commit reservation boundary so selection itself cannot mutate tabs.
func (service *AppModelService) OpenPath(ctx context.Context, path string, expectedTabSetRevision uint64) apperr.OpenOutcome {
	if strings.TrimSpace(path) == "" {
		return apperr.OpenOutcome{Status: apperr.OpenStatusCancelled}
	}
	preparation, classified := service.PrepareOpen(ctx, path, expectedTabSetRevision)
	if classified != nil {
		return apperr.OpenOutcome{Status: apperr.OpenStatusRefused, Error: classified}
	}
	return service.CommitPreparedOpen(ctx, preparation.ReservationID)
}

// PrepareOpen canonicalizes and classifies a path while reserving identity and capacity, without
// activating or publishing any document state.
func (service *AppModelService) PrepareOpen(ctx context.Context, path string, expectedTabSetRevision uint64) (OpenPreparation, *apperr.ClassifiedError) {
	service.mu.RLock()
	if service.state.tabSetRevision != expectedTabSetRevision {
		service.mu.RUnlock()
		return OpenPreparation{}, classifiedOpenError(apperr.ClassifiedConflict, "The tab set changed; Open must be retried.", apperr.RemediationRetry)
	}
	metadataRepository := service.metadata
	defaultMode := service.defaultOpenMode
	fallbackArrangement := ""
	if service.state.ui.ViewArrangement != nil {
		fallbackArrangement = *service.state.ui.ViewArrangement
	}
	service.mu.RUnlock()

	read, readErr := file.ReadClassifiedDocument(path)
	if readErr != nil {
		return OpenPreparation{}, classifiedOpenError(apperr.ClassifiedIOFailure, "The document could not be read.", apperr.RemediationRetry)
	}
	if read.Error != nil {
		return OpenPreparation{}, read.Error
	}
	arrangement := openArrangement(defaultMode, fallbackArrangement)
	if metadataRepository != nil && defaultMode == OpenModeEditor {
		if persisted, found, err := metadataRepository.ReadArrangement(ctx, read.CanonicalPath.Path); err == nil && found {
			arrangement = persisted
		}
	}

	service.mu.Lock()
	defer service.mu.Unlock()
	if service.state.tabSetRevision != expectedTabSetRevision {
		return OpenPreparation{}, classifiedOpenError(apperr.ClassifiedConflict, "The tab set changed; Open must be retried.", apperr.RemediationRetry)
	}
	identity := read.CanonicalPath.Identity
	for _, reservation := range service.reservations {
		if reservation.identity == identity {
			return OpenPreparation{ReservationID: reservation.id}, nil
		}
	}
	existingDocumentID := ""
	for documentID, document := range service.state.documents {
		if document.canonicalIdentity == identity || (identity == "path:"+document.metadata.Path && document.metadata.Path != "") {
			existingDocumentID = documentID
			break
		}
	}
	novelReservations := countNovelReservations(service.reservations)
	if existingDocumentID == "" && len(service.state.documents)+novelReservations >= maxOpenDocuments {
		return OpenPreparation{}, classifiedOpenError(apperr.ClassifiedCapacityLimit, "The window already contains 40 documents.", apperr.RemediationCancel)
	}
	reservationID := mintDocumentID()
	service.reservations[reservationID] = &openReservation{
		id: reservationID, identity: identity, expectedTabRevision: expectedTabSetRevision,
		canonical: read.CanonicalPath, read: read, existingDocumentID: existingDocumentID, arrangement: arrangement,
	}
	return OpenPreparation{ReservationID: reservationID}, nil
}

// CancelPreparedOpen releases a pending identity and reserved capacity.
func (service *AppModelService) CancelPreparedOpen(reservationID string) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	if _, ok := service.reservations[reservationID]; !ok {
		return fmt.Errorf("open reservation not found")
	}
	delete(service.reservations, reservationID)
	return nil
}

// CommitPreparedOpen revalidates the tab revision and applies exactly one Open transition.
func (service *AppModelService) CommitPreparedOpen(ctx context.Context, reservationID string) apperr.OpenOutcome {
	service.mu.Lock()
	defer service.mu.Unlock()
	reservation, ok := service.reservations[reservationID]
	if !ok {
		return apperr.OpenOutcome{Status: apperr.OpenStatusRefused, Error: classifiedOpenError(apperr.ClassifiedConflict, "The Open request is no longer valid.", apperr.RemediationRetry)}
	}
	delete(service.reservations, reservationID)
	if service.state.tabSetRevision != reservation.expectedTabRevision {
		return apperr.OpenOutcome{Status: apperr.OpenStatusRefused, Error: classifiedOpenError(apperr.ClassifiedConflict, "The tab set changed; Open must be retried.", apperr.RemediationRetry)}
	}
	before := service.snapshotLocked()
	documentID := reservation.existingDocumentID
	status := apperr.OpenStatusOpened
	changed := false
	var removedID string
	if documentID != "" {
		status = apperr.OpenStatusFocused
		if service.state.activeDocumentID != documentID {
			service.state.activeDocumentID = documentID
			service.state.tabSetRevision++
			changed = true
		}
	} else {
		documentID = mintDocumentID()
		document := documentFromClassifiedRead(documentID, reservation.read, reservation.arrangement)
		if len(service.state.documents) == 1 && service.state.activeDocumentID != "" {
			placeholder, exists := service.state.documents[service.state.activeDocumentID]
			if exists && placeholder.metadata.Path == "" && placeholder.content == "" && !placeholder.metadata.Dirty {
				removedID = service.state.activeDocumentID
				delete(service.state.documents, removedID)
				for index, id := range service.state.orderedDocumentIDs {
					if id == removedID {
						service.state.orderedDocumentIDs[index] = documentID
						break
					}
				}
			} else {
				service.state.orderedDocumentIDs = append(service.state.orderedDocumentIDs, documentID)
			}
		} else {
			service.state.orderedDocumentIDs = append(service.state.orderedDocumentIDs, documentID)
		}
		service.state.documents[documentID] = document
		service.state.activeDocumentID = documentID
		service.state.tabSetRevision++
		changed = true
	}
	service.state.recentFiles = promoteRecentFile(service.state.recentFiles, reservation.canonical.Path)
	if service.state.recentFilesChanged(before.recentFiles) {
		changed = true
	}
	if !changed {
		return openOutcomeForDocument(status, documentID, service.state.revision, service.state.documents[documentID])
	}
	service.state.revision++
	metadata := service.state.documents[documentID].metadata
	patch := apperr.AppStatePatch{
		Revision:           service.state.revision,
		TabSetRevision:     pointerTo(service.state.tabSetRevision),
		OrderedDocumentIDs: append([]string(nil), service.state.orderedDocumentIDs...),
		Documents:          &apperr.DocumentsPatch{Upsert: map[string]apperr.DocumentMetadata{documentID: metadata}},
		ActiveDocument:     activeDocumentPatch(service.state.activeDocumentID),
		RecentFiles:        append([]string(nil), service.state.recentFiles...),
		CanReopenLastFile:  pointerTo(service.state.canReopenLastFile),
	}
	if removedID != "" {
		patch.Documents.Remove = []string{removedID}
	}
	if err := service.publishLocked(ctx, before, patch); err != nil {
		return apperr.OpenOutcome{Status: apperr.OpenStatusRefused, Error: classifiedOpenError(apperr.ClassifiedIOFailure, "The opened document could not be published.", apperr.RemediationRetry)}
	}
	return openOutcomeForDocument(status, documentID, service.state.revision, service.state.documents[documentID])
}

func documentFromClassifiedRead(documentID string, read file.ClassifiedRead, arrangement string) *openDocument {
	sizeClass := "small"
	if read.Capability == file.CapabilityLargeReadOnly {
		sizeClass = "large"
	}
	version, _ := file.CurrentDiskVersion(read.CanonicalPath.Path)
	return &openDocument{
		metadata: apperr.DocumentMetadata{
			DocumentID: documentID, Title: read.CanonicalPath.DisplayName, Path: read.CanonicalPath.Path,
			DisplayName: read.CanonicalPath.DisplayName, ParentName: read.CanonicalPath.ParentName,
			Encoding: string(read.Characteristics.Encoding), BOM: string(read.Characteristics.BOM),
			LineEnding: string(read.Characteristics.LineEnding), Capability: string(read.Capability), SizeClass: sizeClass,
			WordCount: len(strings.Fields(read.Content)), View: openView(arrangement),
		},
		content: read.Content, baseline: read.Content, baselineVersion: version, baselineOrigin: SaveOriginOpen, committedRevision: 0, canonicalIdentity: read.CanonicalPath.Identity,
	}
}

func openView(arrangement string) apperr.DocView {
	view := apperr.DocView{Arrangement: arrangement, Cursor: apperr.CursorPosition{Line: 1, Column: 1}, Selection: apperr.SelectionRange{Start: apperr.CursorPosition{Line: 1, Column: 1}, End: apperr.CursorPosition{Line: 1, Column: 1}}}
	switch arrangement {
	case ArrangementEditor:
		view.EditorVisible = true
	case ArrangementPreview:
		view.PreviewVisible = true
	default:
		view.Arrangement = ArrangementSplit
		view.EditorVisible, view.PreviewVisible = true, true
	}
	return view
}

func openArrangement(defaultMode, fallback string) string {
	if defaultMode == OpenModeViewer {
		return ArrangementPreview
	}
	if validArrangement(fallback) {
		return fallback
	}
	return ArrangementSplit
}

func promoteRecentFile(recent []string, path string) []string {
	result := []string{path}
	for _, candidate := range recent {
		if candidate != path && len(result) < 6 {
			result = append(result, candidate)
		}
	}
	return result
}

func (state applicationState) recentFilesChanged(before []string) bool {
	if len(state.recentFiles) != len(before) {
		return true
	}
	for index := range state.recentFiles {
		if state.recentFiles[index] != before[index] {
			return true
		}
	}
	return false
}

func openOutcomeForDocument(status apperr.OpenStatus, documentID string, projectionRevision uint64, document *openDocument) apperr.OpenOutcome {
	return apperr.OpenOutcome{Status: status, DocumentID: documentID, ProjectionRevision: projectionRevision, ActiveBuffer: &apperr.ActiveBufferAcknowledgement{DocumentID: documentID, DocumentRevision: document.metadata.ContentRevision, ProjectionRevision: projectionRevision, Content: document.content}}
}

func classifiedOpenError(category apperr.ClassifiedErrorCategory, message string, remediation apperr.ClassifiedRemediation) *apperr.ClassifiedError {
	errorValue := apperr.NewClassifiedError(category, "document", message, remediation, "")
	return &errorValue
}
