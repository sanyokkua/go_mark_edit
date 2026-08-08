package appmodel

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog"
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bootstrap"
)

var nextDocumentID uint64

// AppModelService is the mutex-guarded owner of live document and layout state.
type AppModelService struct {
	mu               sync.RWMutex
	state            applicationState
	commands         DocumentCommandAPI
	content          DocumentContentAccessor
	emitter          StatePatchEmitter
	layout           LayoutRepositoryAPI
	sequence         uint64
	writerID         string
	timer            layoutTimer
	pending          *pendingLayout
	pendingFlushDone chan struct{}
	startupErr       error
}

type layoutTimer interface{ AfterFunc(time.Duration, func()) }

type systemLayoutTimer struct{}

func (systemLayoutTimer) AfterFunc(delay time.Duration, callback func()) {
	time.AfterFunc(delay, callback)
}

type pendingLayout struct {
	ctx        context.Context
	layout     apperr.UILayout
	generation uint64
	values     map[string]VersionedLayoutValue
}

// NewAppModelService creates one clean, never-saved document for this process.
func NewAppModelService(emitter StatePatchEmitter) *AppModelService {
	return newAppModelService(emitter, nil, systemLayoutTimer{})
}

// NewAppModelServiceWithLayoutRepository constructs the production layout seam
// used after startup has opened the local SQLite database.
func NewAppModelServiceWithLayoutRepository(emitter StatePatchEmitter, layout LayoutRepositoryAPI) *AppModelService {
	return newAppModelService(emitter, layout, systemLayoutTimer{})
}

func NewAppModelServiceWithLayoutRepositoryAndTimer(emitter StatePatchEmitter, layout LayoutRepositoryAPI, timer layoutTimer) *AppModelService {
	return newAppModelService(emitter, layout, timer)
}

func newAppModelService(emitter StatePatchEmitter, layout LayoutRepositoryAPI, timer layoutTimer) *AppModelService {
	documentID := mintDocumentID()
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

	if timer == nil {
		timer = systemLayoutTimer{}
	}
	service := &AppModelService{emitter: emitter, layout: layout, timer: timer, writerID: newLayoutWriterID(), state: applicationState{
		orderedDocumentIDs: []string{documentID},
		documents:          map[string]*openDocument{documentID: initialDocument},
		activeDocumentID:   documentID,
		ui: apperr.UILayout{
			WindowWidth:    pointerTo(1024),
			WindowHeight:   pointerTo(768),
			SidebarVisible: pointerTo(true),
		},
	}}
	service.commands = documentCommands{service: service}
	service.content = documentContentAccessor{service: service}
	return service
}

// NewEmptyAppModelService constructs the same backend state with no open
// documents. It is used by the zero-document launcher and keeps the optional
// active identity explicit instead of manufacturing a placeholder.
func NewEmptyAppModelService(emitter StatePatchEmitter) *AppModelService {
	service := newAppModelService(emitter, nil, systemLayoutTimer{})
	service.mu.Lock()
	service.state.documents = map[string]*openDocument{}
	service.state.orderedDocumentIDs = nil
	service.state.activeDocumentID = ""
	service.mu.Unlock()
	return service
}

func newLayoutWriterID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return fmt.Sprintf("process-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(bytes)
}

// GetState returns a metadata-only snapshot plus the active canonical buffer.
func (service *AppModelService) GetState(_ context.Context) (apperr.AppState, error) {
	service.mu.RLock()
	defer service.mu.RUnlock()
	if service.startupErr != nil {
		return apperr.AppState{}, apperr.Internal(service.startupErr)
	}

	documents := make(map[string]apperr.DocumentMetadata, len(service.state.documents))
	for documentID, document := range service.state.documents {
		documents[documentID] = service.effectiveDocumentMetadataLocked(document)
	}
	activeDocument, hasActiveDocument := service.state.documents[service.state.activeDocumentID]
	var activeDocumentID *string
	var activeBuffer *apperr.ActiveBuffer
	if hasActiveDocument && service.state.activeDocumentID != "" {
		id := service.state.activeDocumentID
		activeDocumentID = &id
		activeBuffer = &apperr.ActiveBuffer{DocumentID: id, Content: activeDocument.content}
	}
	orderedDocumentIDs := append([]string(nil), service.state.orderedDocumentIDs...)
	return apperr.AppState{
		Snapshot: apperr.AppStateSnapshot{
			Revision:           service.state.revision,
			TabSetRevision:     service.state.tabSetRevision,
			ApplicationVersion: bootstrap.Version(),
			Documents:          documents,
			ActiveDocumentID:   service.state.activeDocumentID,
			ActiveDocument:     activeDocumentID,
			OrderedDocumentIDs: orderedDocumentIDs,
			UI:                 cloneUILayout(service.state.ui),
		},
		ActiveBuffer: activeBuffer,
	}, nil
}

