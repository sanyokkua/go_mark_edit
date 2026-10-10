package appmodel_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

type workspaceLayoutFixture struct {
	values []bool
	err    error
	calls  int
}

type workspaceToggleEmitter struct {
	fail    bool
	patches []apperr.AppStatePatch
}

func (emitter *workspaceToggleEmitter) EmitStatePatch(_ context.Context, patch apperr.AppStatePatch) error {
	if emitter.fail {
		return errors.New("workspace patch delivery failed")
	}
	emitter.patches = append(emitter.patches, patch)
	return nil
}

func (fixture *workspaceLayoutFixture) Read(_ context.Context, field string) (appmodel.VersionedLayoutValue, bool, error) {
	fixture.calls++
	if field != appmodel.LayoutWorkspaceHiddenFolders {
		return appmodel.VersionedLayoutValue{}, false, errors.New("unexpected workspace preference key")
	}
	if fixture.err != nil {
		return appmodel.VersionedLayoutValue{}, false, fixture.err
	}
	index := fixture.calls - 1
	if index >= len(fixture.values) {
		index = len(fixture.values) - 1
	}
	if index < 0 {
		return appmodel.VersionedLayoutValue{}, false, nil
	}
	return appmodel.VersionedLayoutValue{Value: fixture.values[index]}, true, nil
}

func (*workspaceLayoutFixture) Write(context.Context, string, appmodel.VersionedLayoutValue) (appmodel.LayoutWriteResult, error) {
	return appmodel.LayoutWriteResult{}, errors.New("workspace test fixture does not write settings")
}

