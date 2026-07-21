package main

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/file"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Proves: STORY-009-AC-6
// Startup init failure shows an error dialog and exits non-zero even if the dialog itself fails (EC-SET-2 hard startup error).
func TestStartupInitFailureShowsDialogAndReturnsNonZero(t *testing.T) {
	previousMessageDialog := messageDialog
	previousExitProcess := exitProcess
	t.Cleanup(func() {
		messageDialog = previousMessageDialog
		exitProcess = previousExitProcess
	})

	var (
		dialogContext context.Context
		dialogOptions runtime.MessageDialogOptions
		dialogCalls   int
		exitStatuses  []int
	)
	messageDialog = func(ctx context.Context, options runtime.MessageDialogOptions) (string, error) {
		dialogContext = ctx
		dialogOptions = options
		dialogCalls++
		return "", errors.New("dialog unavailable")
	}
	exitProcess = func(status int) {
		exitStatuses = append(exitStatuses, status)
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
	if dialogCalls != 1 || dialogContext != startupContext {
		t.Fatalf("startup dialog calls = %d with context %v, want one call with startup context", dialogCalls, dialogContext)
	}
	if dialogOptions.Type != runtime.ErrorDialog {
		t.Fatalf("startup dialog type = %v, want %v", dialogOptions.Type, runtime.ErrorDialog)
	}
	if dialogOptions.Title == "" || dialogOptions.Message == "" {
		t.Fatalf("startup dialog options = %+v, want non-empty user-facing title and message", dialogOptions)
	}
	if len(exitStatuses) != 1 || exitStatuses[0] == 0 {
		t.Fatalf("exit statuses = %v, want exactly one non-zero status", exitStatuses)
	}
}

// Proves: STORY-001-AC-1
// The application serves the built React root through Wails with its settings
// handler bound and without an instance lock.
func TestWailsAppEmbedsFrontendAndBootsBlankView(t *testing.T) {
	holder := application.NewApplicationContextHolder(testFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil)
	appOptions := newAppOptions(holder)

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
		"export function GetState():Promise<apperr.StateResult>;",
		"export function UpdateBuffer(arg1:string,arg2:string):Promise<apperr.VoidResult>;",
		"export function SetDocView(arg1:string,arg2:apperr.DocViewInput):Promise<apperr.VoidResult>;",
		"export function SetUILayout(arg1:apperr.UILayout):Promise<apperr.VoidResult>;",
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
		"activeBuffer: ActiveBuffer;",
		"export class ActiveBuffer {",
		"documentId: string;",
		"content: string;",
		"export class AppStateSnapshot {",
		"documents: Record<string, DocumentMetadata>;",
		"path: string;",
		"activeDocumentId: string;",
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
