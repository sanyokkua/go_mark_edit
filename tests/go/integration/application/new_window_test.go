package application_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
)

type recordingNewWindowLauncher struct {
	paths []string
	err   error
}

type failOnceStartupFileUtils struct {
	startupFileUtils
	initialError error
}

func (utils *failOnceStartupFileUtils) GetAppDatabaseFilePath() (string, error) {
	if utils.initialError != nil {
		err := utils.initialError
		utils.initialError = nil
		return "", err
	}
	return utils.startupFileUtils.GetAppDatabaseFilePath()
}

type startupOrderRecorder struct {
	mu     sync.Mutex
	events []string
}

func (recorder *startupOrderRecorder) EmitStatePatch(_ context.Context, patch apperr.AppStatePatch) error {
	if patch.Workspace != nil && patch.Workspace.Snapshot != nil {
		recorder.record("workspace")
	}
	return nil
}

func (recorder *startupOrderRecorder) record(event string) {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	recorder.events = append(recorder.events, event)
}

func (recorder *startupOrderRecorder) snapshot() []string {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	return append([]string(nil), recorder.events...)
}

type retryStartupNativeWindow struct {
	recorder *startupOrderRecorder
}

func (window retryStartupNativeWindow) UsableSize(context.Context) (int, int) { return 1920, 1080 }
func (window retryStartupNativeWindow) SetSize(context.Context, int, int) {
	window.recorder.record("restore")
}
func (retryStartupNativeWindow) Maximise(context.Context) {}
func (retryStartupNativeWindow) Show(context.Context)     {}

func (launcher *recordingNewWindowLauncher) Launch(targetPath string) error {
	launcher.paths = append(launcher.paths, targetPath)
	return launcher.err
}

func TestNewWindowLauncherReceivesEachRequestedPath(t *testing.T) {
	for _, folderPath := range []string{"", filepath.Join(t.TempDir(), "project"), filepath.Join(t.TempDir(), "notes.md")} {
		t.Run(folderPath, func(t *testing.T) {
			launcher := &recordingNewWindowLauncher{}
			holder := application.NewApplicationContextHolderWithOptions(nil, nil, application.ApplicationContextOptions{
				NewWindowLauncher: launcher,
			})

			result := holder.ApplicationHandler.OpenNewWindow(bridge.Request{ID: "open-window"}, folderPath)

			if result.Category != "" || result.Error != nil {
				t.Fatalf("OpenNewWindow result = %+v, want success", result)
			}
			if len(launcher.paths) != 1 || launcher.paths[0] != folderPath {
				t.Fatalf("launcher paths = %#v, want one call with %q", launcher.paths, folderPath)
			}
		})
	}
}

func TestOpenNewWindowOffersRetryWhenLauncherFails(t *testing.T) {
	const privateCause = "private process details"
	launcher := &recordingNewWindowLauncher{err: errors.New(privateCause)}
	holder := application.NewApplicationContextHolderWithOptions(nil, nil, application.ApplicationContextOptions{
		NewWindowLauncher: launcher,
	})

	result := holder.ApplicationHandler.OpenNewWindow(bridge.Request{ID: "open-window-failure"}, "")

	if result.Category != apperr.ClassifiedSystemCommandFailure {
		t.Fatalf("failure category = %q, want %q", result.Category, apperr.ClassifiedSystemCommandFailure)
	}
	if result.Remediation != apperr.RemediationRetry {
		t.Fatalf("failure remediation = %q, want %q", result.Remediation, apperr.RemediationRetry)
	}
	if result.Message == "" || strings.Contains(result.Message, privateCause) {
		t.Fatalf("failure message = %q, want safe user-facing copy", result.Message)
	}
	if result.Error != nil && strings.Contains(result.Error.Message, privateCause) {
		t.Fatalf("wire error message = %q, want no private process details", result.Error.Message)
	}
}

func TestOpenNewWindowLaunchesOnceWhenRequestIsRepeated(t *testing.T) {
	launcher := &recordingNewWindowLauncher{}
	holder := application.NewApplicationContextHolderWithOptions(nil, nil, application.ApplicationContextOptions{
		NewWindowLauncher: launcher,
	})
	request := bridge.Request{ID: "same-window-request"}

	first := holder.ApplicationHandler.OpenNewWindow(request, "/first/folder")
	second := holder.ApplicationHandler.OpenNewWindow(request, "/second/folder")

	if len(launcher.paths) != 1 || launcher.paths[0] != "/first/folder" {
		t.Fatalf("launcher paths = %#v, want only the first requested folder", launcher.paths)
	}
	if second != first {
		t.Fatalf("duplicate result = %+v, want original result %+v", second, first)
	}
}