func TestWorkspaceOpenRefreshFailureRecoveryAndClosePatches(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open settings database: %v", err)
	}
	defer func() { _ = database.Close() }()
	writeWorkspaceFile(t, root, "visible.md")
	writeWorkspaceFile(t, root, ".private/hidden.md")
	emitter := &recordingEmitter{}
	preferences := &workspaceLayoutFixture{values: []bool{true, false, false, true}}
	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(emitter),
		appmodel.AppModelOption{LayoutRepository: preferences},
		appmodel.AppModelOption{RecentItemsRepository: appmodel.NewSqliteRecentItemsRepository(database)},
	)

	opened := service.OpenWorkspace(ctx, root)
	if opened.Status != apperr.WorkspaceStatusOpened || opened.Workspace == nil {
		t.Fatalf("OpenWorkspace = %+v, want opened workspace", opened)
	}
	canonical, err := file.CanonicalizeDirectoryPath(root)
	if err != nil {
		t.Fatalf("canonicalize fixture root: %v", err)
	}
	if opened.Workspace.RootPath != canonical || opened.Workspace.ShowHiddenFolders != true {
		t.Fatalf("opened workspace = %+v, want canonical root with current hidden preference", opened.Workspace)
	}
	if got := workspaceChildNamesFromSnapshot(opened.Workspace.Root.Children); !equalStrings(got, []string{".private", "visible.md"}) {
		t.Fatalf("opened children = %v, want hidden folder and visible document", got)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatalf("GetState after open: %v", err)
	}
	if state.Snapshot.Workspace == nil || len(state.Snapshot.RecentItems) != 1 || state.Snapshot.RecentItems[0] != (apperr.RecentItem{Path: canonical, Kind: "folder"}) {
		t.Fatalf("open snapshot = %+v, want workspace and folder Recent Item", state.Snapshot)
	}
	patch := emitter.Patches()[0]
	if patch.Workspace == nil || patch.RecentItems[0].Kind != "folder" || patch.CanReopenLastFile == nil || !*patch.CanReopenLastFile {
		t.Fatalf("open patch = %+v, want workspace, folder recent item, and canReopenLastFile", patch)
	}

	patchCount := emitter.Count()
	unchanged := service.OpenWorkspace(ctx, root)
	if unchanged.Status != apperr.WorkspaceStatusUnchanged || preferences.calls != 1 || emitter.Count() != patchCount {
		t.Fatalf("same-root open = %+v; preference reads=%d patches=%d, want unchanged without another build", unchanged, preferences.calls, emitter.Count())
	}

	writeWorkspaceFile(t, root, "added.md")
	if err := os.Remove(filepath.Join(root, "visible.md")); err != nil {
		t.Fatalf("remove file before refresh: %v", err)
	}
	refreshed := service.RefreshWorkspace(ctx)
	if refreshed.Status != apperr.WorkspaceStatusOpened || refreshed.Workspace == nil || refreshed.Workspace.ShowHiddenFolders {
		t.Fatalf("RefreshWorkspace = %+v, want refreshed snapshot using latest false setting", refreshed)
	}
	if got := workspaceChildNamesFromSnapshot(refreshed.Workspace.Root.Children); !equalStrings(got, []string{"added.md"}) {
		t.Fatalf("refreshed children = %v, want newly created file with deleted file and hidden folder omitted", got)
	}

	priorChildren := workspaceChildNamesFromSnapshot(refreshed.Workspace.Root.Children)
	if err := os.RemoveAll(root); err != nil {
		t.Fatalf("remove workspace root: %v", err)
	}
	failed := service.RefreshWorkspace(ctx)
	if failed.Status != apperr.WorkspaceStatusRefused || failed.Error == nil || failed.Error.Category != apperr.ClassifiedNotFound {
		t.Fatalf("RefreshWorkspace for missing root = %+v, want not-found refusal", failed)
	}
	state, err = service.GetState(ctx)
	if err != nil {
		t.Fatalf("GetState after failed refresh: %v", err)
	}
	if state.Snapshot.Workspace == nil || !state.Snapshot.Workspace.Unavailable || !equalStrings(workspaceChildNamesFromSnapshot(state.Snapshot.Workspace.Root.Children), priorChildren) {
		t.Fatalf("failed refresh state = %+v, want retained unavailable tree", state.Snapshot.Workspace)
	}
	if !emitter.Patches()[emitter.Count()-1].Workspace.Snapshot.Unavailable {
		t.Fatal("failed refresh did not publish unavailable workspace state")
	}

	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatalf("recreate workspace root: %v", err)
	}
	writeWorkspaceFile(t, root, "recovered.md")
	recovered := service.RefreshWorkspace(ctx)
	if recovered.Status != apperr.WorkspaceStatusOpened || recovered.Workspace == nil || recovered.Workspace.Unavailable {
		t.Fatalf("RefreshWorkspace recovery = %+v, want available refreshed tree", recovered)
	}
	if got := workspaceChildNamesFromSnapshot(recovered.Workspace.Root.Children); !equalStrings(got, []string{"recovered.md"}) {
		t.Fatalf("recovered children = %v, want recovered.md", got)
	}
	if preferences.calls != 4 {
		t.Fatalf("hidden preference reads = %d, want one for each successful or failed build attempt", preferences.calls)
	}

	newSession := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(&recordingEmitter{}),
		appmodel.AppModelOption{RecentItemsRepository: appmodel.NewSqliteRecentItemsRepository(database)},
	)
	newState, err := newSession.GetState(ctx)
	if err != nil || newState.Snapshot.Workspace != nil {
		t.Fatalf("new service session workspace = %+v, error=%v; want no persisted tree", newState.Snapshot.Workspace, err)
	}

	closed := service.CloseWorkspace(ctx)
	if closed.Error != nil {
		t.Fatalf("CloseWorkspace: %+v", closed)
	}
	clearPatch := emitter.Patches()[emitter.Count()-1]
	if clearPatch.Workspace == nil {
		t.Fatalf("close patch = %+v, want an explicit workspace clear", clearPatch)
	}
	encoded, err := json.Marshal(clearPatch)
	if err != nil || !strings.Contains(string(encoded), `"workspace":null`) {
		t.Fatalf("close patch JSON = %s, error=%v; want workspace:null", encoded, err)
	}
	state, err = service.GetState(ctx)
	if err != nil || state.Snapshot.Workspace != nil {
		t.Fatalf("state after close = %+v, error=%v; want no workspace", state.Snapshot.Workspace, err)
	}
	encodedSnapshot, err := json.Marshal(state.Snapshot)
	if err != nil || strings.Contains(string(encodedSnapshot), `"workspace"`) {
		t.Fatalf("closed snapshot JSON = %s, error=%v; absent workspace must be omitted", encodedSnapshot, err)
	}
}