// SetStartupError prevents frontend hydration from mounting a normal shell
// while local initialization is unavailable. The underlying cause remains
// local; the Wails handler serializes only the safe typed envelope.
func (service *AppModelService) SetStartupError(err error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.startupErr = err
}

// ContentAccessor returns the stable F2 canonical-content reader.
func (service *AppModelService) ContentAccessor() DocumentContentAccessor {
	return service.content
}

// DocumentCommands returns the stable F3 document mutation seam.
func (service *AppModelService) DocumentCommands() DocumentCommandAPI {
	return service.commands
}

// SetLayoutRepository completes persistence wiring after application startup.
func (service *AppModelService) SetLayoutRepository(repository LayoutRepositoryAPI) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.layout = repository
}

// LayoutRepository exposes the configured persistence seam for composition checks.
func (service *AppModelService) LayoutRepository() LayoutRepositoryAPI {
	service.mu.RLock()
	defer service.mu.RUnlock()
	return service.layout
}

// RestoreUILayout reads each durable layout field independently. A corrupt or
// obsolete individual value falls back to the in-memory default without
// discarding other valid fields.
func (service *AppModelService) RestoreUILayout(ctx context.Context) error {
	service.mu.RLock()
	repository := service.layout
	service.mu.RUnlock()
	if repository == nil {
		return nil
	}

	restored := apperr.UILayout{}
	for _, field := range []string{
		LayoutWindowWidth,
		LayoutWindowHeight,
		LayoutWindowMaximized,
		LayoutWorkspaceVisible,
		LayoutWorkspaceWidth,
		LayoutArrangementBackup,
	} {
		value, found, err := repository.Read(ctx, field)
		if err != nil || !found {
			continue
		}
		switch field {
		case LayoutWindowWidth:
			if width, ok := value.Value.(int); ok && width >= 375 {
				restored.WindowWidth = pointerTo(width)
			}
		case LayoutWindowHeight:
			if height, ok := value.Value.(int); ok && height >= 480 {
				restored.WindowHeight = pointerTo(height)
			}
		case LayoutWindowMaximized:
			if maximized, ok := value.Value.(bool); ok {
				restored.WindowMaximized = pointerTo(maximized)
			}
		case LayoutWorkspaceVisible:
			if visible, ok := value.Value.(bool); ok {
				restored.SidebarVisible = pointerTo(visible)
			}
		case LayoutWorkspaceWidth:
			if width, ok := value.Value.(int); ok && width >= 0 {
				restored.SidebarWidth = pointerTo(width)
			}
		case LayoutArrangementBackup:
			if arrangement, ok := value.Value.(string); ok && validArrangement(arrangement) {
				restored.ViewArrangement = pointerTo(arrangement)
			}
		}
	}

	service.mu.Lock()
	mergeUILayout(&service.state.ui, restored)
	service.mu.Unlock()
	return nil
}

func validArrangement(arrangement string) bool {
	return arrangement == ArrangementEditor || arrangement == ArrangementSplit || arrangement == ArrangementPreview
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
	document.hasSavedView = true
	patch := service.documentPatchLocked(documentID)
	if err := service.publishLocked(ctx, before, patch); err != nil {
		service.mu.Unlock()
		return err
	}
	service.mu.Unlock()

	return nil
}

func (service *AppModelService) effectiveDocumentMetadataLocked(document *openDocument) apperr.DocumentMetadata {
	metadata := document.metadata
	if document.hasSavedView || service.state.ui.ViewArrangement == nil {
		return metadata
	}
	metadata.View.Arrangement = *service.state.ui.ViewArrangement
	switch metadata.View.Arrangement {
	case ArrangementEditor:
		metadata.View.EditorVisible, metadata.View.PreviewVisible = true, false
	case ArrangementPreview:
		metadata.View.EditorVisible, metadata.View.PreviewVisible = false, true
	default:
		metadata.View.EditorVisible, metadata.View.PreviewVisible = true, true
	}
	return metadata
}

