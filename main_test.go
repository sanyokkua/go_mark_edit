package main

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/file"
	"github.com/wailsapp/wails/v2/pkg/menu"
)

// Proves: FR-WS-013
// Startup failure leaves the process and framed webview available for the
// localized in-app Retry surface. It does not fall back to a native dialog.
func TestStartupInitFailureRemainsRecoverableInWebview(t *testing.T) {
	previousShowStartupRecoveryWindow := showStartupRecoveryWindow
	t.Cleanup(func() {
		showStartupRecoveryWindow = previousShowStartupRecoveryWindow
	})

	var (
		recoveryContext context.Context
		recoveryCalls   int
	)
	showStartupRecoveryWindow = func(ctx context.Context) {
		recoveryContext = ctx
		recoveryCalls++
	}

	paths := &failingStartupFileUtils{}
	holder := application.NewApplicationContextHolder(paths, nil)
	appOptions := newAppOptions(holder)
	startupContext := context.WithValue(context.Background(), startupContextKey{}, "failed startup")
	appOptions.OnStartup(startupContext)

	if paths.databasePathCalls != 1 {
		t.Fatalf("database path calls = %d, want one failed Init attempt", paths.databasePathCalls)
	}
	if holder.Context() != startupContext {
		t.Fatal("OnStartup did not retain the Wails lifecycle context")
	}
	if holder.DB != nil {
		t.Fatal("failed Init retained an opened database")
	}
	if state := holder.AppModelHandler.GetState(bridge.Request{ID: "startup-recovery-state"}); state.Data != nil || state.Error == nil {
		t.Fatalf("GetState after failed startup = %+v, want a typed failure so the normal shell stays unmounted", state)
	}
	if recoveryCalls != 1 || recoveryContext != startupContext {
		t.Fatalf("startup recovery window calls = %d with context %v, want one with startup context", recoveryCalls, recoveryContext)
	}
}

// Proves: STORY-001-AC-1
// The application serves the built React root through Wails with its settings
// handler bound and without an instance lock.
func TestWailsAppEmbedsFrontendAndBootsBlankView(t *testing.T) {
	holder := application.NewApplicationContextHolder(testFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil)
	appOptions := newAppOptions(holder)
	holder.SetNativeWindow(testNativeWindow{})

	if appOptions.AssetServer == nil || appOptions.AssetServer.Assets == nil {
		t.Fatal("expected the Wails asset server to receive embedded frontend assets")
	}

	indexHTML, err := fs.ReadFile(appOptions.AssetServer.Assets, "frontend/dist/index.html")
	if err != nil {
		t.Fatalf("read embedded frontend/dist/index.html: %v", err)
	}
	if !strings.Contains(string(indexHTML), `<div id="root"></div>`) {
		t.Fatal("expected the embedded frontend build to contain the React root")
	}
	if strings.Contains(string(indexHTML), "./src/main.tsx") {
		t.Fatal("expected embedded index.html to be the built frontend, not Vite source")
	}

	if appOptions.OnStartup == nil {
		t.Fatal("expected an OnStartup lifecycle callback")
	}
	startupContext := context.WithValue(context.Background(), startupContextKey{}, "startup")
	appOptions.OnStartup(startupContext)
	if holder.Context() != startupContext {
		t.Fatal("expected OnStartup to pass the Wails context to the application holder")
	}
	if appOptions.SingleInstanceLock != nil {
		t.Fatal("expected multiple Wails instances to be allowed")
	}
	settingsBound := false
	for _, candidate := range appOptions.Bind {
		if candidate == holder.SettingsHandler {
			settingsBound = true
			break
		}
	}
	if !settingsBound {
		t.Fatal("expected the settings handler to remain bound")
	}
}