func TestWorkspaceOpenRefusesInvalidPathAndPreferenceReadFailure(t *testing.T) {
	ctx := context.Background()
	emitter := &recordingEmitter{}
	preferences := &workspaceLayoutFixture{err: errors.New("settings unavailable")}
	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(emitter),
		appmodel.AppModelOption{LayoutRepository: preferences},
	)
	filePath := filepath.Join(t.TempDir(), "note.md")
	writeWorkspaceFile(t, filepath.Dir(filePath), filepath.Base(filePath))
	invalid := service.OpenWorkspace(ctx, filePath)
	if invalid.Status != apperr.WorkspaceStatusRefused || invalid.Error == nil || invalid.Error.Category != apperr.ClassifiedUnsupportedInput {
		t.Fatalf("OpenWorkspace(file) = %+v, want unsupported-input refusal", invalid)
	}
	missing := service.OpenWorkspace(ctx, filepath.Join(t.TempDir(), "missing"))
	if missing.Status != apperr.WorkspaceStatusRefused || missing.Error == nil || missing.Error.Category != apperr.ClassifiedNotFound {
		t.Fatalf("OpenWorkspace(missing path) = %+v, want not-found refusal", missing)
	}
	refresh := service.RefreshWorkspace(ctx)
	if refresh.Status != apperr.WorkspaceStatusRefused || refresh.Error == nil || refresh.Error.Category != apperr.ClassifiedNotFound {
		t.Fatalf("RefreshWorkspace with no open folder = %+v, want not-found refusal", refresh)
	}
	if closed := service.CloseWorkspace(ctx); closed.Error != nil || emitter.Count() != 0 {
		t.Fatalf("CloseWorkspace with no open folder = %+v, patches=%d; want safe no-op", closed, emitter.Count())
	}
	validRoot := t.TempDir()
	refused := service.OpenWorkspace(ctx, validRoot)
	if refused.Status != apperr.WorkspaceStatusRefused || refused.Error == nil || refused.Error.Category != apperr.ClassifiedPersistenceWarning {
		t.Fatalf("OpenWorkspace with unreadable preference = %+v, want persistence-warning refusal", refused)
	}
	state, err := service.GetState(ctx)
	if err != nil || state.Snapshot.Workspace != nil || emitter.Count() != 0 {
		t.Fatalf("state after refused opens = %+v, error=%v, patches=%d; want unchanged", state.Snapshot.Workspace, err, emitter.Count())
	}
}

func TestOpenWorkspaceRefusesPermissionDeniedWhenHostEnforcesIt(t *testing.T) {
	root := t.TempDir()
	if err := os.Chmod(root, 0); err != nil {
		t.Fatalf("remove workspace read permissions: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(root, 0o755) })
	if _, err := os.ReadDir(root); err == nil {
		t.Skip("host does not enforce unreadable-directory permissions")
	}
	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(&recordingEmitter{}),
		appmodel.AppModelOption{LayoutRepository: &workspaceLayoutFixture{values: []bool{false}}},
	)
	result := service.OpenWorkspace(context.Background(), root)
	if result.Status != apperr.WorkspaceStatusRefused || result.Error == nil || result.Error.Category != apperr.ClassifiedPermissionDenied {
		t.Fatalf("OpenWorkspace on unreadable root = %+v, want permission-denied refusal", result)
	}
}

func TestWorkspaceRefreshMarksStaleWhenPreferenceReadFails(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	writeWorkspaceFile(t, root, "retained.md")
	preferences := &workspaceLayoutFixture{values: []bool{false}}
	emitter := &recordingEmitter{}
	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(emitter),
		appmodel.AppModelOption{LayoutRepository: preferences},
	)
	if result := service.OpenWorkspace(ctx, root); result.Workspace == nil {
		t.Fatalf("OpenWorkspace = %+v", result)
	}
	preferences.err = errors.New("settings unavailable")
	result := service.RefreshWorkspace(ctx)
	if result.Status != apperr.WorkspaceStatusRefused || result.Error == nil || result.Error.Category != apperr.ClassifiedPersistenceWarning {
		t.Fatalf("RefreshWorkspace with preference read failure = %+v, want persistence-warning refusal", result)
	}
	state, err := service.GetState(ctx)
	if err != nil || state.Snapshot.Workspace == nil || !state.Snapshot.Workspace.Unavailable || len(state.Snapshot.Workspace.Root.Children) != 1 || state.Snapshot.Workspace.Root.Children[0].Name != "retained.md" {
		t.Fatalf("refresh preference failure state = %+v, error=%v; want retained stale tree", state.Snapshot.Workspace, err)
	}
}

func TestWorkspaceRefreshReportsUnavailablePublicationFailure(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	writeWorkspaceFile(t, root, "retained.md")
	emitter := &workspaceToggleEmitter{}
	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(emitter),
		appmodel.AppModelOption{LayoutRepository: &workspaceLayoutFixture{values: []bool{false, false}}},
	)
	if opened := service.OpenWorkspace(ctx, root); opened.Workspace == nil {
		t.Fatalf("OpenWorkspace = %+v", opened)
	}
	if err := os.RemoveAll(root); err != nil {
		t.Fatalf("remove workspace root: %v", err)
	}
	emitter.fail = true
	result := service.RefreshWorkspace(ctx)
	if result.Status != apperr.WorkspaceStatusRefused || result.Error == nil || result.Error.Category != apperr.ClassifiedIOFailure {
		t.Fatalf("RefreshWorkspace with failed unavailable publication = %+v, want IO publication refusal", result)
	}
	state, err := service.GetState(ctx)
	if err != nil || state.Snapshot.Workspace == nil || state.Snapshot.Workspace.Unavailable || len(state.Snapshot.Workspace.Root.Children) != 1 || state.Snapshot.Workspace.Root.Children[0].Name != "retained.md" {
		t.Fatalf("workspace after failed unavailable publication = %+v, error=%v; want rolled-back prior tree", state.Snapshot.Workspace, err)
	}
}

