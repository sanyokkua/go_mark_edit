package appmodel

import (
	"context"
	"errors"
	"os"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
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

type SaveDialogRequest struct {
	DefaultDirectory string
	DefaultFilename  string
	Title            string
}

type DocumentSaveDialog interface {
	ChooseSaveFile(context.Context, SaveDialogRequest) (string, error)
	ConfirmOverwrite(context.Context, string) (bool, error)
}

// NewDocument performs one revision-checked backend transition. It never
// creates a file or a recent-file entry; the returned acknowledgement is the
// only source payload that may be installed after the projection catches up.
func (service *AppModelService) NewDocument(ctx context.Context, expectedTabSetRevision uint64) apperr.DocumentTransitionOutcome {
	service.mu.Lock()
	defer service.mu.Unlock()

	if service.state.tabSetRevision != expectedTabSetRevision {
		return bridge.Refused[apperr.DocumentTransitionResult](
			apperr.ClassifiedConflict,
			"The tab set changed; New must be retried.",
			apperr.RemediationRetry,
		)
	}
	if len(service.state.orderedDocumentIDs) >= maxOpenDocuments {
		return bridge.Refused[apperr.DocumentTransitionResult](
			apperr.ClassifiedCapacityLimit,
			"The window already contains 40 documents.",
			// Message-only, naming the limit: no action makes a 41st document fit.
			apperr.RemediationNone,
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
		return bridge.Refused[apperr.DocumentTransitionResult](
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
		id:            documentID,
		canonicalPath: "",
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

// OpenPath is the synchronous convenience command used by tests and the later handler wiring. It
// still runs through the prepare/commit reservation boundary so selection itself cannot mutate tabs.
func (service *AppModelService) OpenPath(ctx context.Context, path string, expectedTabSetRevision uint64) apperr.OpenOutcome {
	if strings.TrimSpace(path) == "" {
		return apperr.OpenOutcome{Status: apperr.OpenStatusCancelled}
	}
	preparation, classified := service.PrepareOpen(ctx, path, expectedTabSetRevision)
	if classified != nil {
		return bridge.FromClassified[apperr.OpenOutcome](classified, apperr.OpenStatusRefused)
	}
	return service.CommitPreparedOpen(ctx, preparation.ReservationID)
}

// PrepareOpen canonicalizes and classifies a path while reserving identity and capacity, without
// activating or publishing any document state.
func (service *AppModelService) PrepareOpen(ctx context.Context, path string, expectedTabSetRevision uint64) (OpenPreparation, *apperr.ClassifiedError) {
	service.mu.RLock()
	if service.state.tabSetRevision != expectedTabSetRevision {
		service.mu.RUnlock()
		return OpenPreparation{}, bridge.ClassifiedWithID(apperr.ClassifiedConflict, "document", "The tab set changed; Open must be retried.", apperr.RemediationRetry, "")
	}
	metadataRepository := service.metadata
	defaultMode := service.defaultOpenMode
	fallbackArrangement := ""
	if service.state.ui.ViewArrangement != nil {
		fallbackArrangement = *service.state.ui.ViewArrangement
	}
	service.mu.RUnlock()

	stable, readErr := file.ReadClassifiedStable(path, file.MaxClassifiedReadBytes)
	if readErr != nil {
		if errors.Is(readErr, file.ErrUnstableRead) {
			return OpenPreparation{}, bridge.ClassifiedWithID(apperr.ClassifiedConflict, "document", "The document changed while it was being read; try again.", apperr.RemediationRetry, "")
		}
		return OpenPreparation{}, bridge.ClassifiedWithID(apperr.ClassifiedIOFailure, "document", "The document could not be read.", apperr.RemediationRetry, "")
	}
	// A missing path is not an error at either layer below, by design:
	// `CurrentDiskVersion` reports absence as `DiskVersion{}, nil` so a permission
	// or IO failure cannot be mistaken for deletion (`disk_version.go:31-32`), and
	// `ReadClassifiedStable` short-circuits on `!before.Exists` so the conflict path
	// can mark an open document detached without raising. Neither `readErr` nor
	// `read.Error` therefore fires here, `identity`
	// stays "", and the match loop below is satisfied by any untitled document — so
	// an explicit stale choice focused an unrelated tab instead of refusing.
	// the refusal has to happen before identity is read.
	if !stable.Version.Exists {
		return OpenPreparation{}, bridge.ClassifiedWithID(apperr.ClassifiedNotFound, "document", "The file no longer exists.", apperr.RemediationNone, "")
	}
	read := stable.Read
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
		return OpenPreparation{}, bridge.ClassifiedWithID(apperr.ClassifiedConflict, "document", "The tab set changed; Open must be retried.", apperr.RemediationRetry, "")
	}
	identity := read.CanonicalPath.Identity
	for _, reservation := range service.reservations {
		if reservation.identity == identity {
			return OpenPreparation{ReservationID: reservation.id}, nil
		}
	}
	existingDocumentID := ""
	for documentID, document := range service.state.documents {
		if document.identity.Equal(identity) || (document.identity.IsZero() && document.metadata.Path == identity.Path && identity.Path != "") {
			existingDocumentID = documentID
			break
		}
	}
	novelReservations := countNovelReservations(service.reservations)
	if existingDocumentID == "" && len(service.state.documents)+novelReservations >= maxOpenDocuments {
		return OpenPreparation{}, bridge.ClassifiedWithID(apperr.ClassifiedCapacityLimit, "document", "The window already contains 40 documents.", apperr.RemediationNone, "")
	}
	reservationID := mintDocumentID()
	service.reservations[reservationID] = &openReservation{
		id: reservationID, identity: identity, expectedTabRevision: expectedTabSetRevision,
		canonical: read.CanonicalPath, read: read, version: stable.Version, rawHash: stable.RawHash, existingDocumentID: existingDocumentID, arrangement: arrangement,
	}
	return OpenPreparation{ReservationID: reservationID}, nil
}

/*
 * There is deliberately no CancelPreparedOpen. PrepareOpen and
 * CommitPreparedOpen are adjacent operations: every refusal occurs before a
 * reservation exists, and every commit path removes its reservation. Exposing
 * a cancellation arm would require a new bridge-visible prepare/commit boundary.
 */

// CommitPreparedOpen revalidates the tab revision and applies exactly one Open transition.
func (service *AppModelService) CommitPreparedOpen(ctx context.Context, reservationID string) apperr.OpenOutcome {
	service.mu.Lock()
	reservation, ok := service.reservations[reservationID]
	if !ok {
		service.mu.Unlock()
		classified := bridge.ClassifiedWithID(apperr.ClassifiedConflict, "document", "The Open request is no longer valid.", apperr.RemediationRetry, "")
		return bridge.FromClassified[apperr.OpenOutcome](classified, apperr.OpenStatusRefused)
	}
	delete(service.reservations, reservationID)
	if service.state.tabSetRevision != reservation.expectedTabRevision {
		service.mu.Unlock()
		classified := bridge.ClassifiedWithID(apperr.ClassifiedConflict, "document", "The tab set changed; Open must be retried.", apperr.RemediationRetry, "")
		return bridge.FromClassified[apperr.OpenOutcome](classified, apperr.OpenStatusRefused)
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
		document := documentFromClassifiedRead(documentID, reservation.read, reservation.arrangement, reservation.version, reservation.rawHash)
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
	var promotionWarning *apperr.ClassifiedError
	if service.recentFiles == nil {
		service.state.recentFiles = promoteRecentFile(service.state.recentFiles, reservation.canonical.Path)
		if service.state.recentFilesChanged(before.recentFiles) {
			changed = true
		}
	} else {
		repository := service.recentFiles
		service.mu.Unlock()
		entries, err := repository.Promote(ctx, reservation.canonical.Path)
		service.mu.Lock()
		if err != nil {
			promotionWarning = bridge.ClassifiedWithID(apperr.ClassifiedPersistenceWarning, reservation.canonical.Path, "The file opened successfully, but recent-file history could not be updated.", apperr.RemediationNone, "recent-files")
		} else {
			service.state.recentFiles = append([]string(nil), entries...)
			if service.state.recentFilesChanged(before.recentFiles) {
				changed = true
			}
		}
	}
	if !changed {
		result := openOutcomeForDocument(status, documentID, service.state.revision, service.state.documents[documentID])
		result.Error = promotionWarning
		result.Failure = bridge.FailureFromClassified(promotionWarning)
		service.mu.Unlock()
		return result
	}
	service.state.revision++
	metadata := service.effectiveDocumentMetadataLocked(service.state.documents[documentID])
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
		service.mu.Unlock()
		classified := bridge.ClassifiedWithID(apperr.ClassifiedIOFailure, "document", "The opened document could not be published.", apperr.RemediationRetry, "")
		return bridge.FromClassified[apperr.OpenOutcome](classified, apperr.OpenStatusRefused)
	}
	result := openOutcomeForDocument(status, documentID, service.state.revision, service.state.documents[documentID])
	result.Error = promotionWarning
	result.Failure = bridge.FailureFromClassified(promotionWarning)
	service.mu.Unlock()
	return result
}

// ReopenLastFile consumes the newest eligible closed entry only after a
// canonical Open succeeds. The file is read again from disk, so discarded
// source content is never retained in the closed-history record.
func (service *AppModelService) ReopenLastFile(ctx context.Context, expectedTabSetRevision uint64) apperr.OpenOutcome {
	service.mu.RLock()
	if service.state.tabSetRevision != expectedTabSetRevision {
		service.mu.RUnlock()
		classified := bridge.ClassifiedWithID(apperr.ClassifiedConflict, "document", "The tab set changed; Reopen must be retried.", apperr.RemediationRetry, "")
		return bridge.FromClassified[apperr.OpenOutcome](classified, apperr.OpenStatusRefused)
	}
	if len(service.state.recentlyClosed) == 0 {
		service.mu.RUnlock()
		classified := bridge.ClassifiedWithID(apperr.ClassifiedNotFound, "document", "There is no recently closed file to reopen.", apperr.RemediationNone, "")
		return bridge.FromClassified[apperr.OpenOutcome](classified, apperr.OpenStatusRefused)
	}
	entry := service.state.recentlyClosed[0]
	service.mu.RUnlock()

	if _, err := os.Stat(entry.path); errors.Is(err, os.ErrNotExist) {
		service.consumeClosedEntry(ctx, entry.path)
		classified := bridge.ClassifiedWithID(apperr.ClassifiedNotFound, "document", "The recently closed file no longer exists.", apperr.RemediationNone, "")
		return bridge.FromClassified[apperr.OpenOutcome](classified, apperr.OpenStatusRefused)
	}

	result := service.OpenPath(ctx, entry.path, expectedTabSetRevision)
	if result.Status != apperr.OpenStatusOpened && result.Status != apperr.OpenStatusFocused {
		return result
	}
	if result.DocumentID != "" {
		viewErr := service.SetDocView(ctx, result.DocumentID, apperr.DocViewInput{
			EditorVisible:  entry.view.EditorVisible,
			PreviewVisible: entry.view.PreviewVisible,
			Cursor:         entry.view.Cursor,
			Selection:      entry.view.Selection,
			Scroll:         entry.view.Scroll,
		})
		if viewErr != nil {
			warning := bridge.ClassifiedWithID(
				apperr.ClassifiedPersistenceWarning,
				"view",
				"The file reopened, but its saved view could not be restored.",
				apperr.RemediationNone,
				result.DocumentID,
			)
			result.Error = warning
			result.Failure = bridge.FailureFromClassified(warning)
		}
	}
	service.consumeClosedEntry(ctx, entry.path)
	return result
}

func documentFromClassifiedRead(documentID string, read file.ClassifiedRead, arrangement string, version file.DiskVersion, rawHash string) *openDocument {
	sizeClass := "small"
	if read.Capability == file.CapabilityLargeReadOnly {
		sizeClass = "large"
	}
	normalizationEnding := normalizationEndingForRead(read)
	return &openDocument{
		metadata: apperr.DocumentMetadata{
			DocumentID: documentID, Title: read.CanonicalPath.DisplayName, Path: read.CanonicalPath.Path,
			DisplayName: read.CanonicalPath.DisplayName, ParentName: read.CanonicalPath.ParentName,
			Encoding: string(read.Characteristics.Encoding), BOM: string(read.Characteristics.BOM),
			LineEnding: string(read.Characteristics.LineEnding), Capability: string(read.Capability), SizeClass: sizeClass,
			WordCount: len(strings.Fields(read.Content)), View: openView(arrangement),
		},
		id: documentID, identity: read.CanonicalPath.Identity, canonicalPath: read.CanonicalPath.Path,
		content: read.Content, baseline: read.Content, baselineVersion: version, baselineCharacteristics: read.Characteristics, baselineRawHash: rawHash, baselineOrigin: SaveOriginOpen, committedRevision: 0, bufferRevision: 0, normalizationEnding: normalizationEnding,
	}
}

func normalizationEndingForRead(read file.ClassifiedRead) string {
	if read.Characteristics.LineEnding != file.LineEndingMixed {
		return ""
	}
	switch {
	case read.Characteristics.LFCount > read.Characteristics.CRLFCount:
		return string(file.LineEndingLF)
	case read.Characteristics.CRLFCount > read.Characteristics.LFCount:
		return string(file.LineEndingCRLF)
	case read.Characteristics.FirstEnding == file.LineEndingCRLF:
		return string(file.LineEndingCRLF)
	default:
		return string(file.LineEndingLF)
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
