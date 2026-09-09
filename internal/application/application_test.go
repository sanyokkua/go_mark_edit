package application

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/file"
	"github.com/sanyokkua/go_mark_edit/internal/logging"
	"github.com/sanyokkua/go_mark_edit/internal/settings"
)

// Proves: STORY-005-AC-4
// The composition root starts settings without persistence, then Init opens temporary SQLite, injects it, and exposes defaults through the bound handler.
func TestApplicationContextInitializesSettingsInTwoPhases(t *testing.T) {
	logger, err := logging.NewLogger(filepath.Join(t.TempDir(), "logs"), true)
	if err != nil {
		t.Fatalf("create temporary application logger: %v", err)
	}
	t.Cleanup(func() {
		if closeErr := logger.Close(); closeErr != nil {
			t.Errorf("close temporary application logger: %v", closeErr)
		}
	})

	paths := &fakeFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}
	holder := NewApplicationContextHolder(paths, logger)
	if holder.SettingsService == nil || holder.SettingsHandler == nil {
		t.Fatal("phase-one composition must create settings service and handler")
	}
	if holder.DB != nil {
		t.Fatal("phase-one composition must not open persistence")
	}
	beforeInit := holder.SettingsHandler.GetSettings(bridge.Request{ID: "settings-before-init"})
	if beforeInit.Data != nil || beforeInit.Error == nil || beforeInit.Error.Code != apperr.CodeUnsupported {
		t.Fatalf("phase-one handler result = %+v, want unsupported error without data", beforeInit)
	}

	startupContext := context.WithValue(context.Background(), applicationContextKey{}, "startup")
	holder.SetContext(startupContext)
	if err := holder.Init(startupContext); err != nil {
		t.Fatalf("phase-two Init: %v", err)
	}
	t.Cleanup(func() {
		if closeErr := holder.Close(); closeErr != nil {
			t.Errorf("close application database: %v", closeErr)
		}
	})
	if holder.DB == nil {
		t.Fatal("phase-two Init did not retain the opened database")
	}
	if paths.databasePathCalls != 1 {
		t.Fatalf("database path calls = %d, want 1", paths.databasePathCalls)
	}

	afterInit := holder.SettingsHandler.GetSettings(bridge.Request{ID: "settings-after-init"})
	if afterInit.Error != nil {
		t.Fatalf("handler after Init returned error = %+v", afterInit.Error)
	}
	if afterInit.Data == nil || *afterInit.Data != settings.DefaultSettings() {
		t.Fatalf("handler after Init data = %+v, want documented defaults %+v", afterInit.Data, settings.DefaultSettings())
	}

	t.Run("wires durable application layout after SQLite opens", func(t *testing.T) {
		if holder.AppModelService.LayoutRepository() == nil {
			t.Fatal("phase-two Init did not inject the SQLite layout repository")
		}
	})

	t.Run("main binding and generated TypeScript surface expose the handler", func(t *testing.T) {
		_, sourceFile, _, ok := runtime.Caller(0)
		if !ok {
			t.Fatal("locate application test source")
		}
		repositoryRoot := filepath.Clean(filepath.Join(filepath.Dir(sourceFile), "..", ".."))
		mainSource, err := os.ReadFile(filepath.Join(repositoryRoot, "main.go"))
		if err != nil {
			t.Fatalf("read main binding source: %v", err)
		}
		if !strings.Contains(string(mainSource), "applicationContext.SettingsHandler") {
			t.Fatal("main does not bind the settings handler")
		}

		bindings, err := os.ReadFile(filepath.Join(repositoryRoot, "frontend", "wailsjs", "go", "settings", "SettingsHandler.d.ts"))
		if err != nil {
			t.Fatalf("read generated settings bindings: %v", err)
		}
		for _, method := range []string{"GetSettings", "UpdateAppearance", "UpdateMarkdown", "UpdateContentPrivacy"} {
			if !strings.Contains(string(bindings), method) {
				t.Errorf("generated settings bindings omit %s", method)
			}
		}
	})
}