func TestWorkspaceOpenPublishesEntryLimitAndTruncation(t *testing.T) {
	const maxEntries = 20_000
	root := t.TempDir()
	for index := 0; index < maxEntries; index++ {
		name := filepath.Join(root, fmt.Sprintf("note-%05d.md", index))
		if err := os.WriteFile(name, []byte("note"), 0o600); err != nil {
			t.Fatalf("create workspace entry %d: %v", index, err)
		}
	}
	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(&recordingEmitter{}),
		appmodel.AppModelOption{LayoutRepository: &workspaceLayoutFixture{values: []bool{false}}},
	)
	opened := service.OpenWorkspace(context.Background(), root)
	if opened.Status != apperr.WorkspaceStatusOpened || opened.Workspace == nil {
		t.Fatalf("OpenWorkspace large tree = status %s, error=%+v", opened.Status, opened.Error)
	}
	if opened.Workspace.TotalEntries != maxEntries || !opened.Workspace.Truncated {
		t.Fatalf("open workspace total=%d truncated=%t, want total=%d and truncated", opened.Workspace.TotalEntries, opened.Workspace.Truncated, maxEntries)
	}
	if len(opened.Workspace.Root.Children) != maxEntries-1 {
		t.Fatalf("open workspace root children=%d, want %d retained children after counting root", len(opened.Workspace.Root.Children), maxEntries-1)
	}
}

func TestWorkspaceLifecycleReadsPersistedHiddenFolderPreferenceForEachBuild(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open settings database: %v", err)
	}
	defer func() { _ = database.Close() }()
	preferences := appmodel.NewSqliteLayoutRepository(database)
	root := t.TempDir()
	writeWorkspaceFile(t, root, ".private/hidden.md")
	writeWorkspaceFile(t, root, "visible.md")
	emitter := &recordingEmitter{}
	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(emitter),
		appmodel.AppModelOption{LayoutRepository: preferences},
	)

	missingSetting, found, err := preferences.Read(ctx, appmodel.LayoutWorkspaceHiddenFolders)
	if err != nil || found || missingSetting.Value != nil {
		t.Fatalf("missing persisted setting = %+v, found=%t, error=%v; want absent", missingSetting, found, err)
	}
	missingOpen := service.OpenWorkspace(ctx, root)
	if missingOpen.Workspace == nil || missingOpen.Workspace.ShowHiddenFolders || !equalStrings(workspaceChildNamesFromSnapshot(missingOpen.Workspace.Root.Children), []string{"visible.md"}) {
		t.Fatalf("open with missing persisted setting = %+v; want hidden folders off", missingOpen)
	}
	if result := service.CloseWorkspace(ctx); result.Error != nil {
		t.Fatalf("close workspace before setting update: %+v", result)
	}
	if _, err := preferences.Write(ctx, appmodel.LayoutWorkspaceHiddenFolders, appmodel.VersionedLayoutValue{Version: 1, Value: true, WriterID: "test", Sequence: 1}); err != nil {
		t.Fatalf("persist true hidden-folders setting: %v", err)
	}
	opened := service.OpenWorkspace(ctx, root)
	if opened.Workspace == nil || !opened.Workspace.ShowHiddenFolders || !equalStrings(workspaceChildNamesFromSnapshot(opened.Workspace.Root.Children), []string{".private", "visible.md"}) {
		t.Fatalf("open with persisted true setting = %+v", opened)
	}
	if _, err := preferences.Write(ctx, appmodel.LayoutWorkspaceHiddenFolders, appmodel.VersionedLayoutValue{Version: 1, Value: false, WriterID: "test", Sequence: 2}); err != nil {
		t.Fatalf("persist false hidden-folders setting: %v", err)
	}
	refreshed := service.RefreshWorkspace(ctx)
	if refreshed.Workspace == nil || refreshed.Workspace.ShowHiddenFolders || !equalStrings(workspaceChildNamesFromSnapshot(refreshed.Workspace.Root.Children), []string{"visible.md"}) {
		t.Fatalf("refresh with persisted false setting = %+v", refreshed)
	}
}