// Proves: FR-WS-001, FR-WS-005, FR-WS-006
// The process uses an ordinary OS-managed frame, native resizing, the exact
// minimum size, and hidden startup while restore is prepared.
func TestWailsAppUsesOrdinaryHiddenFramedNativeWindow(t *testing.T) {
	appOptions := newAppOptions(application.NewApplicationContextHolder(testFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil))
	if appOptions.Width != 1024 || appOptions.Height != 768 {
		t.Fatalf("initial native size = %dx%d, want 1024x768", appOptions.Width, appOptions.Height)
	}
	if appOptions.MinWidth != 375 || appOptions.MinHeight != 480 {
		t.Fatalf("native minimum = %dx%d, want 375x480", appOptions.MinWidth, appOptions.MinHeight)
	}
	if appOptions.Frameless || appOptions.DisableResize || !appOptions.StartHidden {
		t.Fatalf("native window options = %+v, want framed, resizable, start hidden", appOptions)
	}
}

// Proves: FR-ED-001, FR-ED-004, FR-ED-026
// macOS keeps the ordinary framed/resizable window while explicitly enabling
// the host-owned zoom/fullscreen traffic-light control.
func TestWailsAppEnablesNativeMacZoomWithoutStartingFullscreen(t *testing.T) {
	appOptions := newAppOptions(application.NewApplicationContextHolder(testFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil))
	if appOptions.Mac == nil {
		t.Fatal("macOS options are nil; want explicit native zoom configuration")
	}
	if appOptions.Mac.DisableZoom {
		t.Fatal("macOS native zoom is disabled; want DisableZoom=false")
	}
	if appOptions.Frameless || appOptions.DisableResize || appOptions.Fullscreen {
		t.Fatalf("native window options = %+v, want framed, resizable, session fullscreen off", appOptions)
	}
}

// Proves: FR-WS-002
// macOS receives the standard application and editing roles, with no separate
// app-owned native About item. About remains owned by the in-app action row.
func TestNativeMenuOnMacHasAppAndEditRolesWithoutSeparateAbout(t *testing.T) {
	macMenu := nativeMenuForPlatform("darwin")
	if macMenu == nil {
		t.Fatal("macOS native menu is nil, want standard App and Edit roles")
		return
	}
	if len(macMenu.Items) != 2 {
		t.Fatalf("macOS menu has %d items, want exactly App and Edit with no separate native About item", len(macMenu.Items))
	}
	roles := map[menu.Role]int{}
	for _, item := range macMenu.Items {
		roles[item.Role]++
	}
	if roles[menu.AppMenuRole] != 1 || roles[menu.EditMenuRole] != 1 || len(roles) != 2 {
		t.Fatalf("macOS menu roles = %#v, want exactly one App role and one Edit role", roles)
	}
	for _, platform := range []string{"windows", "linux"} {
		if got := nativeMenuForPlatform(platform); got != nil {
			t.Fatalf("%s native app menu = %#v, want nil", platform, got)
		}
	}
}

