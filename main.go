package main

import (
	"context"
	"embed"
	"os"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/bootstrap"
	"github.com/sanyokkua/go_mark_edit/internal/file"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	bootstrapLogger := bootstrap.NewLogger()
	fileUtils := file.NewFileUtilsService(bootstrap.IsDevBuild())
	logDirectory, err := fileUtils.GetAppLogsDir()
	if err != nil {
		bootstrapLogger.Error().Err(err).Msg("resolve log directory")
		os.Exit(1)
	}

	appLogger, err := logging.NewLogger(logDirectory, bootstrap.IsDevBuild())
	if err != nil {
		bootstrapLogger.Error().Err(err).Msg("configure local logger")
		os.Exit(1)
	}
	defer func() {
		if closeErr := appLogger.Close(); closeErr != nil {
			bootstrapLogger.Error().Err(closeErr).Msg("close local logger")
		}
	}()

	applicationContext := application.NewApplicationContextHolder(fileUtils, appLogger)
	if err := wails.Run(newAppOptionsWithLogger(applicationContext, appLogger)); err != nil {
		bootstrapLogger.Error().Err(err).Msg("run application")
	}
}

func newAppOptions(applicationContext *application.ApplicationContextHolder) *options.App {
	return newAppOptionsWithLogger(applicationContext, nil)
}

func newAppOptionsWithLogger(applicationContext *application.ApplicationContextHolder, appLogger *logging.Logger) *options.App {
	return &options.App{
		Title:  "GoMarkEdit",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup: func(ctx context.Context) {
			applicationContext.SetContext(ctx)
			if err := applicationContext.Init(ctx); err != nil && appLogger != nil {
				appLogger.Error(err.Error())
			}
		},
		OnShutdown: func(_ context.Context) {
			_ = applicationContext.Close()
			if appLogger != nil {
				_ = appLogger.Close()
			}
		},
		Bind:     []interface{}{applicationContext.SettingsHandler},
		EnumBind: []interface{}{apperr.AllErrorCodes},
		Logger:   appLogger,
	}
}
