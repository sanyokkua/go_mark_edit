package main

import (
	"context"
	"embed"
	"fmt"
	"os"
	goruntime "runtime"
	"strings"
	"unicode"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/bootstrap"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
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

type nativeRuntimePorts struct {
	showStartupRecoveryWindow func(context.Context)
	emitNativeCloseRequest    func(context.Context, string)
	quitNativeApplication     func(context.Context)
}

func productionNativeRuntimePorts() nativeRuntimePorts {
	return nativeRuntimePorts{
		showStartupRecoveryWindow: runtime.WindowShow,
		emitNativeCloseRequest: func(ctx context.Context, id string) {
			runtime.EventsEmit(ctx, application.NativeCloseRequestEvent, map[string]string{"id": id})
		},
		quitNativeApplication: runtime.Quit,
	}
}

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

	outcomes := bridge.NewOutcomeCache()
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
	applicationContext := application.NewApplicationContextHolderWithOptions(fileUtils, appLogger, application.ApplicationContextOptions{
		AppModelOptions: []appmodel.AppModelOption{appmodel.WithDialogs(dialogs, dialogs)},
	}, outcomes)
	if err := wails.Run(newAppOptionsWithLogger(applicationContext, appLogger)); err != nil {
		bootstrapLogger.Error().Err(err).Msg("run application")
	}
}

// supportedDocumentSuffixes is the one list of suffixes both native pickers
// offer. FR-FT-002 names these four for Open and FR-FT-012 names the same four
// for Save As.
//
// It was two identical literals, one per picker, which is how a filter set can
// drift from the suffixes the backend accepts without anything noticing. The
// backend's copy of the set is `file.IsSupportedDocumentSuffix`, and
// TestNativePickersFilterExactlyTheSupportedSuffixes holds the two equal.
var supportedDocumentSuffixes = []string{".md", ".markdown", ".mdown", ".txt"}

// documentFileFilters is the single suffix filter both native pickers use.
func documentFileFilters() []runtime.FileFilter {
	return documentFileFiltersFor(goruntime.GOOS)
}

// documentFileFiltersFor builds the picker filter for one host.
//
// FR-FT-002 requires the picker to filter *case-insensitively*, and only one of
// the three hosts needs help with that. macOS matches an `NSOpenPanel`'s
// allowed types case-insensitively, and the Windows common item dialog matches
// its filter spec case-insensitively, so on those hosts the four lowercase
// globs already satisfy the clause and a longer list buys nothing.
//
// GTK does not. Wails hands every `;`-separated glob to
// `gtk_file_filter_add_pattern` (`internal/frontend/desktop/linux/window.go`),
// which compiles a GPatternSpec: case-sensitive, and understanding only `*` and
// `?`, so there is no `*.[mM][dD]` to write. Enumerating the case forms is the
// only construct GTK offers, so on Linux the filter carries all 300 of them.
// They are never shown to anyone — the picker displays `DisplayName`.
//
// `*.md` stays the first glob on every host: the Windows Save dialog derives
// its default extension from it (`.../windows/dialog.go`, `DefaultExtension`).
func documentFileFiltersFor(goos string) []runtime.FileFilter {
	globs := make([]string, 0, len(supportedDocumentSuffixes))
	for _, suffix := range supportedDocumentSuffixes {
		if goos == "linux" {
			globs = append(globs, suffixCaseGlobs(suffix)...)
			continue
		}
		globs = append(globs, "*"+suffix)
	}
	return []runtime.FileFilter{{
		DisplayName: "Markdown and text",
		Pattern:     strings.Join(globs, ";"),
	}}
}

// suffixCaseGlobs enumerates every case form of one suffix, all-lowercase first.
func suffixCaseGlobs(suffix string) []string {
	forms := []string{"*"}
	for _, letter := range strings.ToLower(suffix) {
		upper := unicode.ToUpper(letter)
		grown := make([]string, 0, len(forms)*2)
		for _, form := range forms {
			grown = append(grown, form+string(letter))
			if upper != letter {
				grown = append(grown, form+string(upper))
			}
		}
		forms = grown
	}
	return forms
}

func newAppOptions(applicationContext *application.ApplicationContextHolder) *options.App {
	return newAppOptionsWithLogger(applicationContext, nil)
}

func newAppOptionsWithLogger(applicationContext *application.ApplicationContextHolder, appLogger *logging.Logger, overrides ...nativeRuntimePorts) *options.App {
	ports := productionNativeRuntimePorts()
	if len(overrides) > 0 {
		if overrides[0].showStartupRecoveryWindow != nil {
			ports.showStartupRecoveryWindow = overrides[0].showStartupRecoveryWindow
		}
		if overrides[0].emitNativeCloseRequest != nil {
			ports.emitNativeCloseRequest = overrides[0].emitNativeCloseRequest
		}
		if overrides[0].quitNativeApplication != nil {
			ports.quitNativeApplication = overrides[0].quitNativeApplication
		}
	}
	applicationContext.SetNativeWindow(wailsNativeWindow{})
	applicationContext.ConfigureShutdown(
		application.WithCloseRequestedEmitter(ports.emitNativeCloseRequest),
		application.WithNativeQuit(ports.quitNativeApplication),
		application.WithNativeConfirmation(func(ctx context.Context, documents []string) (bool, error) {
			message := "There are unsaved changes."
			if len(documents) > 0 {
				message = "The following documents have unsaved changes:\n\n" + strings.Join(documents, "\n")
			}
			result, err := runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
				Type:          runtime.QuestionDialog,
				Title:         "Quit with unsaved changes?",
				Message:       message,
				Buttons:       []string{"Quit and discard", "Cancel"},
				DefaultButton: "Cancel",
				CancelButton:  "Cancel",
			})
			return result == "Quit and discard", err
		}),
		application.WithShutdownLogger(appLogger),
	)
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
				ports.showStartupRecoveryWindow(ctx)
				return
			}
			if err := applicationContext.RestoreNativeWindow(ctx); err != nil {
				if appLogger != nil {
					appLogger.Error(err.Error())
				}
				ports.showStartupRecoveryWindow(ctx)
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