// Proves: FR-WS-001, FR-WS-003, FR-WS-005
// The webview contains no replacement title-bar gesture or resize mechanism;
// Wails keeps the ordinary operating-system-managed frame and borders.
func TestShellDoesNotReplaceNativeWindowGesturesOrResizeBorders(t *testing.T) {
	// Every production webview source is in scope: a drag/resize control hidden
	// outside the three initially named shell files would still replace OS chrome.
	prohibited := []string{
		"--wails-draggable",
		"wails:drag",
		"-webkit-app-region",
		"app-region: drag",
		"app-region:drag",
		"WindowDrag",
		"WindowSetPosition",
		"WindowSetSize",
		"WindowSetMinSize",
		"WindowSetMaxSize",
		"WindowMaximise",
		"WindowUnmaximise",
		"resize-hit-area",
		"resize-handle",
		"resize-edge",
		"resize-corner",
	}
	// col-resize is valid on the in-app workspace divider; it changes document
	// layout, not the native window border. The remaining cursors are the ones
	// that would make the webview impersonate a native edge or corner.
	nativeResizeCursor := regexp.MustCompile(`(?i)cursor\s*:\s*(?:[nesw]{1,2}-resize|row-resize)\b`)

	checked := 0
	err := filepath.WalkDir("frontend/src", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if entry.Name() == "dev" || entry.Name() == "test" {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.Contains(entry.Name(), ".test.") {
			return nil
		}
		extension := filepath.Ext(path)
		if extension != ".ts" && extension != ".tsx" && extension != ".css" {
			return nil
		}

		checked++
		source, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, token := range prohibited {
			if strings.Contains(string(source), token) {
				t.Errorf("%s contains %q; native title gestures and resize borders must stay OS-owned", path, token)
			}
		}
		if match := nativeResizeCursor.FindString(string(source)); match != "" {
			t.Errorf("%s contains %q; native borders must provide every window-resize cursor", path, match)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk production webview sources: %v", err)
	}
	if checked == 0 {
		t.Fatal("checked no production webview sources for replacement native-window ownership")
	}
}

// Proves: FR-WS-001
// Each process creates a separate application graph and deliberately installs
// no takeover lock, so separate native windows can coexist.
func TestWailsOptionsAllowIndependentNativeProcesses(t *testing.T) {
	first := newAppOptions(application.NewApplicationContextHolder(testFileUtils{databasePath: filepath.Join(t.TempDir(), "first.db")}, nil))
	second := newAppOptions(application.NewApplicationContextHolder(testFileUtils{databasePath: filepath.Join(t.TempDir(), "second.db")}, nil))
	if first.SingleInstanceLock != nil || second.SingleInstanceLock != nil {
		t.Fatalf("single-instance locks = %#v and %#v, want none", first.SingleInstanceLock, second.SingleInstanceLock)
	}
	if first.Bind[0] == second.Bind[0] {
		t.Fatal("separate process options share the first bound application handler")
	}
}

// Proves: FR-FT-027
// Native close is vetoed once for asynchronous planning, then the authorized
// programmatic quit consumes exactly one permit before shutdown.
func TestWailsAppInstallsCloseFlushLifecycleHook(t *testing.T) {
	ctx := context.Background()
	previousEmit := emitNativeCloseRequest
	previousQuit := quitNativeApplication
	t.Cleanup(func() {
		emitNativeCloseRequest = previousEmit
		quitNativeApplication = previousQuit
	})
	closeRequests := 0
	quitCalls := 0
	emitNativeCloseRequest = func(context.Context) { closeRequests++ }
	quitNativeApplication = func(context.Context) { quitCalls++ }

	holder := application.NewApplicationContextHolder(testFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil)
	appOptions := newAppOptions(holder)
	if err := holder.Init(ctx); err != nil {
		t.Fatalf("initialize application before close: %v", err)
	}
	repository := &recordingMainLayoutRepository{delegate: holder.AppModelService.LayoutRepository()}
	holder.AppModelService = appmodel.NewAppModelServiceWithLayoutRepository(
		discardingMainStatePatchEmitter{},
		repository,
	)

	width := 1200
	if err := holder.AppModelService.SetUILayout(ctx, apperr.UILayout{WindowWidth: &width}); err != nil {
		t.Fatalf("queue native resize before close: %v", err)
	}
	if appOptions.OnBeforeClose == nil {
		t.Fatal("OnBeforeClose is nil; native close cannot be vetoed")
	}
	if appOptions.OnShutdown == nil {
		t.Fatal("OnShutdown is nil; a permitted native close cannot release the application database")
	}
	if prevent := appOptions.OnBeforeClose(ctx); !prevent {
		t.Fatal("first native close was not vetoed for asynchronous planning")
	}
	if prevent := appOptions.OnBeforeClose(ctx); !prevent {
		t.Fatal("repeated native close was not idempotently vetoed")
	}
	if closeRequests != 1 {
		t.Fatalf("native close request events = %d, want one", closeRequests)
	}
	if result := holder.ApplicationHandler.AuthorizeQuit(bridge.Request{ID: "authorize-close"}); result.Error != nil {
		t.Fatalf("AuthorizeQuit returned error: %+v", result.Error)
	}
	if quitCalls != 1 {
		t.Fatalf("programmatic quit calls = %d, want one", quitCalls)
	}
	if prevent := appOptions.OnBeforeClose(ctx); prevent {
		t.Fatal("authorized native close permit was not consumed")
	}
	appOptions.OnShutdown(ctx)
	if holder.DB == nil {
		repository.events = append(repository.events, "close")
	}
	if got, want := repository.events, []string{"flush", "close"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("close lifecycle events = %v, want ordered drain then close", got)
	}
	if holder.DB != nil {
		t.Fatal("authorized close did not release the application database")
	}
}

// Proves: FR-FT-027
// A failed drain cannot create a permit or invoke Quit; the same pending
// request remains available for an explicit retry.
func TestWailsAppCloseFlushFailurePreventsNativeShutdown(t *testing.T) {
	ctx := context.Background()
	previousEmit := emitNativeCloseRequest
	previousQuit := quitNativeApplication
	t.Cleanup(func() {
		emitNativeCloseRequest = previousEmit
		quitNativeApplication = previousQuit
	})
	closeRequests := 0
	quitCalls := 0
	emitNativeCloseRequest = func(context.Context) { closeRequests++ }
	quitNativeApplication = func(context.Context) { quitCalls++ }

	holder := application.NewApplicationContextHolder(testFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil)
	appOptions := newAppOptions(holder)
	if err := holder.Init(ctx); err != nil {
		t.Fatalf("initialize application before close: %v", err)
	}
	repository := &recordingMainLayoutRepository{err: errors.New("simulated layout write failure")}
	holder.AppModelService = appmodel.NewAppModelServiceWithLayoutRepository(
		discardingMainStatePatchEmitter{}, repository,
	)
	t.Cleanup(func() {
		if holder.DB == nil {
			return
		}
		if err := holder.DB.Close(); err != nil {
			t.Errorf("close application database: %v", err)
		}
	})

	width := 1200
	if err := holder.AppModelService.SetUILayout(ctx, apperr.UILayout{WindowWidth: &width}); err != nil {
		t.Fatalf("queue native resize before failing close: %v", err)
	}
	if appOptions.OnBeforeClose == nil || appOptions.OnShutdown == nil {
		t.Fatal("native lifecycle hooks are incomplete; a failed close cannot veto shutdown")
	}
	if prevent := appOptions.OnBeforeClose(ctx); !prevent {
		t.Fatal("first native close did not remain vetoed while planning")
	}
	if got, want := repository.events, []string(nil); !reflect.DeepEqual(got, want) {
		t.Fatalf("failed-close lifecycle events = %v, want %v", got, want)
	}
	failed := holder.ApplicationHandler.AuthorizeQuit(bridge.Request{ID: "authorize-close-failure"})
	if failed.Error == nil || failed.Error.Category != apperr.ClassifiedIOFailure || failed.Error.Remediation() != apperr.RemediationRetry {
		t.Fatalf("failed AuthorizeQuit error = %+v, want a classified io-failure offering Retry", failed.Error)
	}
	if quitCalls != 0 || holder.DB == nil {
		t.Fatalf("failed close quit calls = %d and database = %p, want no quit and open database", quitCalls, holder.DB)
	}
	if closeRequests != 1 {
		t.Fatalf("native close request events after failed drain = %d, want one", closeRequests)
	}
	repository.err = nil
	if retry := holder.ApplicationHandler.AuthorizeQuit(bridge.Request{ID: "authorize-close-retry"}); retry.Error != nil {
		t.Fatalf("retry AuthorizeQuit returned error: %+v", retry.Error)
	}
	if quitCalls != 1 || appOptions.OnBeforeClose(ctx) {
		t.Fatalf("retry close quit calls = %d or permit was not consumed", quitCalls)
	}
	appOptions.OnShutdown(ctx)
}

// Proves: FR-FT-027
// Shutdown releases SQLite only after the final layout drain has completed.
func TestShutdownOrder(t *testing.T) {
	ctx := context.Background()
	holder := application.NewApplicationContextHolder(testFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil)
	if err := holder.Init(ctx); err != nil {
		t.Fatalf("initialize application before shutdown: %v", err)
	}
	repository := &recordingMainLayoutRepository{delegate: holder.AppModelService.LayoutRepository()}
	holder.AppModelService = appmodel.NewAppModelServiceWithLayoutRepository(
		discardingMainStatePatchEmitter{},
		repository,
	)
	width := 1200
	if err := holder.AppModelService.SetUILayout(ctx, apperr.UILayout{WindowWidth: &width}); err != nil {
		t.Fatalf("queue shutdown layout: %v", err)
	}
	appOptions := newAppOptions(holder)
	appOptions.OnShutdown(ctx)
	if holder.DB == nil {
		repository.events = append(repository.events, "sqlite-close")
	}
	if got, want := repository.events, []string{"flush", "sqlite-close"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("shutdown order events = %v, want %v", got, want)
	}
}

// Proves: STORY-011-AC-7
// The composition root binds the app-model handler and Wails generates its exact query and command surface.
func TestAppModelHandlerIsBoundAndGenerated(t *testing.T) {
	holder := application.NewApplicationContextHolder(testFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil)
	appOptions := newAppOptions(holder)

	bound := false
	for _, candidate := range appOptions.Bind {
		if candidate == holder.AppModelHandler {
			bound = true
			break
		}
	}
	if !bound {
		t.Fatal("expected the app-model handler in the Wails Bind list")
	}

	bindings, err := os.ReadFile(filepath.Join("frontend", "wailsjs", "go", "appmodel", "AppModelHandler.d.ts"))
	if err != nil {
		t.Fatalf("read generated app-model bindings: %v", err)
	}
	for _, signature := range []string{
		"export function GetState(arg1:bridge.Request):Promise<apperr.StateResult>;",
		"export function NewDocument(arg1:bridge.Request,arg2:number):Promise<apperr.DocumentTransitionResult>;",
		"export function OpenDocument(arg1:bridge.Request,arg2:number):Promise<apperr.OpenResult>;",
		"export function UpdateBuffer(arg1:bridge.Request,arg2:string,arg3:string):Promise<apperr.VoidResult>;",
		"export function SetDocView(arg1:bridge.Request,arg2:string,arg3:apperr.DocViewInput):Promise<apperr.VoidResult>;",
		"export function SetUILayout(arg1:bridge.Request,arg2:apperr.UILayout):Promise<apperr.VoidResult>;",
		"export function Save(arg1:bridge.Request,arg2:string,arg3:number,arg4:string):Promise<apperr.WriteResult>;",
		"export function SaveAs(arg1:bridge.Request,arg2:string,arg3:number,arg4:string):Promise<apperr.WriteResult>;",
	} {
		if !strings.Contains(string(bindings), signature) {
			t.Errorf("generated app-model bindings omit exact signature %q", signature)
		}
	}

	models, err := os.ReadFile(filepath.Join("frontend", "wailsjs", "go", "models.ts"))
	if err != nil {
		t.Fatalf("read generated Wails DTO models: %v", err)
	}
	for _, field := range []string{
		"export class StateResult {",
		"data?: AppState;",
		"error?: WireError;",
		"export class AppState {",
		"snapshot: AppStateSnapshot;",
		"activeBuffer?: ActiveBuffer;",
		"export class ActiveBuffer {",
		"documentId: string;",
		"documentRevision: number;",
		"projectionRevision: number;",
		"content: string;",
		"export class AppStateSnapshot {",
		"documents: Record<string, DocumentMetadata>;",
		"path: string;",
		"activeDocumentId?: string;",
		"export class DocViewInput {",
		"editorVisible: boolean;",
		"previewVisible: boolean;",
		"scroll: ScrollOffsets;",
		"export class UILayout {",
		"sidebarVisible?: boolean;",
		"sidebarWidth?: number;",
	} {
		if !strings.Contains(string(models), field) {
			t.Errorf("generated Wails DTO models omit %q", field)
		}
	}
}

type startupContextKey struct{}

type testNativeWindow struct{}

func (testNativeWindow) UsableSize(context.Context) (int, int) { return 1920, 1080 }
func (testNativeWindow) SetSize(context.Context, int, int)     {}
func (testNativeWindow) Maximise(context.Context)              {}
func (testNativeWindow) Show(context.Context)                  {}

type discardingMainStatePatchEmitter struct{}

func (discardingMainStatePatchEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	return nil
}

type recordingMainLayoutRepository struct {
	delegate appmodel.LayoutRepositoryAPI
	events   []string
	err      error
}

func (repository *recordingMainLayoutRepository) Read(ctx context.Context, field string) (appmodel.VersionedLayoutValue, bool, error) {
	if repository.delegate == nil {
		return appmodel.VersionedLayoutValue{}, false, nil
	}
	return repository.delegate.Read(ctx, field)
}

func (repository *recordingMainLayoutRepository) Write(ctx context.Context, field string, value appmodel.VersionedLayoutValue) (appmodel.LayoutWriteResult, error) {
	repository.events = append(repository.events, "flush")
	if repository.err != nil {
		return appmodel.LayoutWriteResult{}, repository.err
	}
	if repository.delegate == nil {
		return appmodel.LayoutWriteResult{Applied: true, Value: value}, nil
	}
	return repository.delegate.Write(ctx, field, value)
}

// Proves: STORY-002-AC-1
// Wails receives every ErrorCode/TypeScript-name pair through EnumBind.
func TestAppOptionsEnumBindIncludesAllErrorCodes(t *testing.T) {
	t.Parallel()

	appOptions := newAppOptions(application.NewApplicationContextHolder(testFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil))
	if len(appOptions.EnumBind) != 1 {
		t.Fatalf("EnumBind has %d entries, want exactly the ErrorCode catalog", len(appOptions.EnumBind))
	}

	got, ok := appOptions.EnumBind[0].([]struct {
		Value  apperr.ErrorCode
		TSName string
	})
	if !ok {
		t.Fatalf("EnumBind[0] type = %T, want apperr ErrorCode catalog", appOptions.EnumBind[0])
	}
	if !reflect.DeepEqual(got, apperr.AllErrorCodes) {
		t.Fatalf("EnumBind ErrorCode catalog = %#v, want %#v", got, apperr.AllErrorCodes)
	}
}

// The generated Wails bindings stay committed, so a signature change cannot land as silent drift.
func TestWailsBindingsRemainTracked(t *testing.T) {
	output, err := exec.Command("git", "ls-files", "--stage", "frontend/wailsjs").Output()
	if err != nil {
		t.Fatalf("list tracked Wails bindings: %v", err)
	}

	// Every generated binding, not a subset: a handler whose bindings stop being tracked is exactly
	// the drift this guards. Add a row here when a new bound handler is introduced.
	required := map[string]bool{
		"frontend/wailsjs/go/application/ApplicationHandler.d.ts": false,
		"frontend/wailsjs/go/application/ApplicationHandler.js":   false,
		"frontend/wailsjs/go/appmodel/AppModelHandler.d.ts":       false,
		"frontend/wailsjs/go/appmodel/AppModelHandler.js":         false,
		"frontend/wailsjs/go/models.ts":                           false,
		"frontend/wailsjs/go/settings/SettingsHandler.d.ts":       false,
		"frontend/wailsjs/go/settings/SettingsHandler.js":         false,
		"frontend/wailsjs/runtime/package.json":                   false,
		"frontend/wailsjs/runtime/runtime.d.ts":                   false,
		"frontend/wailsjs/runtime/runtime.js":                     false,
	}

	entries := strings.FieldsFunc(string(output), func(r rune) bool { return r == '\n' })
	if len(entries) == 0 {
		t.Fatal("no Wails bindings are tracked")
	}
	for _, entry := range entries {
		fields := strings.Fields(entry)
		if len(fields) != 4 {
			t.Errorf("invalid tracked Wails binding entry %q", entry)
			continue
		}
		// Wails owns the generated file mode; this test only guards that the binding is tracked.
		if _, needed := required[fields[3]]; needed {
			required[fields[3]] = true
		}
	}
	for path, found := range required {
		if !found {
			t.Errorf("required Wails binding %q is not tracked", path)
		}
	}
}

// Proves: STORY-001-AC-3
// The application module stays Go 1.25, Wails v2, pure-Go, and does not opt a build into CGO.
func TestBuildConfigurationRemainsCGOFree(t *testing.T) {
	goModule, err := os.ReadFile("go.mod")
	if err != nil {
		t.Fatalf("read go.mod: %v", err)
	}
	goModuleText := string(goModule)

	forbiddenModules := []string{
		"github.com/mattn/go-sqlite3",
		"github.com/gofrs/flock",
	}
	for _, forbiddenModule := range forbiddenModules {
		if strings.Contains(goModuleText, forbiddenModule) {
			t.Fatalf("go.mod must not include forbidden module %q", forbiddenModule)
		}
	}
	if !strings.Contains(goModuleText, "go 1.25") {
		t.Fatal("expected go.mod to require Go 1.25")
	}
	if !strings.Contains(goModuleText, "github.com/wailsapp/wails/v2 v2.") {
		t.Fatal("expected go.mod to use Wails v2")
	}

	for _, path := range []string{"main.go", "justfile", "wails.json"} {
		contents, readErr := os.ReadFile(path)
		if readErr != nil {
			t.Fatalf("read build configuration %s: %v", path, readErr)
		}
		if strings.Contains(string(contents), "CGO_ENABLED=1") {
			t.Fatalf("build configuration %s must not enable CGO", path)
		}
		if path == "main.go" && strings.Contains(string(contents), `import "C"`) {
			t.Fatal("application source imports C: main.go")
		}
	}

	if err := filepath.WalkDir("internal", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".go") {
			return nil
		}
		contents, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		if strings.Contains(string(contents), `import "C"`) {
			return &cgoImportError{path: path}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

type cgoImportError struct {
	path string
}

func (err *cgoImportError) Error() string {
	return "application source imports C: " + err.path
}

type testFileUtils struct {
	databasePath string
}

func (utils testFileUtils) GetAppConfigDir() (string, error) {
	return filepath.Dir(utils.databasePath), nil
}

func (utils testFileUtils) GetAppLogsDir() (string, error) {
	return filepath.Join(filepath.Dir(utils.databasePath), "logs"), nil
}

func (utils testFileUtils) GetAppDatabaseFilePath() (string, error) {
	return utils.databasePath, nil
}

var _ file.FileUtilsServiceAPI = testFileUtils{}

type failingStartupFileUtils struct {
	databasePathCalls int
}

func (utils *failingStartupFileUtils) GetAppConfigDir() (string, error) {
	return "", errors.New("config directory unavailable")
}

func (utils *failingStartupFileUtils) GetAppLogsDir() (string, error) {
	return "", errors.New("logs directory unavailable")
}

func (utils *failingStartupFileUtils) GetAppDatabaseFilePath() (string, error) {
	utils.databasePathCalls++
	return "", errors.New("settings database unavailable")
}

var _ file.FileUtilsServiceAPI = (*failingStartupFileUtils)(nil)

// Proves: FR-FT-002 "filtered case-insensitively to `.md`, `.markdown`,
// `.mdown`, and `.txt`", and the same suffix set for FR-FT-012's Save As picker.
//
// The cancellation half of FR-FT-002 is proved by
// `internal/appmodel/handler_test.go`.
//
// The filter set and the backend's accepted set are two lists that must stay
// equal, and until this test they were three lists — two identical literals in
// `main()` plus `file.IsSupportedDocumentSuffix`. `paths_test.go` proves the
// predicate, and nothing proved the pickers agreed with it, so a suffix could be
// offered in the dialog and refused after selection, or accepted by the backend
// and impossible to reach through the picker.
//
// Case-insensitivity is per host, so the host branch is exercised explicitly
// rather than through whatever `goruntime.GOOS` this test happens to run on.
func TestNativePickersFilterExactlyTheSupportedSuffixes(t *testing.T) {
	named := []string{".md", ".markdown", ".mdown", ".txt"}

	for _, goos := range []string{"darwin", "windows", "linux"} {
		filters := documentFileFiltersFor(goos)
		if len(filters) != 1 {
			t.Fatalf("%s: document file filters = %d, want one 'Markdown and text' group", goos, len(filters))
		}

		globs := strings.Split(filters[0].Pattern, ";")
		if globs[0] != "*.md" {
			// The Windows Save dialog takes its default extension from the
			// first glob (wails internal/frontend/desktop/windows/dialog.go).
			t.Errorf("%s: first glob is %q, want %q", goos, globs[0], "*.md")
		}

		offered := make(map[string]bool, len(globs))
		for _, glob := range globs {
			if !strings.HasPrefix(glob, "*.") {
				t.Fatalf("%s: picker glob %q is not a suffix pattern", goos, glob)
			}
			suffix := strings.TrimPrefix(glob, "*")
			if offered[suffix] {
				t.Fatalf("%s: picker offers %q twice", goos, suffix)
			}
			offered[suffix] = true
			if !file.IsSupportedDocumentSuffix("document" + suffix) {
				t.Errorf("%s: the picker offers %q, which the backend refuses after selection", goos, suffix)
			}
		}

		distinct := make(map[string]bool, len(named))
		for suffix := range offered {
			distinct[strings.ToLower(suffix)] = true
		}
		for _, suffix := range named {
			if !distinct[suffix] {
				t.Errorf("%s: the picker does not offer %q, which FR-FT-002 names and the backend accepts", goos, suffix)
			}
		}
		if len(distinct) != len(named) {
			t.Errorf("%s: picker offers %d distinct suffixes, want exactly the four FR-FT-002 names", goos, len(distinct))
		}

		if goos != "linux" {
			// `NSOpenPanel` and the Windows common item dialog match their
			// filters case-insensitively already, so the four lowercase globs
			// are the whole filter there.
			if len(offered) != len(named) {
				t.Errorf("%s: picker carries %d globs, want the four lowercase ones", goos, len(offered))
			}
			continue
		}

		// GTK compiles each glob into a case-sensitive GPatternSpec that
		// understands only `*` and `?` — no `*.[mM][dD]` — so the enumeration
		// is the only way FR-FT-002's "case-insensitively" can hold on Linux.
		for _, suffix := range named {
			for _, form := range []string{
				suffix,
				strings.ToUpper(suffix),
				"." + strings.ToUpper(suffix[1:2]) + suffix[2:],
			} {
				if !offered[form] {
					t.Errorf("linux: the picker does not offer %q, so GTK hides files named that way", form)
				}
			}
		}
		if want := 4 + 256 + 32 + 8; len(offered) != want {
			t.Errorf("linux: picker offers %d globs, want every case form of the four suffixes (%d)", len(offered), want)
		}
	}

	// Both pickers must use this one list; two literals is how they drift.
	source, err := os.ReadFile(filepath.Join(repositoryRoot(t), "main.go"))
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}
	if occurrences := strings.Count(string(source), `".md"`); occurrences != 1 {
		t.Errorf("the suffix list appears %d times in main.go, want one shared definition", occurrences)
	}
}
