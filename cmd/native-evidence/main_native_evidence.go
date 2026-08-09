//go:build native_evidence

package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/file"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var (
	nativeEvidenceAssetsDir   string
	nativeEvidenceDatabaseDir string
	nativeEvidenceInstance    = "native-evidence"
	nativeEvidenceScenario    string
	nativeEvidenceAutosave    *autosaveLatencyScenario
)

func main() {
	parseNativeEvidenceFlags()
	if err := validateNativeEvidenceConfiguration(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}

	paths := &nativeEvidencePaths{
		databaseDir: nativeEvidenceDatabaseDir,
		scenario:    nativeEvidenceScenario,
	}
	holder := application.NewApplicationContextHolder(paths, nil)
	configureNativeEvidenceDependencies(holder, nativeEvidenceScenario)

	fmt.Printf("native-evidence scenario=%s instance=%s database=%s\n", nativeEvidenceScenario, nativeEvidenceInstance, paths.databasePath())
	if err := wails.Run(nativeEvidenceOptions(holder, paths)); err != nil {
		fmt.Fprintf(os.Stderr, "native evidence run: %v\n", err)
		os.Exit(1)
	}
}

func parseNativeEvidenceFlags() {
	scenario := flag.String("scenario", nativeEvidenceScenario, "native evidence scenario")
	assets := flag.String("assets", nativeEvidenceAssetsDir, "native evidence frontend assets directory")
	database := flag.String("database", nativeEvidenceDatabaseDir, "native evidence database and evidence directory")
	flag.Parse()
	nativeEvidenceScenario = *scenario
	nativeEvidenceAssetsDir = *assets
	nativeEvidenceDatabaseDir = *database
	if nativeEvidenceAssetsDir == "" && nativeEvidenceScenario != "" {
		nativeEvidenceAssetsDir = filepath.Join("frontend", "dist-native-evidence", nativeEvidenceScenario)
	}
	if nativeEvidenceDatabaseDir == "" {
		nativeEvidenceDatabaseDir = filepath.Join(os.TempDir(), "gomarkedit-native-evidence")
	}
}

func validateNativeEvidenceConfiguration() error {
	if nativeEvidenceScenario == "" {
		return errors.New("native evidence scenario was not injected at build time")
	}
	if nativeEvidenceAssetsDir == "" {
		return errors.New("native evidence asset directory was not injected at build time")
	}
	if nativeEvidenceDatabaseDir == "" {
		return errors.New("native evidence database directory was not injected at build time")
	}
	if _, err := os.Stat(filepath.Join(nativeEvidenceAssetsDir, "index.html")); err != nil {
		return fmt.Errorf("native evidence assets: %w", err)
	}
	return nil
}

func configureNativeEvidenceDependencies(holder *application.ApplicationContextHolder, scenario string) {
	nativeEvidenceAutosave = nil
	var timer nativeEvidenceLayoutTimer = systemNativeEvidenceTimer{}
	switch scenario {
	case "pending-close", "stale-close-old":
		timer = stalledNativeEvidenceTimer{}
	case "stale-close-new":
		timer = immediateNativeEvidenceTimer{}
	case "autosave-latency":
		latencyScenario, err := newAutosaveLatencyScenario(nativeEvidenceDatabaseDir)
		if err != nil {
			panic(err)
		}
		nativeEvidenceAutosave = latencyScenario
	}

	model := appmodel.NewAppModelServiceWithLayoutRepositoryAndTimer(
		appmodel.RuntimeStatePatchEmitter{},
		nil,
		timer,
	)
	holder.AppModelService = model
	if nativeEvidenceAutosave != nil {
		model.SetDocumentOpenDialog(nativeEvidenceAutosave)
		model.SetWriteCommitObserver(nativeEvidenceAutosave.recordCommit)
	}
	holder.AppModelHandler = appmodel.NewAppModelHandler(model, nil, holder.Context)
	holder.NativeWindowService = application.NewNativeWindowService(model, nil)
	holder.ApplicationHandler = application.NewApplicationHandler(holder, nil, holder.Context)
}