// Proves: FR-WS-006
// A frontend readiness acknowledgement may arrive first, but it must not make
// the hidden native window visible until database startup and native restore
// have also completed. Once both sides are ready, visibility happens once.
func TestApplicationContextWaitsForBothStartupAndFrontendReadiness(t *testing.T) {
	ctx := context.Background()
	holder := NewApplicationContextHolder(&fakeFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil)
	native := &lifecycleRecordingNativeWindow{usableWidth: 1920, usableHeight: 1080}
	holder.SetNativeWindow(native)

	if result := holder.ApplicationHandler.WindowReady(bridge.Request{ID: "frontend-before-init"}); result.Error != nil {
		t.Fatalf("early frontend readiness result = %+v, want deferred acknowledgement", result)
	}
	if native.showCalls != 0 {
		t.Fatalf("early frontend readiness showed %d times before backend restore, want 0", native.showCalls)
	}

	if err := holder.Init(ctx); err != nil {
		t.Fatalf("initialize backend after frontend readiness: %v", err)
	}
	t.Cleanup(func() {
		if err := holder.Close(); err != nil {
			t.Errorf("close application database: %v", err)
		}
	})
	if err := holder.RestoreNativeWindow(ctx); err != nil {
		t.Fatalf("restore native window after backend readiness: %v", err)
	}
	if native.showCalls != 1 {
		t.Fatalf("show calls after both readiness signals = %d, want 1", native.showCalls)
	}

	if result := holder.ApplicationHandler.WindowReady(bridge.Request{ID: "frontend-after-restore"}); result.Error != nil {
		t.Fatalf("second frontend readiness result = %+v, want acknowledgement", result)
	}
	if native.showCalls != 1 {
		t.Fatalf("show calls after repeated frontend readiness = %d, want exactly 1", native.showCalls)
	}
}

// Proves: FR-WS-006
// Completing backend initialization and native restore first still leaves the
// window hidden until the frontend explicitly acknowledges hydration.
func TestApplicationContextWaitsForFrontendReadinessAfterBackendRestore(t *testing.T) {
	ctx := context.Background()
	holder := NewApplicationContextHolder(&fakeFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil)
	native := &lifecycleRecordingNativeWindow{usableWidth: 1920, usableHeight: 1080}
	holder.SetNativeWindow(native)

	if err := holder.Init(ctx); err != nil {
		t.Fatalf("initialize backend before frontend readiness: %v", err)
	}
	t.Cleanup(func() {
		if err := holder.Close(); err != nil {
			t.Errorf("close application database: %v", err)
		}
	})
	if err := holder.RestoreNativeWindow(ctx); err != nil {
		t.Fatalf("restore native window before frontend readiness: %v", err)
	}
	if native.showCalls != 0 {
		t.Fatalf("backend restore showed %d times before frontend readiness, want 0", native.showCalls)
	}

	if result := holder.ApplicationHandler.WindowReady(bridge.Request{ID: "frontend-before-restore"}); result.Error != nil {
		t.Fatalf("frontend readiness after backend restore = %+v, want acknowledgement", result)
	}
	if native.showCalls != 1 {
		t.Fatalf("show calls after frontend readiness = %d, want 1", native.showCalls)
	}
	if result := holder.ApplicationHandler.WindowReady(bridge.Request{ID: "frontend-after-restore"}); result.Error != nil {
		t.Fatalf("repeated frontend readiness = %+v, want acknowledgement", result)
	}
	if native.showCalls != 1 {
		t.Fatalf("show calls after repeated frontend readiness = %d, want exactly 1", native.showCalls)
	}
}

