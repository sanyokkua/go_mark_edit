// Package application contains the application's composition-root seams.
package application

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/bootstrap"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/file"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
	"github.com/sanyokkua/go_mark_edit/internal/settings"
)

// ApplicationContextHolder stores the Wails lifecycle context for application
// services that are added by later stories. It is intentionally not Wails-bound.
type ApplicationContextHolder struct {
	mu      sync.Mutex
	retryMu sync.Mutex

	ctx        context.Context
	startupErr error

	// startupOpen is true until the frontend reports ready; only then does the
	// window still accept one external path. targetAccepted and launchTarget
	// hold that path until the frontend takes it.
	startupOpen    bool
	targetAccepted bool
	launchTarget   string
	emitEvent      func(context.Context, string, ...any)
	// ownTarget is the path this window was opened for; the window never opens
	// another window for it. recentLaunches holds paths a window was just started
	// for, until that window has registered itself.
	ownTarget      string
	recentLaunches map[string]time.Time
	windows        *WindowRegistry

	DB *db.Database

	fileService        file.FileUtilsServiceAPI
	appLogger          *logging.Logger
	settingsRepository settings.SettingsRepositoryAPI
	newWindowLauncher  NewWindowLauncher

	SettingsService     *settings.SettingsService
	SettingsHandler     *settings.SettingsHandler
	AppModelService     *appmodel.AppModelService
	AppModelHandler     *appmodel.AppModelHandler
	NativeWindowService *NativeWindowService
	ApplicationHandler  *ApplicationHandler
	Shutdown            *ShutdownOwner
}

// ApplicationContextOptions supplies host seams and explicit startup arguments
// before startup begins. Production leaves SettingsRepository nil so Init can
// inject the SQLite repository; the launcher is supplied by the desktop
// composition root and can be replaced by integration hosts.
type ApplicationContextOptions struct {
	SettingsRepository settings.SettingsRepositoryAPI
	AppModelOptions    []appmodel.AppModelOption
	NewWindowLauncher  NewWindowLauncher
	// StartupArgs is the process argument list without the program name.
	StartupArgs []string
	// EmitEvent publishes a Wails event; hosts without a runtime leave it nil.
	EmitEvent func(context.Context, string, ...any)
	// WindowRegistry lists the live windows so a file is not opened twice and the
	// window count stays bounded; hosts without one leave it nil.
	WindowRegistry *WindowRegistry
}

// NewApplicationContextHolderWithOptions constructs the phase-one graph with
// explicit persistence options for hosts that need to exercise startup
// recovery without replacing a service after construction.
func NewApplicationContextHolderWithOptions(fileService file.FileUtilsServiceAPI, appLogger *logging.Logger, options ApplicationContextOptions, outcomeCaches ...*bridge.OutcomeCache) *ApplicationContextHolder {
	outcomes := bridge.NewOutcomeCache()
	if len(outcomeCaches) > 0 && outcomeCaches[0] != nil {
		outcomes = outcomeCaches[0]
	}
	settingsService := settings.NewSettingsService(nil)
	// The host ports go in through the constructor and are built here, where the
	// composition root cannot forget them. A port added to
	// NewAppModelServiceForHost later fails to compile here rather than going out
	// nil.
	modelOptions := []appmodel.AppModelOption{
		appmodel.WithEmitter(RuntimeEmitter{}),
		appmodel.WithClipboardWriter(file.NewPlatformClipboardWriter()),
		appmodel.WithRevealPort(file.NewPlatformRevealPort()),
		appmodel.WithVersion(bootstrap.Version()),
	}
	if appLogger != nil {
		modelOptions = append(modelOptions, appmodel.WithLogger(appLogger.Zerolog()))
	}
	modelOptions = append(modelOptions, options.AppModelOptions...)
	appModelService := appmodel.NewAppModelServiceForHost(
		modelOptions...,
	)
	holder := &ApplicationContextHolder{
		fileService:        fileService,
		appLogger:          appLogger,
		settingsRepository: options.SettingsRepository,
		newWindowLauncher:  options.NewWindowLauncher,
		emitEvent:          options.EmitEvent,
		windows:            options.WindowRegistry,
		recentLaunches:     map[string]time.Time{},
		startupOpen:        true,
		SettingsService:    settingsService,
		AppModelService:    appModelService,
	}
	startupPath := firstStartupPath(options.StartupArgs)
	if startupPath != "" {
		holder.AcceptOpenRequest(startupPath)
	}
	// Register after the target is known so a path for this window is never
	// opened again, and so this window counts toward the limit.
	_ = holder.windows.Register(startupPath)
	// Settings owns the autosave preference and the document model owns the
	// scheduler; this composition root is the boundary where the preference
	// becomes a command rather than a passive projection.
	settingsService.SetAutosaveObserver(appModelService.SetAutosaveEnabled)
	// The observer copies the persisted open-mode preference into the document
	// model. The packages remain independent; this composition layer performs the
	// conversion at their shared boundary.
	settingsService.SetDefaultOpenModeObserver(appModelService.SetDefaultOpenMode)
	holder.SettingsHandler = settings.NewSettingsHandler(settingsService, appLogger, holder.Context, outcomes)
	holder.AppModelHandler = appmodel.NewAppModelHandler(appModelService, appLogger, holder.Context, outcomes)
	holder.NativeWindowService = NewNativeWindowService(appModelService, nil)
	holder.ApplicationHandler = NewApplicationHandler(holder, appLogger, holder.Context, outcomes)
	holder.Shutdown = NewShutdownOwner(applicationShutdownModel{holder: holder}, WithShutdownLogger(appLogger))
	return holder
}