// SetUILayout merges the supplied in-memory application layout fields.
func (service *AppModelService) SetUILayout(ctx context.Context, layout apperr.UILayout) error {
	if err := validateUILayout(layout); err != nil {
		return err
	}
	continuous := apperr.UILayout{
		WindowWidth:  layout.WindowWidth,
		WindowHeight: layout.WindowHeight,
		SidebarWidth: layout.SidebarWidth,
	}
	if continuous.WindowWidth != nil || continuous.WindowHeight != nil || continuous.SidebarWidth != nil {
		service.mu.Lock()
		if service.pending == nil {
			service.pending = &pendingLayout{ctx: ctx, values: make(map[string]VersionedLayoutValue)}
		}
		mergeUILayout(&service.pending.layout, continuous)
		for _, field := range []struct {
			name    string
			value   any
			present bool
		}{
			{LayoutWindowWidth, continuous.WindowWidth, continuous.WindowWidth != nil},
			{LayoutWindowHeight, continuous.WindowHeight, continuous.WindowHeight != nil},
			{LayoutWorkspaceWidth, continuous.SidebarWidth, continuous.SidebarWidth != nil},
		} {
			if !field.present {
				continue
			}
			service.sequence++
			service.pending.values[field.name] = VersionedLayoutValue{Version: 1, Value: dereferenceLayoutValue(field.value), ChangedAtUnixNano: time.Now().UnixNano(), WriterID: service.writerID, Sequence: service.sequence}
		}
		service.pending.ctx = ctx
		service.pending.generation++
		generation := service.pending.generation
		flushContext := ctx
		service.mu.Unlock()
		service.timer.AfterFunc(250*time.Millisecond, func() {
			if err := service.flushPendingLayoutGeneration(generation); err != nil {
				service.emitAsyncLayoutError(flushContext, err)
			}
		})
		layout.WindowWidth = nil
		layout.WindowHeight = nil
		layout.SidebarWidth = nil
	}
	if layout.WindowMaximized == nil && layout.SidebarVisible == nil && layout.ViewArrangement == nil {
		return nil
	}
	return service.applyAcknowledgedLayout(ctx, layout)
}

func (service *AppModelService) flushPendingLayout() error {
	for {
		pending, flushDone := service.takePendingLayout(0)
		if pending != nil {
			if err := service.completePendingLayoutFlush(pending, flushDone); err != nil {
				return err
			}
			continue
		}
		if !service.waitForInFlightPendingLayoutFlush() {
			return nil
		}
	}
}

func (service *AppModelService) flushPendingLayoutGeneration(generation uint64) error {
	for {
		pending, flushDone := service.takePendingLayout(generation)
		if pending != nil {
			return service.completePendingLayoutFlush(pending, flushDone)
		}
		if !service.waitForInFlightPendingLayoutFlush() {
			return nil
		}
	}
}

// FlushPendingUILayout synchronously persists the last continuous layout intent
// before the application releases its SQLite connection.
func (service *AppModelService) FlushPendingUILayout() error {
	return service.flushPendingLayout()
}

func (service *AppModelService) applyAcknowledgedLayout(ctx context.Context, layout apperr.UILayout) error {
	return service.applyAcknowledgedLayoutWithValues(ctx, layout, nil)
}

func (service *AppModelService) applyAcknowledgedLayoutWithValues(ctx context.Context, layout apperr.UILayout, values map[string]VersionedLayoutValue) error {
	acknowledged, err := service.persistLayout(ctx, layout, values)
	if err != nil {
		return err
	}
	service.mu.Lock()
	before := service.snapshotLocked()
	mergeUILayout(&service.state.ui, acknowledged)
	service.state.revision++
	patch := apperr.AppStatePatch{Revision: service.state.revision, UI: pointerTo(cloneUILayout(acknowledged))}
	if err := service.publishLocked(ctx, before, patch); err != nil {
		service.mu.Unlock()
		return err
	}
	service.mu.Unlock()

	return nil
}