func TestChooseWorkspaceFolderCanonicalizesWithoutOpening(t *testing.T) {
	ctx := context.Background()
	parent := t.TempDir()
	root := filepath.Join(parent, "notes")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(t.TempDir(), "alias")
	if err := os.Symlink(parent, link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	dialogs := application.NewDocumentDialogs(nil)
	dialogs.SetFolderPicker(func(context.Context) (string, error) { return filepath.Join(link, "notes"), nil })
	service := appmodel.NewAppModelServiceForHost(appmodel.WithDialogs(dialogs, dialogs), appmodel.WithEmitter(&recordingEmitter{}), appmodel.AppModelOption{LayoutRepository: &workspaceWritableLayout{}})
	handler := appmodel.NewAppModelHandler(service, nil, func() context.Context { return ctx })
	chosen := handler.ChooseWorkspaceFolder(bridge.Request{ID: "choose-folder"})
	canonical, err := file.CanonicalizeDirectoryPath(root)
	if err != nil {
		t.Fatal(err)
	}
	if chosen.Status != apperr.FolderChoiceStatusChosen || chosen.Path != canonical {
		t.Fatalf("choice = %+v, want canonical %q", chosen, canonical)
	}
	state, err := service.GetState(ctx)
	if err != nil || state.Snapshot.Workspace != nil {
		t.Fatalf("choice opened a folder: %+v/%v", state.Snapshot.Workspace, err)
	}
	opened := service.OpenWorkspace(ctx, chosen.Path)
	if opened.Workspace == nil || opened.Workspace.RootPath != chosen.Path {
		t.Fatalf("picked path %q differs from opened root %+v", chosen.Path, opened)
	}
	if again := handler.ChooseWorkspaceFolder(bridge.Request{ID: "choose-folder"}); !reflect.DeepEqual(chosen, again) {
		t.Fatalf("deduplicated choice = %+v, want %+v", again, chosen)
	}
	dialogs.SetFolderPicker(func(context.Context) (string, error) { return "", nil })
	if cancelled := handler.ChooseWorkspaceFolder(bridge.Request{ID: "cancel-folder"}); cancelled.Status != apperr.FolderChoiceStatusCancelled {
		t.Fatalf("cancelled = %+v", cancelled)
	}
	dialogs.SetFolderPicker(func(context.Context) (string, error) { return "", errors.New("picker failed") })
	if refused := handler.ChooseWorkspaceFolder(bridge.Request{ID: "fail-folder"}); refused.Status != apperr.FolderChoiceStatusRefused || refused.Error == nil {
		t.Fatalf("refused = %+v", refused)
	}
	dialogs.SetFolderPicker(func(context.Context) (string, error) { return filepath.Join(parent, "missing"), nil })
	if invalid := handler.ChooseWorkspaceFolder(bridge.Request{ID: "missing-folder"}); invalid.Status != apperr.FolderChoiceStatusRefused || invalid.Error == nil || invalid.Error.Category != apperr.ClassifiedNotFound {
		t.Fatalf("invalid chosen path = %+v", invalid)
	}
	withoutPicker := appmodel.NewAppModelServiceForHost()
	if unavailable := withoutPicker.ChooseWorkspaceFolder(ctx); unavailable.Status != apperr.FolderChoiceStatusRefused || unavailable.Error == nil || unavailable.Error.Category != apperr.ClassifiedSystemCommandFailure {
		t.Fatalf("missing picker = %+v", unavailable)
	}
}

func TestHiddenFolderSetterPersistsAndRefreshesOnlyItsWindow(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = database.Close() }()
	repository := appmodel.NewSqliteLayoutRepository(database)
	root := t.TempDir()
	writeWorkspaceFile(t, root, ".private/note.md")
	writeWorkspaceFile(t, root, ".secret.md")
	writeWorkspaceFile(t, root, "visible.md")
	first := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&recordingEmitter{}), appmodel.AppModelOption{LayoutRepository: repository})
	second := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&recordingEmitter{}), appmodel.AppModelOption{LayoutRepository: repository})
	first.OpenWorkspace(ctx, root)
	second.OpenWorkspace(ctx, root)
	shown := first.SetWorkspaceHiddenFolders(ctx, true)
	if shown.Status != apperr.WorkspaceStatusOpened || shown.Workspace == nil || !shown.Workspace.ShowHiddenFolders || !equalStrings(workspaceChildNamesFromSnapshot(shown.Workspace.Root.Children), []string{".private", "visible.md"}) {
		t.Fatalf("shown = %+v", shown)
	}
	other, _ := second.GetState(ctx)
	if other.Snapshot.Workspace == nil || other.Snapshot.Workspace.ShowHiddenFolders {
		t.Fatalf("other window changed without refresh: %+v", other.Snapshot.Workspace)
	}
	if refreshed := second.RefreshWorkspace(ctx); refreshed.Workspace == nil || !refreshed.Workspace.ShowHiddenFolders {
		t.Fatalf("other window did not adopt setting: %+v", refreshed)
	}
	if hidden := first.SetWorkspaceHiddenFolders(ctx, false); hidden.Workspace == nil || hidden.Workspace.ShowHiddenFolders || !equalStrings(workspaceChildNamesFromSnapshot(hidden.Workspace.Root.Children), []string{"visible.md"}) {
		t.Fatalf("hidden = %+v", hidden)
	}
	relaunched := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&recordingEmitter{}), appmodel.AppModelOption{LayoutRepository: repository})
	if reopened := relaunched.OpenWorkspace(ctx, root); reopened.Workspace == nil || reopened.Workspace.ShowHiddenFolders {
		t.Fatalf("relaunch = %+v", reopened)
	}
}