// Proves: FR-WS-011
// Native close must not release the database while a timer-owned layout write
// is already in flight; Close waits for that synchronous flush seam to settle.
func TestApplicationContextCloseWaitsForInFlightTimerLayoutFlush(t *testing.T) {
	repository := &blockingLifecycleLayoutRepository{
		firstWriteStarted: make(chan appmodel.VersionedLayoutValue, 1),
		releaseFirstWrite: make(chan error, 1),
	}
	service := appmodel.NewAppModelServiceWithLayoutRepository(discardingLifecycleEmitter{}, repository)
	width := 300
	if err := service.SetUILayout(context.Background(), apperr.UILayout{SidebarWidth: &width}); err != nil {
		t.Fatalf("SetUILayout: %v", err)
	}

	database, err := db.Open(context.Background(), filepath.Join(t.TempDir(), "close-waits.db"))
	if err != nil {
		t.Fatalf("open application database: %v", err)
	}
	holder := &ApplicationContextHolder{DB: database, AppModelService: service}

	older := <-repository.firstWriteStarted
	closeResult := make(chan error, 1)
	closeStarted := make(chan struct{})
	go func() {
		close(closeStarted)
		closeResult <- holder.Close()
	}()
	<-closeStarted

	for range 100 {
		runtime.Gosched()
		select {
		case err := <-closeResult:
			t.Fatalf("Close returned early with %v while timer-owned flush was in flight", err)
		default:
		}
	}

	repository.releaseFirstWrite <- nil
	if err := <-closeResult; err != nil {
		t.Fatalf("Close after timer-owned flush: %v", err)
	}
	if len(repository.writes) != 1 || repository.writes[0] != older {
		t.Fatalf("close writes = %+v, want one timer-owned write %+v", repository.writes, older)
	}
}

// Proves: FR-WS-006
// A corrupt stored dimension falls back on its own, while another valid
// dimension restores. Oversized values use only public usable-display bounds.
func TestNativeWindowRestoreFallsBackIndependentlyAndClampsUsableDisplay(t *testing.T) {
	tests := []struct {
		name                      string
		storedWidth, storedHeight int
		usableWidth, usableHeight int
		maximized                 any
		includeMaximized          bool
		wantWidth, wantHeight     int
		wantMaximiseCalls         int
	}{
		{
			name:        "invalid width keeps default while valid height restores",
			storedWidth: 374, storedHeight: 720,
			usableWidth: 1920, usableHeight: 1080,
			wantWidth: 1024, wantHeight: 720,
		},
		{
			name:        "missing maximized state defaults without discarding valid dimensions",
			storedWidth: 1200, storedHeight: 720,
			usableWidth: 1920, usableHeight: 1080,
			wantWidth: 1200, wantHeight: 720,
		},
		{
			name:        "invalid maximized state defaults without discarding valid dimensions",
			storedWidth: 1200, storedHeight: 720,
			usableWidth: 1920, usableHeight: 1080,
			maximized:        "not-a-boolean",
			includeMaximized: true,
			wantWidth:        1200, wantHeight: 720,
			wantMaximiseCalls: 0,
		},
		{
			name:        "valid maximized state restores despite invalid dimensions",
			storedWidth: 374, storedHeight: 479,
			usableWidth: 1920, usableHeight: 1080,
			maximized:        true,
			includeMaximized: true,
			wantWidth:        1024, wantHeight: 768,
			wantMaximiseCalls: 1,
		},
		{
			name:        "oversized dimensions clamp to usable display",
			storedWidth: 2400, storedHeight: 1600,
			usableWidth: 1280, usableHeight: 900,
			wantWidth: 1280, wantHeight: 900,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			values := map[string]appmodel.VersionedLayoutValue{
				appmodel.LayoutWindowWidth:  {Version: 1, Value: test.storedWidth, WriterID: "test", Sequence: 1},
				appmodel.LayoutWindowHeight: {Version: 1, Value: test.storedHeight, WriterID: "test", Sequence: 1},
			}
			if test.includeMaximized {
				values[appmodel.LayoutWindowMaximized] = appmodel.VersionedLayoutValue{Version: 1, Value: test.maximized, WriterID: "test", Sequence: 1}
			}
			repository := lifecycleLayoutRepository{values: values}
			model := appmodel.NewAppModelServiceWithLayoutRepository(discardingLifecycleEmitter{}, repository)
			native := &lifecycleRecordingNativeWindow{usableWidth: test.usableWidth, usableHeight: test.usableHeight}
			service := NewNativeWindowService(model, native)

			if err := service.Restore(context.Background()); err != nil {
				t.Fatalf("restore native window: %v", err)
			}
			if native.width != test.wantWidth || native.height != test.wantHeight {
				t.Fatalf("restored size = %dx%d, want %dx%d", native.width, native.height, test.wantWidth, test.wantHeight)
			}
			if native.maximiseCalls != test.wantMaximiseCalls {
				t.Fatalf("maximise calls = %d, want %d after independent maximized-state fallback", native.maximiseCalls, test.wantMaximiseCalls)
			}
			if native.showCalls != 0 {
				t.Fatalf("restore showed the hidden window %d times, want 0", native.showCalls)
			}
		})
	}
}