func (service *AppModelService) persistLayout(ctx context.Context, layout apperr.UILayout, values map[string]VersionedLayoutValue) (apperr.UILayout, error) {
	if service.layout == nil {
		return layout, nil
	}
	acknowledged := cloneUILayout(layout)
	for _, field := range []struct {
		name    string
		value   any
		present bool
	}{
		{LayoutWindowWidth, layout.WindowWidth, layout.WindowWidth != nil},
		{LayoutWindowHeight, layout.WindowHeight, layout.WindowHeight != nil},
		{LayoutWindowMaximized, layout.WindowMaximized, layout.WindowMaximized != nil},
		{LayoutWorkspaceVisible, layout.SidebarVisible, layout.SidebarVisible != nil},
		{LayoutWorkspaceWidth, layout.SidebarWidth, layout.SidebarWidth != nil},
		{LayoutArrangementBackup, layout.ViewArrangement, layout.ViewArrangement != nil},
	} {
		if !field.present {
			continue
		}
		candidate, exists := values[field.name]
		if !exists {
			service.sequence++
			candidate = VersionedLayoutValue{Version: 1, Value: dereferenceLayoutValue(field.value), ChangedAtUnixNano: time.Now().UnixNano(), WriterID: service.writerID, Sequence: service.sequence}
		}
		result, err := service.layout.Write(ctx, field.name, candidate)
		if err != nil {
			return apperr.UILayout{}, classifyLayoutPersistenceError(err)
		}
		if !result.Applied {
			switch field.name {
			case LayoutWindowWidth:
				winner, ok := result.Value.Value.(int)
				if !ok {
					return apperr.UILayout{}, fmt.Errorf("invalid stored native window width")
				}
				acknowledged.WindowWidth = pointerTo(winner)
			case LayoutWindowHeight:
				winner, ok := result.Value.Value.(int)
				if !ok {
					return apperr.UILayout{}, fmt.Errorf("invalid stored native window height")
				}
				acknowledged.WindowHeight = pointerTo(winner)
			case LayoutWindowMaximized:
				winner, ok := result.Value.Value.(bool)
				if !ok {
					return apperr.UILayout{}, fmt.Errorf("invalid stored native window maximized state")
				}
				acknowledged.WindowMaximized = pointerTo(winner)
			case LayoutWorkspaceVisible:
				winner, ok := result.Value.Value.(bool)
				if !ok {
					return apperr.UILayout{}, fmt.Errorf("invalid stored workspace visibility")
				}
				acknowledged.SidebarVisible = pointerTo(winner)
			case LayoutWorkspaceWidth:
				winner, ok := result.Value.Value.(int)
				if !ok {
					return apperr.UILayout{}, fmt.Errorf("invalid stored workspace width")
				}
				acknowledged.SidebarWidth = pointerTo(winner)
			case LayoutArrangementBackup:
				winner, ok := result.Value.Value.(string)
				if !ok {
					return apperr.UILayout{}, fmt.Errorf("invalid stored arrangement fallback")
				}
				acknowledged.ViewArrangement = pointerTo(winner)
			}
		}
	}
	return acknowledged, nil
}

func classifyLayoutPersistenceError(err error) error {
	if err == nil {
		return nil
	}

	var appError *apperr.AppError
	if errors.As(err, &appError) {
		return err
	}

	return apperr.IO("update layout", err)
}

func (service *AppModelService) emitAsyncLayoutError(ctx context.Context, err error) {
	if err == nil {
		return
	}

	emitter, ok := service.emitter.(AsyncErrorEmitter)
	if !ok {
		return
	}

	_ = emitter.EmitAsyncError(ctx, apperr.ToWire(zerolog.Nop(), err))
}

func (service *AppModelService) completePendingLayoutFlush(pending *pendingLayout, flushDone chan struct{}) error {
	if pending == nil || flushDone == nil {
		return nil
	}
	defer service.finishPendingLayoutFlush(flushDone)
	if err := service.applyAcknowledgedLayoutWithValues(pending.ctx, pending.layout, pending.values); err != nil {
		service.restorePendingLayout(pending)
		return err
	}
	return nil
}

func (service *AppModelService) takePendingLayout(generation uint64) (*pendingLayout, chan struct{}) {
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.pendingFlushDone != nil || service.pending == nil {
		return nil, nil
	}
	if generation != 0 && service.pending.generation != generation {
		return nil, nil
	}
	pending := service.pending
	service.pending = nil
	flushDone := make(chan struct{})
	service.pendingFlushDone = flushDone
	return pending, flushDone
}

