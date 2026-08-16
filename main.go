package main

import (
	"context"
	"embed"
	"fmt"
	"os"
	goruntime "runtime"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
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
	emitNativeCloseRequest    = func(ctx context.Context) {
		runtime.EventsEmit(ctx, application.NativeCloseRequestEvent)
	}
	quitNativeApplication = runtime.Quit
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
	dialogs := application.NewDocumentDialogs(func(ctx context.Context) (string, error) {
		return runtime.OpenFileDialog(ctx, runtime.OpenDialogOptions{
			Title:   "Open Markdown or text file",
			Filters: documentFileFilters(),
		})
	})
	dialogs.SetSaveFilePicker(func(ctx context.Context, request appmodel.SaveDialogRequest) (string, error) {
		return runtime.SaveFileDialog(ctx, runtime.SaveDialogOptions{
			Title:            request.Title,
			DefaultDirectory: request.DefaultDirectory,
			DefaultFilename:  request.DefaultFilename,
			Filters:          documentFileFilters(),
		})
	})
	dialogs.SetOverwriteConfirmer(func(ctx context.Context, subject string) (bool, error) {
		result, err := runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
			Type:          runtime.QuestionDialog,
			Title:         "Overwrite file?",
			Message:       fmt.Sprintf("Overwrite %s?", subject),
			Buttons:       []string{"Overwrite", "Cancel"},
			DefaultButton: "Cancel",
			CancelButton:  "Cancel",
		})
		return result == "Overwrite", err
	})
	applicationContext.SetDocumentDialogs(dialogs)
	if err := wails.Run(newAppOptionsWithLogger(applicationContext, appLogger)); err != nil {
		bootstrapLogger.Error().Err(err).Msg("run application")
	}
}

// documentFileFilters is the single suffix filter both native pickers use.
//
// It was two identical literals, one per picker, which is how a filter set can
// drift from the suffixes the backend accepts without anything noticing.
// FR-FT-002 names the four suffixes for Open and FR-FT-012 names the same four
// for Save As, so there is one list, checked against
// `file.IsSupportedDocumentSuffix` by TestNativePickersFilterExactlyTheSupportedSuffixes.
func documentFileFilters() []runtime.FileFilter {
	return []runtime.FileFilter{{
		DisplayName: "Markdown and text",
		Pattern:     "*.md;*.markdown;*.mdown;*.txt",
	}}
}

func newAppOptions(applicationContext *application.ApplicationContextHolder) *options.App {
	return newAppOptionsWithLogger(applicationContext, nil)
}

func newAppOptionsWithLogger(applicationContext *application.ApplicationContextHolder, appLogger *logging.Logger) *options.App {
	applicationContext.SetNativeWindow(wailsNativeWindow{})
	applicationContext.SetCloseCoordinator(application.NewCloseCoordinator(emitNativeCloseRequest, quitNativeApplication))
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
		OnBeforeClose: func(ctx context.Context) bool {
			return applicationContext.BeforeClose(ctx)
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