func nativeEvidenceOptions(holder *application.ApplicationContextHolder, paths *nativeEvidencePaths) *options.App {
	holder.SetNativeWindow(nativeEvidenceWindow{})
	holder.SetCloseCoordinator(application.NewCloseCoordinator(
		func(ctx context.Context) {
			wailsruntime.EventsEmit(ctx, application.NativeCloseRequestEvent)
		},
		wailsruntime.Quit,
	))
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
		Menu:          nativeEvidenceMenuForPlatform(runtime.GOOS),
		AssetServer: &assetserver.Options{
			Assets: os.DirFS(nativeEvidenceAssetsDir),
		},
		OnStartup: func(ctx context.Context) {
			holder.SetContext(ctx)
			if nativeEvidenceAutosave != nil {
				nativeEvidenceAutosave.attachContext(ctx)
				wailsruntime.EventsOn(ctx, autosaveInputEvent, nativeEvidenceAutosave.recordInput)
				wailsruntime.EventsOn(ctx, autosaveMissEvent, nativeEvidenceAutosave.recordMiss)
			}
			if err := holder.Init(ctx); err != nil {
				wailsruntime.WindowShow(ctx)
				return
			}
			if err := holder.RestoreNativeWindow(ctx); err != nil {
				wailsruntime.WindowShow(ctx)
			}
		},
		OnBeforeClose: func(ctx context.Context) bool {
			return holder.BeforeClose(ctx)
		},
		OnShutdown: func(_ context.Context) {
			_ = holder.Close()
		},
		Bind: []interface{}{
			holder.AppModelHandler,
			holder.SettingsHandler,
			holder.ApplicationHandler,
		},
		EnumBind: []interface{}{apperr.AllErrorCodes},
		Logger:   &nativeEvidenceLogger{path: filepath.Join(paths.databaseDir, "native-evidence.log")},
	}
}

func nativeEvidenceMenuForPlatform(platform string) *menu.Menu {
	return application.NativeMenuForPlatform(platform)
}

type nativeEvidencePaths struct {
	mu          sync.Mutex
	databaseDir string
	scenario    string
	pathCalls   int
}

var _ file.FileUtilsServiceAPI = (*nativeEvidencePaths)(nil)

func (paths *nativeEvidencePaths) GetAppConfigDir() (string, error) {
	return paths.databaseDir, nil
}

func (paths *nativeEvidencePaths) GetAppLogsDir() (string, error) {
	return filepath.Join(paths.databaseDir, "logs"), nil
}

func (paths *nativeEvidencePaths) GetAppDatabaseFilePath() (string, error) {
	paths.mu.Lock()
	defer paths.mu.Unlock()
	paths.pathCalls++
	if paths.scenario == "startup-retry" && paths.pathCalls <= 2 {
		return "", errors.New("injected settings path failure")
	}
	return paths.databasePath(), nil
}

func (paths *nativeEvidencePaths) databasePath() string {
	return filepath.Join(paths.databaseDir, "settings.db")
}

type nativeEvidenceLayoutTimer interface {
	AfterFunc(time.Duration, func())
}

type systemNativeEvidenceTimer struct{}

func (systemNativeEvidenceTimer) AfterFunc(delay time.Duration, callback func()) {
	time.AfterFunc(delay, callback)
}

type stalledNativeEvidenceTimer struct{}

func (stalledNativeEvidenceTimer) AfterFunc(time.Duration, func()) {}

type immediateNativeEvidenceTimer struct{}

func (immediateNativeEvidenceTimer) AfterFunc(_ time.Duration, callback func()) {
	go callback()
}

type nativeEvidenceWindow struct{}

func (nativeEvidenceWindow) UsableSize(ctx context.Context) (int, int) {
	screens, err := wailsruntime.ScreenGetAll(ctx)
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

func (nativeEvidenceWindow) SetSize(ctx context.Context, width, height int) {
	wailsruntime.WindowSetSize(ctx, width, height)
}

func (nativeEvidenceWindow) Maximise(ctx context.Context) {
	wailsruntime.WindowMaximise(ctx)
}

func (nativeEvidenceWindow) Show(ctx context.Context) {
	wailsruntime.WindowShow(ctx)
}

var _ application.NativeWindowAPI = nativeEvidenceWindow{}

type nativeEvidenceLogger struct {
	mu   sync.Mutex
	path string
}

func (logger *nativeEvidenceLogger) Print(message string)   { logger.write("PRINT", message) }
func (logger *nativeEvidenceLogger) Trace(message string)   { logger.write("TRACE", message) }
func (logger *nativeEvidenceLogger) Debug(message string)   { logger.write("DEBUG", message) }
func (logger *nativeEvidenceLogger) Info(message string)    { logger.write("INFO", message) }
func (logger *nativeEvidenceLogger) Warning(message string) { logger.write("WARNING", message) }
func (logger *nativeEvidenceLogger) Error(message string)   { logger.write("ERROR", message) }
func (logger *nativeEvidenceLogger) Fatal(message string)   { logger.write("FATAL", message) }

func (logger *nativeEvidenceLogger) write(level, message string) {
	logger.mu.Lock()
	defer logger.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(logger.path), 0o755); err != nil {
		return
	}
	logFile, err := os.OpenFile(logger.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer logFile.Close()
	_, _ = fmt.Fprintf(logFile, "%s %s %s\n", time.Now().Format(time.RFC3339Nano), level, strings.TrimSpace(message))
}