type lifecycleRecordingNativeWindow struct {
	usableWidth, usableHeight int
	width, height             int
	maximiseCalls, showCalls  int
}

func (window *lifecycleRecordingNativeWindow) UsableSize(context.Context) (int, int) {
	return window.usableWidth, window.usableHeight
}

func (window *lifecycleRecordingNativeWindow) SetSize(_ context.Context, width, height int) {
	window.width, window.height = width, height
}

func (window *lifecycleRecordingNativeWindow) Maximise(context.Context) { window.maximiseCalls++ }
func (window *lifecycleRecordingNativeWindow) Show(context.Context)     { window.showCalls++ }

type discardingLifecycleEmitter struct{}

func (discardingLifecycleEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	return nil
}

type lifecycleLayoutRepository struct {
	values map[string]appmodel.VersionedLayoutValue
}

func (repository lifecycleLayoutRepository) Read(_ context.Context, field string) (appmodel.VersionedLayoutValue, bool, error) {
	value, found := repository.values[field]
	return value, found, nil
}

func (lifecycleLayoutRepository) Write(context.Context, string, appmodel.VersionedLayoutValue) (appmodel.LayoutWriteResult, error) {
	return appmodel.LayoutWriteResult{}, nil
}

type blockingLifecycleLayoutRepository struct {
	firstWriteStarted chan appmodel.VersionedLayoutValue
	releaseFirstWrite chan error
	blocked           bool
	writes            []appmodel.VersionedLayoutValue
}

func (repository *blockingLifecycleLayoutRepository) Read(context.Context, string) (appmodel.VersionedLayoutValue, bool, error) {
	return appmodel.VersionedLayoutValue{}, false, nil
}

func (repository *blockingLifecycleLayoutRepository) Write(_ context.Context, _ string, value appmodel.VersionedLayoutValue) (appmodel.LayoutWriteResult, error) {
	if !repository.blocked {
		repository.blocked = true
		repository.firstWriteStarted <- value
		if err := <-repository.releaseFirstWrite; err != nil {
			return appmodel.LayoutWriteResult{}, err
		}
	}
	repository.writes = append(repository.writes, value)
	return appmodel.LayoutWriteResult{Applied: true, Value: value}, nil
}

type applicationContextKey struct{}

type fakeFileUtils struct {
	databasePath      string
	databasePathCalls int
}

func (utils *fakeFileUtils) GetAppConfigDir() (string, error) {
	return filepath.Dir(utils.databasePath), nil
}

func (utils *fakeFileUtils) GetAppLogsDir() (string, error) {
	return filepath.Join(filepath.Dir(utils.databasePath), "logs"), nil
}

func (utils *fakeFileUtils) GetAppDatabaseFilePath() (string, error) {
	utils.databasePathCalls++
	return utils.databasePath, nil
}

var _ file.FileUtilsServiceAPI = (*fakeFileUtils)(nil)