func TestHiddenFolderSetterWorksWithoutFolderPublishesAndRestores(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = database.Close() }()
	repository := appmodel.NewSqliteLayoutRepository(database)
	emitter := &recordingEmitter{}
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(emitter), appmodel.AppModelOption{LayoutRepository: repository})

	result := service.SetWorkspaceHiddenFolders(ctx, true)
	if result.Status == apperr.WorkspaceStatusRefused || result.Error != nil || result.Workspace != nil {
		t.Fatalf("setting without folder = %+v", result)
	}
	stored, found, err := repository.Read(ctx, appmodel.LayoutWorkspaceHiddenFolders)
	if err != nil || !found || stored.Value != true {
		t.Fatalf("stored = %+v found=%t err=%v", stored, found, err)
	}
	patches := emitter.Patches()
	if len(patches) != 1 || patches[0].UI == nil || !isTrue(patches[0].UI.ShowHiddenFolders) || patches[0].Workspace != nil {
		t.Fatalf("patches = %+v, want one UI-only patch carrying showHiddenFolders", patches)
	}
	state, err := service.GetState(ctx)
	if err != nil || !isTrue(state.Snapshot.UI.ShowHiddenFolders) || state.Snapshot.Workspace != nil {
		t.Fatalf("state = %+v/%v", state.Snapshot.UI, err)
	}

	restarted := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&recordingEmitter{}), appmodel.AppModelOption{LayoutRepository: repository})
	if err := restarted.RestoreUILayout(ctx); err != nil {
		t.Fatal(err)
	}
	state, err = restarted.GetState(ctx)
	if err != nil || !isTrue(state.Snapshot.UI.ShowHiddenFolders) {
		t.Fatalf("restored UI = %+v/%v", state.Snapshot.UI, err)
	}

	root := t.TempDir()
	writeWorkspaceFile(t, root, ".notes/a.md")
	opened := restarted.OpenWorkspace(ctx, root)
	if opened.Workspace == nil || !opened.Workspace.ShowHiddenFolders || !equalStrings(workspaceChildNamesFromSnapshot(opened.Workspace.Root.Children), []string{".notes"}) {
		t.Fatalf("open after restore = %+v", opened)
	}
}

func TestHiddenFolderSetterWithFolderPublishesUIAndWorkspaceInOnePatch(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = database.Close() }()
	root := t.TempDir()
	writeWorkspaceFile(t, root, ".notes/a.md")
	emitter := &recordingEmitter{}
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(emitter), appmodel.AppModelOption{LayoutRepository: appmodel.NewSqliteLayoutRepository(database)})
	service.OpenWorkspace(ctx, root)
	before := emitter.Count()
	service.SetWorkspaceHiddenFolders(ctx, true)
	patches := emitter.Patches()[before:]
	if len(patches) != 1 || patches[0].UI == nil || !isTrue(patches[0].UI.ShowHiddenFolders) || patches[0].Workspace == nil {
		t.Fatalf("patches = %+v, want one patch with UI and workspace", patches)
	}
}

