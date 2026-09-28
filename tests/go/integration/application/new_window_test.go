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

func (launcher *recordingNewWindowLauncher) Launch(folderPath string) error {
	launcher.paths = append(launcher.paths, folderPath)
	return launcher.err
}

func TestNewWindowLauncherReceivesEachRequestedFolderPath(t *testing.T) {
	for _, folderPath := range []string{"", filepath.Join(t.TempDir(), "project")} {
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

func TestStartupArgumentOpensTheFirstDirectoryWhenSeveralArgumentsArePresent(t *testing.T) {
	folderPath := t.TempDir()
	var opened []string

	result := application.OpenStartupFolderFromArgs([]string{folderPath, "/ignored/second"}, func(path string) apperr.WorkspaceOutcome {
		opened = append(opened, path)
		return apperr.WorkspaceOutcome{Status: apperr.WorkspaceStatusOpened}
	})

	if result.Status != apperr.WorkspaceStatusOpened {
		t.Fatalf("startup result status = %q, want %q", result.Status, apperr.WorkspaceStatusOpened)
	}
	if len(opened) != 1 || opened[0] != folderPath {
		t.Fatalf("opened paths = %#v, want one open of %q", opened, folderPath)
	}
}

func TestStartupArgumentDoesNotOpenFolderWhenNoArgumentIsPresent(t *testing.T) {
	openCalls := 0

	result := application.OpenStartupFolderFromArgs(nil, func(string) apperr.WorkspaceOutcome {
		openCalls++
		return apperr.WorkspaceOutcome{Status: apperr.WorkspaceStatusOpened}
	})

	if openCalls != 0 {
		t.Fatalf("OpenWorkspace calls = %d, want 0 without a startup argument", openCalls)
	}
	if result.Status != "" {
		t.Fatalf("startup result status = %q, want no result", result.Status)
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

func TestMarkedFolderChildOpensWorkspaceWithoutTabs(t *testing.T) {
	t.Setenv("GOMARKEDIT_NEW_WINDOW_CHILD", "1")
	folderPath := t.TempDir()
	if err := os.WriteFile(filepath.Join(folderPath, "chapter.md"), []byte("# Chapter"), 0o600); err != nil {
		t.Fatalf("write folder child fixture: %v", err)
	}
	holder := application.NewApplicationContextHolderWithOptions(&startupFileUtils{databasePath: filepath.Join(t.TempDir(), "settings.db")}, nil, application.ApplicationContextOptions{
		StartupFolderArgs: []string{folderPath},
		AppModelOptions:   []appmodel.AppModelOption{appmodel.WithEmitter(&startupOrderRecorder{})},
	})
	if err := holder.Init(context.Background()); err != nil {
		t.Fatalf("Init: %v", err)
	}
	t.Cleanup(func() { _ = holder.Close() })
	result := holder.OpenPendingStartupFolder(context.Background())
	if result.Status != apperr.WorkspaceStatusOpened {
		t.Fatalf("startup folder status = %q, want opened", result.Status)
	}
	state, err := holder.AppModelService.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	canonicalFolder, err := filepath.EvalSymlinks(folderPath)
	if err != nil {
		t.Fatalf("canonicalize fixture folder: %v", err)
	}
	if len(state.Snapshot.OrderedDocumentIDs) != 0 || state.Snapshot.ActiveDocumentID != "" || state.ActiveBuffer != nil || state.Snapshot.Workspace == nil || state.Snapshot.Workspace.RootPath != canonicalFolder || len(state.Snapshot.Workspace.Root.Children) != 1 || state.Snapshot.Workspace.Root.Children[0].Name != "chapter.md" {
		t.Fatalf("folder child state = %+v, want sidebar tree and no tabs", state)
	}
}

func TestUnmarkedInvalidStartupArgumentKeepsUntitled(t *testing.T) {
	t.Setenv("GOMARKEDIT_NEW_WINDOW_CHILD", "")
	holder := application.NewApplicationContextHolderWithOptions(nil, nil, application.ApplicationContextOptions{
		StartupFolderArgs: []string{filepath.Join(t.TempDir(), "missing")},
	})
	state, err := holder.AppModelService.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if len(state.Snapshot.OrderedDocumentIDs) != 1 || state.ActiveBuffer == nil || state.Snapshot.Documents[state.Snapshot.ActiveDocumentID].Title != "Untitled" {
		t.Fatalf("unmarked launch state = %+v, want default Untitled tab", state)
	}
}

func TestStartupArgumentDoesNotOpenFolderWhenFirstArgumentIsNotDirectory(t *testing.T) {
	filePath := filepath.Join(t.TempDir(), "document.md")
	if err := os.WriteFile(filePath, []byte("# doc"), 0o600); err != nil {
		t.Fatalf("write startup file: %v", err)
	}
	openCalls := 0

	result := application.OpenStartupFolderFromArgs([]string{filePath}, func(string) apperr.WorkspaceOutcome {
		openCalls++
		return apperr.WorkspaceOutcome{Status: apperr.WorkspaceStatusOpened}
	})

	if openCalls != 0 {
		t.Fatalf("OpenWorkspace calls = %d, want 0 for a non-directory argument", openCalls)
	}
	if result.Status != "" {
		t.Fatalf("startup result status = %q, want no result", result.Status)
	}
}

func TestRetryStartupOpensPassedFolderOnceBeforeRestoringWindowAfterInitFailure(t *testing.T) {
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
		AppModelOptions:   []appmodel.AppModelOption{appmodel.WithEmitter(recorder)},
		StartupFolderArgs: []string{folderPath},
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
	if got := strings.Join(recorder.snapshot(), ","); got != "workspace,restore" {
		t.Fatalf("startup events = %q, want workspace open before native restore", got)
	}
	if result := holder.OpenPendingStartupFolder(ctx); result.Status != "" {
		t.Fatalf("startup folder result after retry = %q, want no pending open", result.Status)
	}
	if err := holder.RetryStartup(ctx); err != nil {
		t.Fatalf("second startup retry: %v", err)
	}
	if got := strings.Join(recorder.snapshot(), ","); got != "workspace,restore" {
		t.Fatalf("startup events after repeated retry = %q, want one open and one restore", got)
	}
}
