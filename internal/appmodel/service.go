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
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

var nextDocumentID uint64

// AppModelService is the mutex-guarded owner of live document and layout state.
type AppModelService struct {
	mu                  sync.RWMutex
	state               applicationState
	commands            DocumentCommandAPI
	content             DocumentContentAccessor
	emitter             StatePatchEmitter
	layout              LayoutRepositoryAPI
	sequence            uint64
	writerID            string
	timer               LayoutTimer
	autosaveTimer       AutosaveTimerFactory
	autosaveEnabled     bool
	autosaveTimers      map[string]*autosaveTimerEntry
	autosaveInFlight    map[string]chan struct{}
	autosaveGeneration  uint64
	pending             *pendingLayout
	pendingFlushDone    chan struct{}
	startupErr          error
	pendingClose        *apperr.PendingClose
	reservations        map[string]*openReservation
	saveReservations    map[string]*saveReservation
	normalizations      map[string]*normalizationAuthorization
	writeCoordinators   map[string]*DocumentWriteCoordinator
	closePlans          map[string]*closePlan
	activeClosePlan     string
	writeExecutor       WriteExecutor
	writeCommitObserver WriteCommitObserver
	runtimeContext      context.Context
	conflicts           map[string]*documentConflict
	conflictQueue       *conflictQueue
	keepMine            map[string]*keepMineAuthorization
	beforeSaveAsRecheck func(string)
	shutdownDraining    bool
	metadata            FileMetadataRepository
	recentFiles         RecentFilesRepository
	defaultOpenMode     string
	openDialog          DocumentOpenDialog
	saveDialog          DocumentSaveDialog
	clipboard           file.ClipboardWriter
	reveal              file.RevealPort
	stableRead          func(string, int64) (file.StableClassifiedRead, error)
	diskVersion         func(string) (file.DiskVersion, error)
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

// NewAppModelService creates one clean, never-saved document for this process.
// It leaves the host ports unset and is therefore a test and harness constructor:
// a production host must use NewAppModelServiceForHost.
func NewAppModelService(emitter StatePatchEmitter) *AppModelService {
	return newAppModelService(emitter, nil, systemLayoutTimer{})
}

// NewAppModelServiceForHost is the production constructor. The host ports are
// positional parameters rather than optional setters, so adding a port here
// breaks every host at compile time instead of leaving it nil.
//
// That distinction is the whole point of this function. SetClipboardWriter and
// SetRevealPort existed and worked, but nothing outside a test ever called them,
// so Copy path and Reveal in file manager returned system-command-failure in
// every shipped binary from the day they were written. An optional setter cannot
// report that it was not called; a parameter list can.
func NewAppModelServiceForHost(emitter StatePatchEmitter, clipboard file.ClipboardWriter, reveal file.RevealPort) *AppModelService {
	service := newAppModelService(emitter, nil, systemLayoutTimer{})
	service.clipboard = clipboard
	service.reveal = reveal
	return service
}

// NewAppModelServiceWithLayoutRepository constructs the production layout seam
// used after startup has opened the local SQLite database.
func NewAppModelServiceWithLayoutRepository(emitter StatePatchEmitter, layout LayoutRepositoryAPI) *AppModelService {
	return newAppModelService(emitter, layout, systemLayoutTimer{})
}

// NewAppModelServiceWithLayoutRepositoryAndTimer is a test and harness
// constructor. It leaves the host ports unset, so no production host may use it;
// the evidence driver used to, which is how Copy path and Reveal reached a nil
// port in the one binary built to measure real behaviour (T167).
func NewAppModelServiceWithLayoutRepositoryAndTimer(emitter StatePatchEmitter, layout LayoutRepositoryAPI, timer LayoutTimer) *AppModelService {
	return newAppModelService(emitter, layout, timer)
}

/*
 * SetLayoutTimer replaces the layout debounce clock on an already-constructed
 * service.
 *
 * This exists so a harness host can take the model the composition root built —
 * with its host ports and its settings joins intact — and change only the clock,
 * instead of constructing a second model and assigning it over the first. The
 * evidence driver did the latter, and it silently cost both host ports plus the
 * autosave and default-open-mode observers the root had already bound.
 *
 * It is deliberately not the pattern used for host ports. A missing clock is
 * benign — the constructor installs systemLayoutTimer and production never calls
 * this — whereas a missing port is a command that cannot work, which is why
 * those stay positional parameters on NewAppModelServiceForHost that break the
 * build when one is added. Read the comment there before turning either into the
 * other.
 *
 * Call before the model schedules anything. It swaps the clock for subsequent
 * scheduling only and does not reschedule work already pending on the old one.
 */
func (service *AppModelService) SetLayoutTimer(timer LayoutTimer) {
	if timer == nil {
		return
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	service.timer = timer
}

func newAppModelService(emitter StatePatchEmitter, layout LayoutRepositoryAPI, timer LayoutTimer) *AppModelService {
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

	if timer == nil {
		timer = systemLayoutTimer{}
	}
	service := &AppModelService{emitter: emitter, layout: layout, timer: timer, autosaveTimer: systemAutosaveTimerFactory{}, autosaveEnabled: true, autosaveTimers: make(map[string]*autosaveTimerEntry), autosaveInFlight: make(map[string]chan struct{}), writerID: newLayoutWriterID(), reservations: make(map[string]*openReservation), saveReservations: make(map[string]*saveReservation), normalizations: make(map[string]*normalizationAuthorization), writeCoordinators: make(map[string]*DocumentWriteCoordinator), closePlans: make(map[string]*closePlan), conflicts: make(map[string]*documentConflict), conflictQueue: newConflictQueue(), keepMine: make(map[string]*keepMineAuthorization), stableRead: file.ReadClassifiedStable, diskVersion: file.CurrentDiskVersion, defaultOpenMode: OpenModeEditor, state: applicationState{
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

// SetConflictReadersForTesting injects deterministic version/read races without
// changing the production foreground-only policy.
func (service *AppModelService) SetConflictReadersForTesting(stableRead func(string, int64) (file.StableClassifiedRead, error), diskVersion func(string) (file.DiskVersion, error)) {
	service.mu.Lock()
	defer service.mu.Unlock()
	if stableRead != nil {
		service.stableRead = stableRead
	}
	if diskVersion != nil {
		service.diskVersion = diskVersion
	}
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

// DefaultOpenMode reports the acknowledged setting Open applies before it resolves
// a path's arrangement. It exists so the composition-root join can be asserted:
// until T119 SetDefaultOpenMode had no production caller at all, and nothing could
// observe that the stored preference never arrived.
func (service *AppModelService) DefaultOpenMode() string {
	service.mu.RLock()
	defer service.mu.RUnlock()
	return service.defaultOpenMode
}

// SetDocumentOpenDialog injects the composition-root native picker without importing Wails here.
func (service *AppModelService) SetDocumentOpenDialog(dialog DocumentOpenDialog) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.openDialog = dialog
}

// SetDocumentSaveDialog injects the composition-root save chooser and native overwrite prompt.
func (service *AppModelService) SetDocumentSaveDialog(dialog DocumentSaveDialog) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.saveDialog = dialog
}

// SetClipboardWriter injects the host clipboard without coupling appmodel to Wails.
func (service *AppModelService) SetClipboardWriter(writer file.ClipboardWriter) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.clipboard = writer
}

// SetRevealPort injects the host file-manager reveal command.
func (service *AppModelService) SetRevealPort(port file.RevealPort) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.reveal = port
}

// SetBeforeSaveAsRecheck is a narrow deterministic test seam for target drift between
// confirmation and the final version/hash comparison.
func (service *AppModelService) SetBeforeSaveAsRecheck(hook func(string)) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.beforeSaveAsRecheck = hook
}

// SetWriteExecutorForTesting injects a deterministic replacement seam before
// the first write coordinator for a document is created.
func (service *AppModelService) SetWriteExecutorForTesting(executor WriteExecutor) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.writeExecutor = executor
}

