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
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

var nextDocumentID uint64

// AppModelService is the mutex-guarded owner of live document and layout state.
type AppModelService struct {
	mu                             sync.RWMutex
	state                          applicationState
	commands                       DocumentCommandAPI
	content                        DocumentContentAccessor
	emitter                        StatePatchEmitter
	layout                         LayoutRepositoryAPI
	sequence                       uint64
	writerID                       string
	timer                          LayoutTimer
	autosaveTimer                  AutosaveTimerFactory
	autosaveEnabled                bool
	pending                        *pendingLayout
	pendingFlushDone               chan struct{}
	startupErr                     error
	pendingClose                   *apperr.PendingClose
	reservations                   map[string]*openReservation
	closePlans                     map[string]*closePlan
	activeClosePlan                string
	writeExecutor                  WriteExecutor
	writeCommitObserver            WriteCommitObserver
	runtimeContext                 context.Context
	conflictQueue                  *conflictQueue
	shutdownDraining               bool
	metadata                       FileMetadataRepository
	recentFiles                    RecentFilesRepository
	defaultOpenMode                string
	openDialog                     DocumentOpenDialog
	saveDialog                     DocumentSaveDialog
	clipboard                      file.ClipboardWriter
	reveal                         file.RevealPort
	stableRead                     func(string, int64) (file.StableClassifiedRead, error)
	diskVersion                    func(string) (file.DiskVersion, error)
	applicationVersion             string
	logger                         zerolog.Logger
	publicationMu                  sync.Mutex
	publicationSequence            uint64
	applicationPublicationCommitID uint64
}

// LayoutTimer is the clock the layout debounce schedules against. It is
// exported so a harness host can substitute a stalled or immediate clock; the
// production default is systemLayoutTimer and no production host replaces it.
type LayoutTimer interface{ AfterFunc(time.Duration, func()) }

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

// NewAppModelServiceForHost is the production constructor. Host ports and the
// application version are supplied explicitly through constructor options.
func NewAppModelServiceForHost(options ...AppModelOption) *AppModelService {
	return newAppModelService(options...)
}

func newAppModelService(options ...AppModelOption) *AppModelService {
	documentID := mintDocumentID()
	initialDocument := &openDocument{
		metadata: apperr.DocumentMetadata{
			DocumentID: documentID,
			Title:      "Untitled",
			Path:       "",
			Capability: "writable",
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

	initialDocument.id = documentID
	initialDocument.canonicalPath = ""
	initialDocument.setBufferRevision(initialDocument.metadata.ContentRevision)
	service := &AppModelService{timer: systemLayoutTimer{}, autosaveTimer: systemAutosaveTimerFactory{}, autosaveEnabled: true, writerID: newLayoutWriterID(), reservations: make(map[string]*openReservation), closePlans: make(map[string]*closePlan), conflictQueue: newConflictQueue(), stableRead: file.ReadClassifiedStable, diskVersion: file.CurrentDiskVersion, defaultOpenMode: OpenModeEditor, applicationVersion: "dev", logger: zerolog.Nop(), state: applicationState{
		orderedDocumentIDs: []string{documentID},
		documents:          map[string]*openDocument{documentID: initialDocument},
		activeDocumentID:   documentID,
		ui: apperr.UILayout{
			WindowWidth:    pointerTo(1024),
			WindowHeight:   pointerTo(768),
			SidebarVisible: pointerTo(true),
		},
	}}
	for _, option := range options {
		if option != nil {
			option(service)
		}
	}
	service.commands = documentCommands{service: service}
	service.content = documentContentAccessor{service: service}
	return service
}

// SetFileMetadataRepository configures optional per-path arrangement persistence.
func (service *AppModelService) SetFileMetadataRepository(repository FileMetadataRepository) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.metadata = repository
}

// SetRecentFilesRepository configures durable MRU metadata without changing
// the in-memory document/session authority.
func (service *AppModelService) SetRecentFilesRepository(repository RecentFilesRepository) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.recentFiles = repository
}

// SetDefaultOpenMode records the acknowledged setting used before path arrangements.
func (service *AppModelService) SetDefaultOpenMode(mode string) {
	if mode != OpenModeEditor && mode != OpenModeViewer {
		return
	}
	service.mu.Lock()
	service.defaultOpenMode = mode
	service.mu.Unlock()
}

// SetRuntimeContext supplies the Wails lifecycle context used by timer-driven
// state patches. Foreground handlers still pass their request context directly.
func (service *AppModelService) SetRuntimeContext(ctx context.Context) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.runtimeContext = ctx
}