func (service *AppModelService) restorePendingLayout(pending *pendingLayout) {
	if pending == nil {
		return
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.pending == nil {
		service.pending = pending
		return
	}
	if service.pending.layout.WindowWidth == nil && pending.layout.WindowWidth != nil {
		service.pending.layout.WindowWidth = pointerTo(*pending.layout.WindowWidth)
	}
	if service.pending.layout.WindowHeight == nil && pending.layout.WindowHeight != nil {
		service.pending.layout.WindowHeight = pointerTo(*pending.layout.WindowHeight)
	}
	if service.pending.layout.SidebarWidth == nil && pending.layout.SidebarWidth != nil {
		service.pending.layout.SidebarWidth = pointerTo(*pending.layout.SidebarWidth)
	}
	if service.pending.values == nil {
		service.pending.values = make(map[string]VersionedLayoutValue, len(pending.values))
	}
	for field, value := range pending.values {
		if _, exists := service.pending.values[field]; !exists {
			service.pending.values[field] = value
		}
	}
}

func (service *AppModelService) finishPendingLayoutFlush(flushDone chan struct{}) {
	service.mu.Lock()
	if service.pendingFlushDone == flushDone {
		service.pendingFlushDone = nil
	}
	service.mu.Unlock()
	close(flushDone)
}

func (service *AppModelService) waitForInFlightPendingLayoutFlush() bool {
	service.mu.Lock()
	flushDone := service.pendingFlushDone
	service.mu.Unlock()
	if flushDone == nil {
		return false
	}
	<-flushDone
	return true
}

func dereferenceLayoutValue(value any) any {
	switch typed := value.(type) {
	case *bool:
		return *typed
	case *int:
		return *typed
	case *string:
		return *typed
	default:
		return value
	}
}

func validateUILayout(layout apperr.UILayout) error {
	if layout.WindowWidth != nil && *layout.WindowWidth < 375 {
		return apperr.Validation("uiLayout.windowWidth", "at least 375", "too small")
	}
	if layout.WindowHeight != nil && *layout.WindowHeight < 480 {
		return apperr.Validation("uiLayout.windowHeight", "at least 480", "too small")
	}
	if layout.SidebarWidth != nil && *layout.SidebarWidth < 0 {
		return apperr.Validation("uiLayout.sidebarWidth", "nonnegative", "negative")
	}
	if layout.ViewArrangement != nil && *layout.ViewArrangement != ArrangementEditor && *layout.ViewArrangement != ArrangementSplit && *layout.ViewArrangement != ArrangementPreview {
		return apperr.Validation("uiLayout.viewArrangement", "editor, split, or preview", "unknown")
	}
	for field, value := range map[string]bool{
		"uiLayout.editorPaneVisible":  layout.EditorPaneVisible != nil,
		"uiLayout.previewPaneVisible": layout.PreviewPaneVisible != nil,
		"uiLayout.assistantVisible":   layout.AssistantVisible != nil,
		"uiLayout.assistantWidth":     layout.AssistantWidth != nil,
	} {
		if value {
			return apperr.Validation(field, "not an application layout field", "excluded")
		}
	}
	return nil
}

func (service *AppModelService) documentPatchLocked(documentID string) apperr.AppStatePatch {
	service.state.revision++
	tabSetRevision := service.state.tabSetRevision
	orderedDocumentIDs := append([]string(nil), service.state.orderedDocumentIDs...)
	var metadata apperr.DocumentMetadata
	if document, ok := service.state.documents[documentID]; ok {
		metadata = document.metadata
	}
	return apperr.AppStatePatch{
		Revision:           service.state.revision,
		TabSetRevision:     &tabSetRevision,
		OrderedDocumentIDs: orderedDocumentIDs,
		Documents: &apperr.DocumentsPatch{Upsert: map[string]apperr.DocumentMetadata{
			documentID: metadata,
		}},
		ActiveDocument: activeDocumentPatch(service.state.activeDocumentID),
	}
}

func activeDocumentPatch(documentID string) *apperr.ActiveDocumentPatch {
	if documentID == "" {
		return &apperr.ActiveDocumentPatch{Present: false}
	}
	return &apperr.ActiveDocumentPatch{Present: true, DocumentID: documentID}
}

func (service *AppModelService) snapshotLocked() applicationState {
	snapshot := applicationState{
		revision:           service.state.revision,
		tabSetRevision:     service.state.tabSetRevision,
		orderedDocumentIDs: append([]string(nil), service.state.orderedDocumentIDs...),
		documents:          make(map[string]*openDocument, len(service.state.documents)),
		activeDocumentID:   service.state.activeDocumentID,
		ui:                 cloneUILayout(service.state.ui),
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
	if patch.WindowWidth != nil {
		destination.WindowWidth = pointerTo(*patch.WindowWidth)
	}
	if patch.WindowHeight != nil {
		destination.WindowHeight = pointerTo(*patch.WindowHeight)
	}
	if patch.WindowMaximized != nil {
		destination.WindowMaximized = pointerTo(*patch.WindowMaximized)
	}
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