func TestStartupAcceptsTheFirstDirectoryWhenSeveralArgumentsArePresent(t *testing.T) {
	folderPath := t.TempDir()
	launcher := &recordingNewWindowLauncher{}
	holder := application.NewApplicationContextHolderWithOptions(nil, nil, application.ApplicationContextOptions{
		StartupArgs:       []string{folderPath, "/ignored/second"},
		NewWindowLauncher: launcher,
	})

	target := holder.TakeLaunchTarget(context.Background())

	if target.Path != folderPath || target.Kind != "folder" {
		t.Fatalf("target = %+v, want folder %q", target, folderPath)
	}
	if len(launcher.paths) != 0 {
		t.Fatalf("launcher paths = %#v, want none for an ignored extra argument", launcher.paths)
	}
}
func TestStartupWithoutArgumentsAcceptsNoTarget(t *testing.T) {
	holder := application.NewApplicationContextHolderWithOptions(nil, nil, application.ApplicationContextOptions{})

	target := holder.TakeLaunchTarget(context.Background())

	if target.Path != "" || target.Kind != "" {
		t.Fatalf("target = %+v, want no target without a startup argument", target)
	}
}
func TestNewWindowChildStartsWithoutFolderOrTabs(t *testing.T) {
	t.Setenv("GOMARKEDIT_NEW_WINDOW_CHILD", "1")
	holder := application.NewApplicationContextHolderWithOptions(nil, nil, application.ApplicationContextOptions{})
	state, err := holder.AppModelService.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if len(state.Snapshot.OrderedDocumentIDs) != 0 || state.Snapshot.ActiveDocumentID != "" || state.ActiveBuffer != nil || state.Snapshot.Workspace != nil {
		t.Fatalf("child initial state = %+v, want no folder or tabs", state)
	}
}

func TestMarkedFolderChildTakesAFolderTargetAndStartsWithoutTabs(t *testing.T) {
	t.Setenv("GOMARKEDIT_NEW_WINDOW_CHILD", "1")
	folderPath := t.TempDir()
	holder := application.NewApplicationContextHolderWithOptions(&startupFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil, application.ApplicationContextOptions{
		StartupArgs:     []string{folderPath},
		AppModelOptions: []appmodel.AppModelOption{appmodel.WithEmitter(&startupOrderRecorder{})},
	})
	if err := holder.Init(context.Background()); err != nil {
		t.Fatalf("Init: %v", err)
	}
	t.Cleanup(func() { _ = holder.Close() })

	target := holder.TakeLaunchTarget(context.Background())

	if target.Path != folderPath || target.Kind != "folder" {
		t.Fatalf("target = %+v, want folder %q", target, folderPath)
	}
	state, err := holder.AppModelService.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if len(state.Snapshot.OrderedDocumentIDs) != 0 || state.Snapshot.ActiveDocumentID != "" || state.ActiveBuffer != nil || state.Snapshot.Workspace != nil {
		t.Fatalf("folder child state = %+v, want no tabs and no workspace until the frontend opens the target", state)
	}
}

func TestUnmarkedMissingStartupArgumentKeepsUntitled(t *testing.T) {
	t.Setenv("GOMARKEDIT_NEW_WINDOW_CHILD", "")
	missing := filepath.Join(t.TempDir(), "missing")
	holder := application.NewApplicationContextHolderWithOptions(nil, nil, application.ApplicationContextOptions{
		StartupArgs: []string{missing},
	})
	if target := holder.TakeLaunchTarget(context.Background()); target.Path != missing || target.Kind != "file" {
		t.Fatalf("target = %+v, want the missing path as a file target", target)
	}
	state, err := holder.AppModelService.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if len(state.Snapshot.OrderedDocumentIDs) != 1 || state.ActiveBuffer == nil || state.Snapshot.Documents[state.Snapshot.ActiveDocumentID].Title != "Untitled" {
		t.Fatalf("unmarked launch state = %+v, want default Untitled tab", state)
	}
}

func TestStartupFileArgumentIsTakenAsAFile(t *testing.T) {
	filePath := filepath.Join(t.TempDir(), "document.md")
	if err := os.WriteFile(filePath, []byte("# doc"), 0o600); err != nil {
		t.Fatalf("write startup file: %v", err)
	}
	holder := application.NewApplicationContextHolderWithOptions(nil, nil, application.ApplicationContextOptions{
		StartupArgs: []string{filePath},
	})

	target := holder.TakeLaunchTarget(context.Background())

	if target.Path != filePath || target.Kind != "file" {
		t.Fatalf("target = %+v, want file %q", target, filePath)
	}
}
func TestRetryStartupOpensNothingAndKeepsTheTargetTakeableAfterInitFailure(t *testing.T) {
	ctx := context.Background()
	tempDir := t.TempDir()
	folderPath := filepath.Join(tempDir, "workspace")
	if err := os.Mkdir(folderPath, 0o700); err != nil {
		t.Fatalf("create startup folder: %v", err)
	}
	recorder := &startupOrderRecorder{}
	fileUtils := &failOnceStartupFileUtils{
		startupFileUtils: startupFileUtils{databasePath: filepath.Join(tempDir, "settings.db")},
		initialError:     errors.New("temporary initialization failure"),
	}
	holder := application.NewApplicationContextHolderWithOptions(fileUtils, nil, application.ApplicationContextOptions{
		AppModelOptions: []appmodel.AppModelOption{appmodel.WithEmitter(recorder)},
		StartupArgs:     []string{folderPath},
	})
	holder.SetNativeWindow(retryStartupNativeWindow{recorder: recorder})
	t.Cleanup(func() {
		if err := holder.Close(); err != nil {
			t.Errorf("close application database: %v", err)
		}
	})

	if err := holder.Init(ctx); err == nil {
		t.Fatal("initialization succeeded despite the configured first-attempt failure")
	}
	if err := holder.RetryStartup(ctx); err != nil {
		t.Fatalf("retry startup: %v", err)
	}
	if err := holder.RetryStartup(ctx); err != nil {
		t.Fatalf("second startup retry: %v", err)
	}
	if got := strings.Join(recorder.snapshot(), ","); got != "restore" {
		t.Fatalf("startup events = %q, want one restore and no folder open", got)
	}
	if target := holder.TakeLaunchTarget(ctx); target.Path != folderPath || target.Kind != "folder" {
		t.Fatalf("target after retry = %+v, want the folder still takeable", target)
	}
}