func (service *AppModelService) runtimeContextOr(fallback context.Context) context.Context {
	service.mu.RLock()
	defer service.mu.RUnlock()
	if service.runtimeContext != nil {
		return service.runtimeContext
	}
	return fallback
}

// OpenFromDialog turns cancellation into a normal outcome and delegates selected paths to OpenPath.
func (service *AppModelService) OpenFromDialog(ctx context.Context, expectedTabSetRevision uint64) apperr.OpenResult {
	service.mu.RLock()
	dialog := service.openDialog
	service.mu.RUnlock()
	if dialog == nil {
		classified := bridge.ClassifiedWithID(apperr.ClassifiedSystemCommandFailure, "document", "The Open dialog is unavailable.", apperr.RemediationRetry, "")
		return bridge.FromClassified[apperr.OpenResult](classified, apperr.OpenStatusRefused)
	}
	path, err := dialog.ChooseOpenFile(ctx)
	if err != nil {
		classified := bridge.ClassifiedWithID(apperr.ClassifiedSystemCommandFailure, "document", "The Open dialog could not be opened.", apperr.RemediationRetry, "")
		return bridge.FromClassified[apperr.OpenResult](classified, apperr.OpenStatusRefused)
	}
	if path == "" {
		return apperr.OpenResult{Status: apperr.OpenStatusCancelled}
	}
	return service.OpenPath(ctx, path, expectedTabSetRevision)
}

func newLayoutWriterID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return fmt.Sprintf("process-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(bytes)
}

// CloseStatus reports the document names that still need a native discard
// decision and whether any accepted work remains in flight or queued. It reads
// the authoritative model state even while startup is recovering, so shutdown
// can decide safely before the frontend reaches ready.
func (service *AppModelService) CloseStatus() (dirtyDocuments []string, pendingWork bool) {
	service.mu.RLock()
	defer service.mu.RUnlock()

	for _, documentID := range service.state.orderedDocumentIDs {
		document := service.state.documents[documentID]
		if document == nil {
			continue
		}
		metadata := service.effectiveDocumentMetadataLocked(document)
		if metadata.Dirty {
			name := metadata.DisplayName
			if name == "" {
				name = metadata.Title
			}
			if name == "" {
				name = documentID
			}
			dirtyDocuments = append(dirtyDocuments, name)
		}
		pendingWork = pendingWork || document.writeInFlight
	}
	for _, document := range service.state.documents {
		pendingWork = pendingWork || document.autosave != nil || document.autosaveInFlight != nil
	}
	pendingWork = pendingWork || service.pending != nil || service.pendingFlushDone != nil
	return dirtyDocuments, pendingWork
}

// BeginShutdownDrain prevents new explicit or debounced writes from starting
// while accepted work is drained. Work already running remains allowed to
// finish, which preserves atomic replacement semantics.
func (service *AppModelService) BeginShutdownDrain() {
	service.mu.Lock()
	service.shutdownDraining = true
	service.mu.Unlock()
}

// EndShutdownDrain reopens the write boundary after a user cancels shutdown.
func (service *AppModelService) EndShutdownDrain() {
	service.mu.Lock()
	service.shutdownDraining = false
	service.mu.Unlock()
}

// SetPendingClose records a close request for a frontend that hydrates after
// the native request was emitted.
func (service *AppModelService) SetPendingClose(id string) {
	if id == "" {
		return
	}
	service.mu.Lock()
	service.pendingClose = &apperr.PendingClose{ID: id}
	service.mu.Unlock()
}

// ClearPendingClose removes only the matching native close request.
func (service *AppModelService) ClearPendingClose(id string) {
	service.mu.Lock()
	if service.pendingClose != nil && service.pendingClose.ID == id {
		service.pendingClose = nil
	}
	service.mu.Unlock()
}