// SetWriteCommitObserver installs an optional read-only observation seam for
// current-host evidence. It does not alter coordination, timing, or disk I/O.
func (service *AppModelService) SetWriteCommitObserver(observer WriteCommitObserver) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.writeCommitObserver = observer
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
	pendingWork = pendingWork || len(service.autosaveTimers) > 0 || len(service.autosaveInFlight) > 0 || service.pending != nil || service.pendingFlushDone != nil
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
			ApplicationVersion: bootstrap.Version(),
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
	status := saveStatusForDocument(document)
	metadata.Status = string(status)
	metadata.Dirty = status == SaveStatusUnsavedChanges
	metadata.Detached = document.detached
	metadata.ConflictBlocked = document.conflictBlocked
	metadata.WriteInFlight = document.writeInFlight
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
		snapshot.documents[documentID] = &documentCopy
	}
	snapshot.recentlyClosed = append([]recentlyClosedDocument(nil), service.state.recentlyClosed...)
	return snapshot
}

func (service *AppModelService) publishLocked(ctx context.Context, before applicationState, patch apperr.AppStatePatch) (err error) {
	if service.emitter == nil {
		service.state = before
		return apperr.Internal(errors.New("state patch emitter is required"))
	}
	var emitErr error
	if bridge.Protect(func() {
		emitErr = service.emitter.EmitStatePatch(ctx, patch)
	}) {
		service.state = before
		return apperr.Internal(errors.New("emit state patch panicked"))
	}
	if emitErr != nil {
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
