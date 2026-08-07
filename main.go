package main

import (
	"context"
	"embed"
	"os"
	goruntime "runtime"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/bootstrap"
	"github.com/sanyokkua/go_mark_edit/internal/file"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

var (
	showStartupRecoveryWindow = runtime.WindowShow
)

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
	applicationContext.SetNativeWindow(wailsNativeWindow{})
	return &options.App{
		Title:         "GoMarkEdit",
		Width:         1024,
		Height:        768,
		MinWidth:      375,
		MinHeight:     480,
		Frameless:     false,
		DisableResize: false,
		StartHidden:   true,
		Mac:           &mac.Options{DisableZoom: false},
		Menu:          nativeMenuForPlatform(goruntime.GOOS),
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup: func(ctx context.Context) {
			applicationContext.SetContext(ctx)
			if err := applicationContext.Init(ctx); err != nil {
				if appLogger != nil {
					appLogger.Error(err.Error())
				}
				showStartupRecoveryWindow(ctx)
				return
			}
			if err := applicationContext.RestoreNativeWindow(ctx); err != nil {
				if appLogger != nil {
					appLogger.Error(err.Error())
				}
				showStartupRecoveryWindow(ctx)
				return
			}
		},
		OnShutdown: func(_ context.Context) {
			_ = applicationContext.Close()
			if appLogger != nil {
				_ = appLogger.Close()
			}
		},
		OnBeforeClose: func(_ context.Context) bool {
			return applicationContext.FlushBeforeClose() != nil
		},
		Bind:     []interface{}{applicationContext.AppModelHandler, applicationContext.SettingsHandler, applicationContext.ApplicationHandler},
		EnumBind: []interface{}{apperr.AllErrorCodes},
		Logger:   appLogger,
	}
}

type wailsNativeWindow struct{}

func (wailsNativeWindow) UsableSize(ctx context.Context) (int, int) {
	screens, err := runtime.ScreenGetAll(ctx)
	if err != nil {
		return 0, 0
	}
	for _, screen := range screens {
		if screen.IsCurrent || screen.IsPrimary {
			return screen.Size.Width, screen.Size.Height
		}
	}
	return 0, 0
}

func (wailsNativeWindow) SetSize(ctx context.Context, width, height int) {
	runtime.WindowSetSize(ctx, width, height)
}

func (wailsNativeWindow) Maximise(ctx context.Context) { runtime.WindowMaximise(ctx) }

func (wailsNativeWindow) Show(ctx context.Context) { runtime.WindowShow(ctx) }

// nativeMenuForPlatform preserves the platform editing role without creating a
// second About entry. The working About action belongs only to the application
// shell, where it has access to the injected build identity.
func nativeMenuForPlatform(platform string) *menu.Menu {
	return application.NativeMenuForPlatform(platform)
}