// GetState returns a metadata-only snapshot plus the active canonical buffer.
func (service *AppModelService) GetState(ctx context.Context) (apperr.AppState, error) {
	service.refreshRecentFiles(ctx)
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
		activeBuffer = &apperr.ActiveBuffer{
			DocumentID:         id,
			DocumentRevision:   activeDocument.metadata.ContentRevision,
			ProjectionRevision: service.state.revision,
			Content:            activeDocument.content,
		}
	}
	orderedDocumentIDs := append([]string(nil), service.state.orderedDocumentIDs...)
	return apperr.AppState{
		Snapshot: apperr.AppStateSnapshot{
			Revision:           service.state.revision,
			TabSetRevision:     service.state.tabSetRevision,
			ApplicationVersion: service.applicationVersion,
			Documents:          documents,
			ActiveDocumentID:   service.state.activeDocumentID,
			ActiveDocument:     activeDocumentID,
			OrderedDocumentIDs: orderedDocumentIDs,
			RecentFiles:        append([]string(nil), service.state.recentFiles...),
			CanReopenLastFile:  service.state.canReopenLastFile,
			UI:                 cloneUILayout(service.state.ui),
			PendingClose:       clonePendingClose(service.pendingClose),
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
// A constructor-injected repository wins so hosts can provide a durable test
// or recovery port without it being replaced when SQLite opens.
func (service *AppModelService) SetLayoutRepository(repository LayoutRepositoryAPI) {
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.layout == nil {
		service.layout = repository
	}
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
	var firstReadErr error
	for _, field := range []string{
		LayoutWindowWidth,
		LayoutWindowHeight,
		LayoutWindowMaximized,
		LayoutWorkspaceVisible,
		LayoutWorkspaceWidth,
		LayoutArrangementBackup,
	} {
		value, found, err := repository.Read(ctx, field)
		if err != nil {
			if firstReadErr == nil {
				firstReadErr = classifyLayoutReadError(field, err)
			}
			continue
		}
		if !found {
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
	return firstReadErr
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
	metadata := document.effectiveMetadata()
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
	// A width arriving with a visibility change is one discrete intent — restoring
	// a workspace that was put away — not the stream a drag produces, which is
	// what the debounce exists to coalesce. Holding it back would show the
	// workspace at its old width and widen it a quarter of a second later.
	if layout.SidebarVisible != nil {
		continuous.SidebarWidth = nil
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
		// Only clear what was actually queued, so a width held back above still
		// reaches the acknowledged apply below.
		if continuous.SidebarWidth != nil {
			layout.SidebarWidth = nil
		}
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

func classifyLayoutReadError(field string, err error) error {
	if err == nil {
		return nil
	}

	var appError *apperr.AppError
	if errors.As(err, &appError) {
		return err
	}

	return apperr.IO("read layout "+field, err)
}

func (service *AppModelService) emitAsyncLayoutError(ctx context.Context, err error) {
	if err == nil {
		return
	}

	classified := bridge.ClassifiedWithID(
		apperr.ClassifiedIOFailure,
		"layout",
		"The application layout could not be saved.",
		apperr.RemediationRetry,
		"",
	)
	wire := apperr.ClassifiedToWire(classified)
	wire.Details["operation"] = "update layout"
	service.emitAsyncError(ctx, wire, "layout persistence failure could not be surfaced")
}

func (service *AppModelService) emitAsyncError(ctx context.Context, wire apperr.WireError, reason string) {
	emitter, ok := service.emitter.(AsyncErrorEmitter)
	if ok {
		if err := emitter.EmitAsyncError(ctx, wire); err == nil {
			return
		} else {
			service.logAsyncError(wire, reason, err)
			return
		}
	}
	service.logAsyncError(wire, reason, nil)
}

func (service *AppModelService) logAsyncError(wire apperr.WireError, reason string, deliveryErr error) {
	event := service.logger.Error().
		Str("code", string(wire.Code)).
		Str("category", string(wire.Category)).
		Str("subject", wire.SafeSubject).
		Str("document_id", wire.DocumentID)
	if deliveryErr != nil {
		event = event.Err(deliveryErr)
	}
	event.Msg(reason)
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
		metadata = service.effectiveDocumentMetadataLocked(document)
	}
	return apperr.AppStatePatch{
		Revision:           service.state.revision,
		TabSetRevision:     &tabSetRevision,
		OrderedDocumentIDs: orderedDocumentIDs,
		Documents: &apperr.DocumentsPatch{Upsert: map[string]apperr.DocumentMetadata{
			documentID: metadata,
		}},
		ActiveDocument:    activeDocumentPatch(service.state.activeDocumentID),
		RecentFiles:       append([]string(nil), service.state.recentFiles...),
		CanReopenLastFile: pointerTo(service.state.canReopenLastFile),
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
		recentFiles:        append([]string(nil), service.state.recentFiles...),
		canReopenLastFile:  service.state.canReopenLastFile,
	}
	for documentID, document := range service.state.documents {
		documentCopy := *document
		if document.keepMine != nil {
			documentCopy.keepMine = make(map[string]*keepMineAuthorization, len(document.keepMine))
			for token, authorization := range document.keepMine {
				authorizationCopy := *authorization
				documentCopy.keepMine[token] = &authorizationCopy
			}
		}
		snapshot.documents[documentID] = &documentCopy
	}
	snapshot.recentlyClosed = append([]recentlyClosedDocument(nil), service.state.recentlyClosed...)
	return snapshot
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

func clonePendingClose(pending *apperr.PendingClose) *apperr.PendingClose {
	if pending == nil {
		return nil
	}
	clone := *pending
	return &clone
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