// applicationShutdownModel keeps the shutdown owner attached to the holder's
// current model. This matters during startup recovery and for hosts that swap
// the model's repository wiring after construction.
type applicationShutdownModel struct {
	holder *ApplicationContextHolder
}

func (port applicationShutdownModel) model() *appmodel.AppModelService {
	port.holder.mu.Lock()
	defer port.holder.mu.Unlock()
	return port.holder.AppModelService
}

func (port applicationShutdownModel) CloseStatus() ([]string, bool) {
	model := port.model()
	if model == nil {
		return nil, false
	}
	return model.CloseStatus()
}

func (port applicationShutdownModel) BeginShutdownDrain() {
	if model := port.model(); model != nil {
		model.BeginShutdownDrain()
	}
}

func (port applicationShutdownModel) EndShutdownDrain() {
	if model := port.model(); model != nil {
		model.EndShutdownDrain()
	}
}

func (port applicationShutdownModel) DrainBeforeClose() *apperr.ClassifiedError {
	if model := port.model(); model != nil {
		return model.DrainBeforeClose()
	}
	return nil
}

func (port applicationShutdownModel) SetPendingClose(id string) {
	if model := port.model(); model != nil {
		model.SetPendingClose(id)
	}
}

func (port applicationShutdownModel) ClearPendingClose(id string) {
	if model := port.model(); model != nil {
		model.ClearPendingClose(id)
	}
}

// SetContext records the context Wails supplies during application startup.
func (holder *ApplicationContextHolder) SetContext(ctx context.Context) {
	holder.mu.Lock()
	holder.ctx = ctx
	service := holder.AppModelService
	holder.mu.Unlock()
	if service != nil {
		service.SetRuntimeContext(ctx)
	}
}

// Context returns the lifecycle context captured during startup.
func (holder *ApplicationContextHolder) Context() context.Context {
	holder.mu.Lock()
	defer holder.mu.Unlock()

	return holder.ctx
}