func TestSetUILayoutIgnoresIncomingShowHiddenFolders(t *testing.T) {
	ctx := context.Background()
	repository := &storedLayoutRepository{}
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&recordingEmitter{}), appmodel.AppModelOption{LayoutRepository: repository})
	show, maximized := true, true
	if err := service.SetUILayout(ctx, apperr.UILayout{ShowHiddenFolders: &show, WindowMaximized: &maximized}); err != nil {
		t.Fatal(err)
	}
	for _, field := range repository.writes {
		if field == appmodel.LayoutWorkspaceHiddenFolders {
			t.Fatalf("writes = %v, SetUILayout must not write the hidden-folders preference", repository.writes)
		}
	}
	state, err := service.GetState(ctx)
	if err != nil || isTrue(state.Snapshot.UI.ShowHiddenFolders) {
		t.Fatalf("UI = %+v/%v, incoming showHiddenFolders must be ignored", state.Snapshot.UI, err)
	}
}

func TestHiddenFolderSetterKeepsPersistedWinnerOfStaleWrite(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = database.Close() }()
	repository := appmodel.NewSqliteLayoutRepository(database)
	root := t.TempDir()
	writeWorkspaceFile(t, root, ".private/note.md")
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(&recordingEmitter{}), appmodel.AppModelOption{LayoutRepository: repository})
	if result := service.OpenWorkspace(ctx, root); result.Status != apperr.WorkspaceStatusOpened {
		t.Fatalf("open = %+v", result)
	}
	winning := appmodel.VersionedLayoutValue{Version: 1, Value: true, ChangedAtUnixNano: 1 << 62, WriterID: "other-window", Sequence: 1}
	if result, err := repository.Write(ctx, appmodel.LayoutWorkspaceHiddenFolders, winning); err != nil || !result.Applied {
		t.Fatalf("store winning setting = %+v/%v", result, err)
	}
	result := service.SetWorkspaceHiddenFolders(ctx, false)
	if result.Status != apperr.WorkspaceStatusOpened || result.Workspace == nil || !result.Workspace.ShowHiddenFolders || !equalStrings(workspaceChildNamesFromSnapshot(result.Workspace.Root.Children), []string{".private"}) {
		t.Fatalf("stale write projection = %+v, want persisted winner", result)
	}
}

func TestHiddenFolderSetterClassifiesWriteAndPublicationFailures(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	writeWorkspaceFile(t, root, ".private/note.md")
	for _, test := range []struct {
		name        string
		failWrite   bool
		failPublish bool
		category    apperr.ClassifiedErrorCategory
	}{
		{"write", true, false, apperr.ClassifiedPersistenceWarning},
		{"publication", false, true, apperr.ClassifiedIOFailure},
	} {
		t.Run(test.name, func(t *testing.T) {
			repository := &workspaceWritableLayout{failWrite: test.failWrite}
			emitter := &workspaceToggleEmitter{}
			service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(emitter), appmodel.AppModelOption{LayoutRepository: repository})
			if result := service.OpenWorkspace(ctx, root); result.Status != apperr.WorkspaceStatusOpened {
				t.Fatalf("open = %+v", result)
			}
			emitter.fail = test.failPublish
			result := service.SetWorkspaceHiddenFolders(ctx, true)
			if result.Status != apperr.WorkspaceStatusRefused || result.Error == nil || result.Error.Category != test.category {
				t.Fatalf("setter failure = %+v", result)
			}
			state, err := service.GetState(ctx)
			if err != nil || state.Snapshot.Workspace == nil || state.Snapshot.Workspace.ShowHiddenFolders {
				t.Fatalf("failed setter changed snapshot: %+v/%v", state.Snapshot.Workspace, err)
			}
			if test.failPublish && !repository.value {
				t.Fatal("publication failure should retain persisted setting")
			}
		})
	}
}

func TestHiddenFolderSetterMarksMissingRootUnavailableAfterPersisting(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	writeWorkspaceFile(t, root, "visible.md")
	repository := &workspaceWritableLayout{}
	emitter := &workspaceToggleEmitter{}
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(emitter), appmodel.AppModelOption{LayoutRepository: repository})
	if opened := service.OpenWorkspace(ctx, root); opened.Workspace == nil {
		t.Fatalf("open = %+v", opened)
	}
	if err := os.RemoveAll(root); err != nil {
		t.Fatal(err)
	}
	result := service.SetWorkspaceHiddenFolders(ctx, true)
	if result.Status != apperr.WorkspaceStatusRefused || result.Error == nil || result.Error.Category != apperr.ClassifiedNotFound {
		t.Fatalf("missing-root setter = %+v", result)
	}
	if !repository.value {
		t.Fatal("visibility setting was not persisted before rebuild")
	}
	state, err := service.GetState(ctx)
	if err != nil || state.Snapshot.Workspace == nil || !state.Snapshot.Workspace.Unavailable || !equalStrings(workspaceChildNamesFromSnapshot(state.Snapshot.Workspace.Root.Children), []string{"visible.md"}) {
		t.Fatalf("unavailable tree = %+v/%v", state.Snapshot.Workspace, err)
	}
	if len(emitter.patches) != 2 || emitter.patches[1].Workspace == nil || !emitter.patches[1].Workspace.Snapshot.Unavailable {
		t.Fatalf("missing unavailable publication: %+v", emitter.patches)
	}
}

