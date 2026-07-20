// Package application contains the application's composition-root seams.
package application

import (
	"context"
	"fmt"
	"sync"

	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/file"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
	"github.com/sanyokkua/go_mark_edit/internal/settings"
)

// ApplicationContextHolder stores the Wails lifecycle context for application
// services that are added by later stories. It is intentionally not Wails-bound.
type ApplicationContextHolder struct {
	mu sync.Mutex

	ctx context.Context

	DB *db.Database

	fileService file.FileUtilsServiceAPI
	appLogger   *logging.Logger

	SettingsService *settings.SettingsService
	SettingsHandler *settings.SettingsHandler
}

// NewApplicationContextHolder constructs the phase-one dependency graph with
// nil persistence. Init injects its concrete SQLite repository after startup.
func NewApplicationContextHolder(fileService file.FileUtilsServiceAPI, appLogger *logging.Logger) *ApplicationContextHolder {
	settingsService := settings.NewSettingsService(nil)
	holder := &ApplicationContextHolder{
		fileService:     fileService,
		appLogger:       appLogger,
		SettingsService: settingsService,
	}
	holder.SettingsHandler = settings.NewSettingsHandler(settingsService, appLogger, holder.Context)
	return holder
}

// SetContext records the context Wails supplies during application startup.
func (holder *ApplicationContextHolder) SetContext(ctx context.Context) {
	holder.mu.Lock()
	defer holder.mu.Unlock()

	holder.ctx = ctx
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
		return nil
	}
	if holder.fileService == nil {
		return fmt.Errorf("application file service is required")
	}

	databasePath, err := holder.fileService.GetAppDatabaseFilePath()
	if err != nil {
		return fmt.Errorf("resolve settings database path: %w", err)
	}
	database, err := db.Open(ctx, databasePath)
	if err != nil {
		return fmt.Errorf("open settings database: %w", err)
	}

	holder.SettingsService.SetRepository(settings.NewSqliteSettingsRepository(database))
	holder.DB = database
	return nil
}

// Close releases the application-owned database. It is safe to call repeatedly.
func (holder *ApplicationContextHolder) Close() error {
	holder.mu.Lock()
	database := holder.DB
	holder.DB = nil
	holder.mu.Unlock()

	return database.Close()
}