// Init opens the local settings database and completes phase-two DI.
func (holder *ApplicationContextHolder) Init(ctx context.Context) error {
	holder.mu.Lock()
	defer holder.mu.Unlock()

	if holder.DB != nil {
		holder.startupErr = nil
		holder.AppModelService.SetStartupError(nil)
		return nil
	}
	if holder.fileService == nil {
		holder.startupErr = fmt.Errorf("application file service is required")
		holder.AppModelService.SetStartupError(holder.startupErr)
		return holder.startupErr
	}

	databasePath, err := holder.fileService.GetAppDatabaseFilePath()
	if err != nil {
		holder.startupErr = fmt.Errorf("resolve settings database path: %w", err)
		holder.AppModelService.SetStartupError(holder.startupErr)
		return holder.startupErr
	}
	database, err := db.Open(ctx, databasePath)
	if err != nil {
		holder.startupErr = fmt.Errorf("open settings database: %w", err)
		holder.AppModelService.SetStartupError(holder.startupErr)
		return holder.startupErr
	}

	var repository settings.SettingsRepositoryAPI = settings.NewSqliteSettingsRepository(database)
	if holder.settingsRepository != nil {
		repository = holder.settingsRepository
	}
	holder.SettingsService.SetRepository(repository)
	holder.AppModelService.SetLayoutRepository(appmodel.NewSqliteLayoutRepository(database))
	holder.AppModelService.SetFileMetadataRepository(appmodel.NewSqliteFileMetadataRepository(database))
	holder.AppModelService.SetRecentItemsRepository(appmodel.NewSqliteRecentItemsRepository(database))
	holder.DB = database
	holder.applyPersistedAutosavePreference(ctx)
	holder.applyPersistedDefaultOpenMode(ctx)
	holder.startupErr = nil
	holder.AppModelService.SetStartupError(nil)
	return nil
}

// applyPersistedAutosavePreference pushes the stored preference into the
// document model once at startup. Without it the observer only fires when the
// user toggles the switch, so a preference of "off" would silently come back on
// at every launch.
//
// An unreadable store is not a reason to change behaviour: autosave stays at its
// documented default rather than being disabled by a failure to read.
func (holder *ApplicationContextHolder) applyPersistedAutosavePreference(ctx context.Context) {
	stored, err := holder.SettingsService.Get(ctx)
	if err != nil {
		return
	}
	holder.AppModelService.SetAutosaveEnabled(stored.File.Autosave)
}

// applyPersistedDefaultOpenMode pushes the stored preference into the document
// model once at startup. The observer alone only fires when the setting is
// written, so a stored preference of Reading would silently come back as Editor
// at every launch. Applying the stored value during bootstrap keeps the initial
// document mode consistent with the preference before any observer fires.
//
// An unreadable store leaves the documented default of Editor in place.
func (holder *ApplicationContextHolder) applyPersistedDefaultOpenMode(ctx context.Context) {
	stored, err := holder.SettingsService.Get(ctx)
	if err != nil {
		return
	}
	holder.AppModelService.SetDefaultOpenMode(stored.Appearance.DefaultOpenMode)
}

func (holder *ApplicationContextHolder) RetryStartup(ctx context.Context) error {
	holder.retryMu.Lock()
	defer holder.retryMu.Unlock()

	if err := holder.Init(ctx); err != nil {
		return err
	}
	if err := holder.refreshPersistedSettings(ctx); err != nil {
		return err
	}
	return holder.RestoreNativeWindow(ctx)
}

// refreshPersistedSettings is the recoverable half of RetryStartup. Init is
// intentionally idempotent once SQLite is open, so a retry must still perform
// a real settings read and republish the two preferences that affect the
// document model.
func (holder *ApplicationContextHolder) refreshPersistedSettings(ctx context.Context) error {
	stored, err := holder.SettingsService.Get(ctx)
	if err != nil {
		holder.mu.Lock()
		holder.startupErr = err
		holder.mu.Unlock()
		holder.AppModelService.SetStartupError(err)
		return err
	}
	holder.AppModelService.SetAutosaveEnabled(stored.File.Autosave)
	holder.AppModelService.SetDefaultOpenMode(stored.Appearance.DefaultOpenMode)
	holder.mu.Lock()
	holder.startupErr = nil
	holder.mu.Unlock()
	holder.AppModelService.SetStartupError(nil)
	return nil
}

// FrontendReady closes the window to further startup targets and forwards the
// independent webview readiness signal to the currently wired native-window
// service.
func (holder *ApplicationContextHolder) FrontendReady(ctx context.Context) {
	holder.mu.Lock()
	holder.startupOpen = false
	service := holder.NativeWindowService
	shutdown := holder.Shutdown
	holder.mu.Unlock()
	if service != nil {
		service.FrontendReady(ctx)
	}
	if shutdown != nil {
		shutdown.WindowReady(ctx)
	}
}

// PrintWindow opens the native print dialog through the currently wired
// native-window service.
func (holder *ApplicationContextHolder) PrintWindow(ctx context.Context) {
	holder.mu.Lock()
	service := holder.NativeWindowService
	holder.mu.Unlock()
	if service != nil {
		service.Print(ctx)
	}
}

