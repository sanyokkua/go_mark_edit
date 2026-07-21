package appmodel

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"sync/atomic"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

var nextDocumentID uint64

// AppModelService is the mutex-guarded owner of live document and layout state.
type AppModelService struct {
	mu       sync.RWMutex
	state    applicationState
	commands DocumentCommandAPI
	content  DocumentContentAccessor
	emitter  StatePatchEmitter
}

// NewAppModelService creates one clean, never-saved document for this process.
func NewAppModelService(emitter StatePatchEmitter) *AppModelService {
	documentID := mintDocumentID()
	visible := true
	initialDocument := &openDocument{
		metadata: apperr.DocumentMetadata{
			DocumentID: documentID,
			Title:      "Untitled",
			Path:       "",
			Encoding:   "utf-8",
			LineEnding: "lf",
			View: apperr.DocView{
				Arrangement:    ArrangementSplit,
				EditorVisible:  true,
				PreviewVisible: true,
				Cursor:         apperr.CursorPosition{Line: 1, Column: 1},
				Selection: apperr.SelectionRange{
					Start: apperr.CursorPosition{Line: 1, Column: 1},
					End:   apperr.CursorPosition{Line: 1, Column: 1},
				},
			},
		},
	}

	service := &AppModelService{emitter: emitter, state: applicationState{
		documents:        map[string]*openDocument{documentID: initialDocument},
		activeDocumentID: documentID,
		ui: apperr.UILayout{
			SidebarVisible:     &visible,
			EditorPaneVisible:  &visible,
			PreviewPaneVisible: &visible,
		},
	}}
	service.commands = documentCommands{service: service}
	service.content = documentContentAccessor{service: service}
	return service
}

// GetState returns a metadata-only snapshot plus the active canonical buffer.
func (service *AppModelService) GetState(_ context.Context) (apperr.AppState, error) {
	service.mu.RLock()
	defer service.mu.RUnlock()

	documents := make(map[string]apperr.DocumentMetadata, len(service.state.documents))
	for documentID, document := range service.state.documents {
		documents[documentID] = document.metadata
	}
	activeDocument := service.state.documents[service.state.activeDocumentID]
	return apperr.AppState{
		Snapshot: apperr.AppStateSnapshot{
			Revision:         service.state.revision,
			Documents:        documents,
			ActiveDocumentID: service.state.activeDocumentID,
			UI:               cloneUILayout(service.state.ui),
		},
		ActiveBuffer: apperr.ActiveBuffer{
			DocumentID: service.state.activeDocumentID,
			Content:    activeDocument.content,
		},
	}, nil
}

// ContentAccessor returns the stable F2 canonical-content reader.
func (service *AppModelService) ContentAccessor() DocumentContentAccessor {
	return service.content
}

// DocumentCommands returns the stable F3 document mutation seam.
func (service *AppModelService) DocumentCommands() DocumentCommandAPI {
	return service.commands
}

// UpdateBuffer delegates canonical content mutation through the F3 command seam.
func (service *AppModelService) UpdateBuffer(ctx context.Context, documentID, content string) error {
	return service.commands.UpdateBuffer(ctx, documentID, content)
}

// SetDocView stores a document's restorable pane and cursor metadata.
func (service *AppModelService) SetDocView(ctx context.Context, documentID string, input apperr.DocViewInput) error {
	if err := validateDocView(input); err != nil {
		return err
	}
	service.mu.Lock()
	before := service.snapshotLocked()
	document, ok := service.state.documents[documentID]
	if !ok {
		service.mu.Unlock()
		return apperr.NotFound(documentID)
	}
	document.metadata.View = apperr.DocView{
		Arrangement:    arrangementFor(input.EditorVisible, input.PreviewVisible),
		EditorVisible:  input.EditorVisible,
		PreviewVisible: input.PreviewVisible,
		Cursor:         input.Cursor,
		Selection:      input.Selection,
		Scroll:         input.Scroll,
	}
	patch := service.documentPatchLocked(documentID)
	if err := service.publishLocked(ctx, before, patch); err != nil {
		service.mu.Unlock()
		return err
	}
	service.mu.Unlock()

	return nil
}

// SetUILayout merges the supplied in-memory application layout fields.
func (service *AppModelService) SetUILayout(ctx context.Context, layout apperr.UILayout) error {
	service.mu.Lock()
	before := service.snapshotLocked()
	mergeUILayout(&service.state.ui, layout)
	service.state.revision++
	patch := apperr.AppStatePatch{Revision: service.state.revision, UI: pointerTo(cloneUILayout(layout))}
	if err := service.publishLocked(ctx, before, patch); err != nil {
		service.mu.Unlock()
		return err
	}
	service.mu.Unlock()

	return nil
}