type workspaceWritableLayout struct {
	value     bool
	found     bool
	failWrite bool
}

func (layout *workspaceWritableLayout) Read(_ context.Context, field string) (appmodel.VersionedLayoutValue, bool, error) {
	if field != appmodel.LayoutWorkspaceHiddenFolders {
		return appmodel.VersionedLayoutValue{}, false, errors.New("unexpected layout field")
	}
	if !layout.found {
		return appmodel.VersionedLayoutValue{}, false, nil
	}
	return appmodel.VersionedLayoutValue{Version: 1, Value: layout.value}, true, nil
}

func (layout *workspaceWritableLayout) Write(_ context.Context, field string, value appmodel.VersionedLayoutValue) (appmodel.LayoutWriteResult, error) {
	if layout.failWrite {
		return appmodel.LayoutWriteResult{}, errors.New("write failed")
	}
	if field != appmodel.LayoutWorkspaceHiddenFolders {
		return appmodel.LayoutWriteResult{}, errors.New("unexpected layout field")
	}
	layout.value = value.Value.(bool)
	layout.found = true
	return appmodel.LayoutWriteResult{Applied: true, Value: value}, nil
}

func TestWorkspaceHandlerBindsAndDeduplicatesLifecycleCommands(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	writeWorkspaceFile(t, root, "note.md")
	emitter := &recordingEmitter{}
	service := appmodel.NewAppModelServiceForHost(
		appmodel.WithEmitter(emitter),
		appmodel.AppModelOption{LayoutRepository: &workspaceLayoutFixture{values: []bool{false, false}}},
	)
	handler := appmodel.NewAppModelHandler(service, nil, func() context.Context { return ctx })

	methods := []struct {
		name string
		args int
		out  reflect.Type
	}{
		{name: "OpenWorkspace", args: 3, out: reflect.TypeFor[apperr.WorkspaceResult]()},
		{name: "RefreshWorkspace", args: 2, out: reflect.TypeFor[apperr.WorkspaceResult]()},
		{name: "CloseWorkspace", args: 2, out: reflect.TypeFor[apperr.ClassifiedVoidResult]()},
	}
	for _, expected := range methods {
		method, ok := reflect.TypeOf(handler).MethodByName(expected.name)
		if !ok || method.Type.NumIn() != expected.args || method.Type.NumOut() != 1 || method.Type.Out(0) != expected.out {
			t.Fatalf("bound %s method = (%v, %t), want %d inputs and output %v", expected.name, method.Type, ok, expected.args, expected.out)
		}
	}

	request := bridge.Request{ID: "workspace-open-once"}
	first := handler.OpenWorkspace(request, root)
	second := handler.OpenWorkspace(request, root)
	if first.Status != apperr.WorkspaceStatusOpened || second.Status != first.Status || emitter.Count() != 1 {
		t.Fatalf("deduplicated OpenWorkspace outcomes = %+v / %+v, patches=%d; want one open publication", first, second, emitter.Count())
	}
	if refreshed := handler.RefreshWorkspace(bridge.Request{ID: "workspace-refresh"}); refreshed.Workspace == nil {
		t.Fatalf("RefreshWorkspace bound result = %+v", refreshed)
	}
	if closed := handler.CloseWorkspace(bridge.Request{ID: "workspace-close"}); closed.Error != nil {
		t.Fatalf("CloseWorkspace bound result = %+v", closed)
	}
	if emitter.Count() != 3 {
		t.Fatalf("workspace handler patches = %d, want open, refresh, and close", emitter.Count())
	}
}

func workspaceChildNamesFromSnapshot(nodes []apperr.WorkspaceNode) []string {
	names := make([]string, len(nodes))
	for index, node := range nodes {
		names[index] = node.Name
	}
	return names
}

func equalStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func writeWorkspaceFile(t *testing.T, directory, name string) {
	t.Helper()
	path := filepath.Join(directory, name)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create workspace path %q: %v", path, err)
	}
	if err := os.WriteFile(path, []byte("note\n"), 0o600); err != nil {
		t.Fatalf("write workspace file %q: %v", path, err)
	}
}