// FlushBeforeClose is the synchronous native-close durability port. A caller
// must veto close when it returns an error so SQLite remains available for a
// later retry.
func (holder *ApplicationContextHolder) FlushBeforeClose() error {
	holder.mu.Lock()
	service := holder.AppModelService
	holder.mu.Unlock()
	if service == nil {
		return nil
	}
	return service.FlushPendingUILayout()
}

// ConfigureShutdown installs the native ports owned by the composition root.
func (holder *ApplicationContextHolder) ConfigureShutdown(options ...ShutdownOption) {
	holder.mu.Lock()
	shutdown := holder.Shutdown
	holder.mu.Unlock()
	if shutdown != nil {
		shutdown.ConfigureShutdown(options...)
	}
}

// BeforeClose is the Wails veto hook owned by the shutdown protocol.
func (holder *ApplicationContextHolder) BeforeClose(ctx context.Context) bool {
	holder.mu.Lock()
	shutdown := holder.Shutdown
	holder.mu.Unlock()
	if shutdown == nil {
		return false
	}
	return shutdown.BeforeClose(ctx)
}

// DrainBeforeClose runs the full shutdown drain: accepted autosave and
// editor work, then the SQLite layout intent. It is separate from
// FlushBeforeClose, which stays the narrow Wails durability port used by the
// veto hook and by Close.
func (holder *ApplicationContextHolder) DrainBeforeClose() *apperr.ClassifiedError {
	holder.mu.Lock()
	service := holder.AppModelService
	holder.mu.Unlock()
	if service == nil {
		return nil
	}
	return service.DrainBeforeClose()
}

// AuthorizeQuit drains every accepted layout, editor and autosave change before
// creating the one-shot native close permit. A failed drain leaves the request
// pending for Retry and can never create a permit.
//
// It returns a *apperr.ClassifiedError so the caller can show the failure as a
// classified io-failure offering Retry. A plain WireError carries no remediation.
func (holder *ApplicationContextHolder) AuthorizeQuit(ctx context.Context, closeID string) *apperr.ClassifiedError {
	holder.mu.Lock()
	shutdown := holder.Shutdown
	holder.mu.Unlock()
	if shutdown == nil {
		return bridge.ClassifiedWithID(apperr.ClassifiedUnsupportedInput, "native close", "This build cannot authorize a native close.", apperr.RemediationNone, closeID)
	}
	return shutdown.AuthorizeQuit(ctx, closeID)
}

// CancelQuit abandons the pending native close without creating a permit.
func (holder *ApplicationContextHolder) CancelQuit(ctx context.Context, closeID string) *apperr.ClassifiedError {
	holder.mu.Lock()
	shutdown := holder.Shutdown
	holder.mu.Unlock()
	if shutdown == nil {
		return bridge.ClassifiedWithID(apperr.ClassifiedUnsupportedInput, "native close", "This build cannot cancel a native close.", apperr.RemediationNone, closeID)
	}
	return shutdown.CancelQuit(ctx, closeID)
}

// Close releases the application-owned database. It is safe to call repeatedly.
func (holder *ApplicationContextHolder) Close() error {
	if err := holder.FlushBeforeClose(); err != nil {
		return err
	}

	holder.mu.Lock()
	database := holder.DB
	holder.DB = nil
	windows := holder.windows
	holder.mu.Unlock()
	windows.Unregister()

	if database == nil {
		return nil
	}
	return database.Close()
}

// SetNativeWindow completes the composition-root native port after Wails has
// supplied its lifecycle context.
func (holder *ApplicationContextHolder) SetNativeWindow(native NativeWindowAPI) {
	holder.mu.Lock()
	defer holder.mu.Unlock()
	holder.NativeWindowService = NewNativeWindowService(holder.AppModelService, native)
}

// RestoreNativeWindow applies saved layout before frontend readiness.
func (holder *ApplicationContextHolder) RestoreNativeWindow(ctx context.Context) error {
	holder.mu.Lock()
	service := holder.NativeWindowService
	holder.mu.Unlock()
	return service.Restore(ctx)
}
