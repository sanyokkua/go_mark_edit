// Package application contains the application's composition-root seams.
package application

import (
	"context"
	"fmt"
	"sync"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/file"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
	"github.com/sanyokkua/go_mark_edit/internal/settings"
)

// ApplicationContextHolder stores the Wails lifecycle context for application
// services that are added by later stories. It is intentionally not Wails-bound.
type ApplicationContextHolder struct {
	mu sync.Mutex

	ctx        context.Context
	startupErr error

	DB *db.Database

	fileService file.FileUtilsServiceAPI
	appLogger   *logging.Logger

	SettingsService     *settings.SettingsService
	SettingsHandler     *settings.SettingsHandler
	AppModelService     *appmodel.AppModelService
	AppModelHandler     *appmodel.AppModelHandler
	NativeWindowService *NativeWindowService
	ApplicationHandler  *ApplicationHandler
	DocumentDialogs     *DocumentDialogs
	closeCoordinator    *CloseCoordinator
}

// NewApplicationContextHolder constructs the phase-one dependency graph with
// nil persistence. Init injects its concrete SQLite repository after startup.
func NewApplicationContextHolder(fileService file.FileUtilsServiceAPI, appLogger *logging.Logger) *ApplicationContextHolder {
	settingsService := settings.NewSettingsService(nil)
	appModelService := appmodel.NewAppModelService(appmodel.RuntimeStatePatchEmitter{})
	holder := &ApplicationContextHolder{
		fileService:     fileService,
		appLogger:       appLogger,
		SettingsService: settingsService,
		AppModelService: appModelService,
	}
	holder.SettingsHandler = settings.NewSettingsHandler(settingsService, appLogger, holder.Context)
	holder.AppModelHandler = appmodel.NewAppModelHandler(appModelService, appLogger, holder.Context)
	holder.NativeWindowService = NewNativeWindowService(appModelService, nil)
	holder.ApplicationHandler = NewApplicationHandler(holder, appLogger, holder.Context)
	return holder
}

// SetDocumentDialogs wires the composition-root native pickers into backend-owned file commands.
func (holder *ApplicationContextHolder) SetDocumentDialogs(dialogs *DocumentDialogs) {
	holder.mu.Lock()
	holder.DocumentDialogs = dialogs
	service := holder.AppModelService
	holder.mu.Unlock()
	service.SetDocumentOpenDialog(dialogs)
	service.SetDocumentSaveDialog(dialogs)
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

	holder.SettingsService.SetRepository(settings.NewSqliteSettingsRepository(database))
	holder.AppModelService.SetLayoutRepository(appmodel.NewSqliteLayoutRepository(database))
	holder.AppModelService.SetFileMetadataRepository(appmodel.NewSqliteFileMetadataRepository(database))
	holder.AppModelService.SetRecentFilesRepository(appmodel.NewSqliteRecentFilesRepository(database))
	holder.DB = database
	holder.startupErr = nil
	holder.AppModelService.SetStartupError(nil)
	return nil
}

func (holder *ApplicationContextHolder) StartupReady() bool {
	holder.mu.Lock()
	defer holder.mu.Unlock()
	return holder.DB != nil && holder.startupErr == nil
}

func (holder *ApplicationContextHolder) RetryStartup(ctx context.Context) error {
	if err := holder.Init(ctx); err != nil {
		return err
	}
	return holder.RestoreNativeWindow(ctx)
}

// FrontendReady forwards the independent webview readiness signal to the
// currently wired native-window service.
func (holder *ApplicationContextHolder) FrontendReady(ctx context.Context) {
	holder.mu.Lock()
	service := holder.NativeWindowService
	holder.mu.Unlock()
	if service != nil {
		service.FrontendReady(ctx)
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

// SetCloseCoordinator installs the native close protocol owned by the
// composition root. Tests and non-Wails callers may leave it unset and use
// the synchronous legacy flush fallback through BeforeClose.
func (holder *ApplicationContextHolder) SetCloseCoordinator(coordinator *CloseCoordinator) {
	holder.mu.Lock()
	holder.closeCoordinator = coordinator
	holder.mu.Unlock()
}

// BeforeClose is the Wails veto hook. A native request is always vetoed once
// so the frontend can finish its asynchronous close plan before authorization.
func (holder *ApplicationContextHolder) BeforeClose(ctx context.Context) bool {
	holder.mu.Lock()
	coordinator := holder.closeCoordinator
	holder.mu.Unlock()
	if coordinator == nil {
		return holder.FlushBeforeClose() != nil
	}
	return coordinator.BeforeClose(ctx)
}

// AuthorizeQuit drains the editor/layout path before creating the one-shot
// native close permit. A failed drain leaves the request pending for Retry and
// can never create a permit.
func (holder *ApplicationContextHolder) AuthorizeQuit(ctx context.Context) error {
	if err := holder.FlushBeforeClose(); err != nil {
		return apperr.IO("native close drain", err)
	}

	holder.mu.Lock()
	coordinator := holder.closeCoordinator
	holder.mu.Unlock()
	if coordinator == nil {
		return apperr.Unsupported("native close authorization")
	}
	if err := coordinator.Authorize(ctx); err != nil {
		return apperr.Validation("native close", "a pending native close request", "none")
	}
	return nil
}

// CancelQuit abandons the pending native close without creating a permit.
func (holder *ApplicationContextHolder) CancelQuit(context.Context) {
	holder.mu.Lock()
	coordinator := holder.closeCoordinator
	holder.mu.Unlock()
	if coordinator != nil {
		coordinator.Cancel()
	}
}

// Close releases the application-owned database. It is safe to call repeatedly.
func (holder *ApplicationContextHolder) Close() error {
	if err := holder.FlushBeforeClose(); err != nil {
		return err
	}

	holder.mu.Lock()
	database := holder.DB
	holder.DB = nil
	holder.mu.Unlock()

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