func (service *AppModelService) documentPatchLocked(documentID string) apperr.AppStatePatch {
	service.state.revision++
	return apperr.AppStatePatch{
		Revision: service.state.revision,
		Documents: &apperr.DocumentsPatch{Upsert: map[string]apperr.DocumentMetadata{
			documentID: service.state.documents[documentID].metadata,
		}},
	}
}

func (service *AppModelService) snapshotLocked() applicationState {
	snapshot := applicationState{
		revision:         service.state.revision,
		documents:        make(map[string]*openDocument, len(service.state.documents)),
		activeDocumentID: service.state.activeDocumentID,
		ui:               cloneUILayout(service.state.ui),
	}
	for documentID, document := range service.state.documents {
		documentCopy := *document
		snapshot.documents[documentID] = &documentCopy
	}
	return snapshot
}

func (service *AppModelService) publishLocked(ctx context.Context, before applicationState, patch apperr.AppStatePatch) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			service.state = before
			err = apperr.Internal(fmt.Errorf("state patch emitter panic: %v", recovered))
		}
	}()
	if service.emitter == nil {
		service.state = before
		return apperr.Internal(errors.New("state patch emitter is required"))
	}
	if emitErr := service.emitter.EmitStatePatch(ctx, patch); emitErr != nil {
		service.state = before
		return apperr.Internal(fmt.Errorf("emit state patch: %w", emitErr))
	}
	return nil
}

func arrangementFor(editorVisible, previewVisible bool) string {
	switch {
	case editorVisible && previewVisible:
		return ArrangementSplit
	case editorVisible:
		return ArrangementEditor
	default:
		return ArrangementPreview
	}
}

func validateDocView(input apperr.DocViewInput) error {
	if !input.EditorVisible && !input.PreviewVisible {
		return apperr.Validation("docView.panes", "at least one pane visible", "both hidden")
	}
	for _, position := range []struct {
		field string
		value apperr.CursorPosition
	}{
		{"docView.cursor", input.Cursor},
		{"docView.selection.start", input.Selection.Start},
		{"docView.selection.end", input.Selection.End},
	} {
		if position.value.Line <= 0 || position.value.Column <= 0 {
			return apperr.Validation(position.field, "one-based line and column", strconv.Itoa(position.value.Line)+":"+strconv.Itoa(position.value.Column))
		}
	}
	if comparePositions(input.Selection.Start, input.Selection.End) > 0 {
		return apperr.Validation("docView.selection", "start before or equal to end", "reversed")
	}
	if input.Scroll.Editor < 0 || input.Scroll.Preview < 0 {
		return apperr.Validation("docView.scroll", "nonnegative offsets", "negative")
	}
	return nil
}

func comparePositions(left, right apperr.CursorPosition) int {
	if left.Line != right.Line {
		return left.Line - right.Line
	}
	return left.Column - right.Column
}

func mergeUILayout(destination *apperr.UILayout, patch apperr.UILayout) {
	if patch.SidebarVisible != nil {
		destination.SidebarVisible = pointerTo(*patch.SidebarVisible)
	}
	if patch.SidebarWidth != nil {
		destination.SidebarWidth = pointerTo(*patch.SidebarWidth)
	}
	if patch.ViewArrangement != nil {
		destination.ViewArrangement = pointerTo(*patch.ViewArrangement)
	}
	if patch.EditorPaneVisible != nil {
		destination.EditorPaneVisible = pointerTo(*patch.EditorPaneVisible)
	}
	if patch.PreviewPaneVisible != nil {
		destination.PreviewPaneVisible = pointerTo(*patch.PreviewPaneVisible)
	}
	if patch.AssistantVisible != nil {
		destination.AssistantVisible = pointerTo(*patch.AssistantVisible)
	}
	if patch.AssistantWidth != nil {
		destination.AssistantWidth = pointerTo(*patch.AssistantWidth)
	}
}

func cloneUILayout(layout apperr.UILayout) apperr.UILayout {
	clone := apperr.UILayout{}
	mergeUILayout(&clone, layout)
	return clone
}

func pointerTo[T any](value T) *T {
	return &value
}

func mintDocumentID() string {
	return "doc-" + formatDocumentID(atomic.AddUint64(&nextDocumentID, 1))
}

func formatDocumentID(value uint64) string {
	const alphabet = "0123456789abcdef"
	buffer := [16]byte{}
	for index := len(buffer) - 1; index >= 0; index-- {
		buffer[index] = alphabet[value&0xf]
		value >>= 4
	}
	return string(buffer[:])
}
