package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

type storedLayoutRepository struct {
	stored map[string]VersionedLayoutValue
	writes []string
}

func (repository *storedLayoutRepository) Read(_ context.Context, field string) (VersionedLayoutValue, bool, error) {
	value, found := repository.stored[field]
	return value, found, nil
}

func (repository *storedLayoutRepository) Write(_ context.Context, field string, value VersionedLayoutValue) (LayoutWriteResult, error) {
	repository.writes = append(repository.writes, field)
	return LayoutWriteResult{Applied: true, Value: value}, nil
}

func sidebarVisible(t *testing.T, service *AppModelService) bool {
	t.Helper()
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	return state.Snapshot.UI.SidebarVisible != nil && *state.Snapshot.UI.SidebarVisible
}

func isTrue(value *bool) bool { return value != nil && *value }

func TestSidebarStartsHiddenAndOpenAndCloseWorkspacePublishItInOnePatch(t *testing.T) {
	ctx := context.Background()
	emitter := &recordingEmitter{}
	service := NewAppModelServiceForHost(WithEmitter(emitter), AppModelOption{LayoutRepository: &storedLayoutRepository{}})
	root := t.TempDir()
	writeWorkspaceFile(t, root, "a.md")

	if sidebarVisible(t, service) {
		t.Fatal("a new service must start with the sidebar hidden")
	}
	if opened := service.OpenWorkspace(ctx, root); opened.Status != apperr.WorkspaceStatusOpened {
		t.Fatalf("OpenWorkspace = %+v", opened)
	}
	patches := emitter.Patches()
	if len(patches) != 1 || patches[0].Workspace == nil || patches[0].UI == nil || !isTrue(patches[0].UI.SidebarVisible) {
		t.Fatalf("open patches = %+v, want one patch carrying workspace and sidebar visible", patches)
	}
	if !sidebarVisible(t, service) {
		t.Fatal("opening a folder must show the sidebar")
	}

	if result := service.CloseWorkspace(ctx); result.Error != nil {
		t.Fatalf("CloseWorkspace = %+v", result)
	}
	patches = emitter.Patches()
	last := patches[len(patches)-1]
	if len(patches) != 2 || last.Workspace == nil || last.Workspace.Snapshot != nil || last.UI == nil || last.UI.SidebarVisible == nil || *last.UI.SidebarVisible {
		t.Fatalf("close patches = %+v, want one patch carrying null workspace and sidebar hidden", patches)
	}
	if sidebarVisible(t, service) {
		t.Fatal("closing the folder must hide the sidebar")
	}
}

func TestReopeningTheShownFolderShowsAHiddenSidebarAndChangesNothingElse(t *testing.T) {
	ctx := context.Background()
	emitter := &recordingEmitter{}
	service := NewAppModelServiceForHost(WithEmitter(emitter), AppModelOption{LayoutRepository: &storedLayoutRepository{}})
	root := t.TempDir()
	writeWorkspaceFile(t, root, "a.md")
	service.OpenWorkspace(ctx, root)

	hidden := false
	if err := service.SetUILayout(ctx, apperr.UILayout{SidebarVisible: &hidden}); err != nil {
		t.Fatalf("hide sidebar: %v", err)
	}
	count := emitter.Count()
	again := service.OpenWorkspace(ctx, root)
	if again.Status != apperr.WorkspaceStatusUnchanged {
		t.Fatalf("same-root open = %+v, want unchanged", again)
	}
	patches := emitter.Patches()
	if len(patches) != count+1 {
		t.Fatalf("patches = %d, want exactly one sidebar patch after %d", len(patches), count)
	}
	patch := patches[count]
	if patch.UI == nil || !isTrue(patch.UI.SidebarVisible) || patch.Workspace != nil || patch.Documents != nil || patch.RecentItems != nil || patch.CanReopenLastFile != nil {
		t.Fatalf("re-open patch = %+v, want a sidebar-only patch", patch)
	}
	if !sidebarVisible(t, service) {
		t.Fatal("re-opening the shown folder must show the sidebar")
	}

	count = emitter.Count()
	service.OpenWorkspace(ctx, root)
	if emitter.Count() != count {
		t.Fatal("re-opening with the sidebar already shown must publish nothing")
	}
}

func TestRestoreIgnoresStoredWorkspaceVisibleAndPersistNeverWritesIt(t *testing.T) {
	ctx := context.Background()
	repository := &storedLayoutRepository{stored: map[string]VersionedLayoutValue{
		"workspace.visible":  {Version: 1, Value: true},
		LayoutWorkspaceWidth: {Version: 1, Value: 280},
	}}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{LayoutRepository: repository})
	if err := service.RestoreUILayout(ctx); err != nil {
		t.Fatalf("RestoreUILayout: %v", err)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if isTrue(state.Snapshot.UI.SidebarVisible) {
		t.Fatal("a stored workspace.visible=true must be ignored")
	}
	if state.Snapshot.UI.SidebarWidth == nil || *state.Snapshot.UI.SidebarWidth != 280 {
		t.Fatalf("restored width = %+v, want 280", state.Snapshot.UI.SidebarWidth)
	}

	visible, maximized := true, true
	if err := service.SetUILayout(ctx, apperr.UILayout{SidebarVisible: &visible, WindowMaximized: &maximized}); err != nil {
		t.Fatalf("SetUILayout: %v", err)
	}
	for _, field := range repository.writes {
		if field == "workspace.visible" {
			t.Fatalf("writes = %v, visibility must never be persisted", repository.writes)
		}
	}
	if len(repository.writes) != 1 || repository.writes[0] != LayoutWindowMaximized {
		t.Fatalf("writes = %v, want only the maximized state", repository.writes)
	}
	if !sidebarVisible(t, service) {
		t.Fatal("SetUILayout must keep visibility in memory and publish it")
	}
}

func TestDocumentLifecycleLeavesSidebarVisibilityUnchanged(t *testing.T) {
	ctx := context.Background()
	for _, shown := range []bool{false, true} {
		service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
		if err := service.SetUILayout(ctx, apperr.UILayout{SidebarVisible: &shown}); err != nil {
			t.Fatalf("set sidebar: %v", err)
		}
		path := filepath.Join(t.TempDir(), "notes.md")
		if err := os.WriteFile(path, []byte("notes\n"), 0o600); err != nil {
			t.Fatalf("write fixture: %v", err)
		}
		opened := service.OpenPath(ctx, path, 0)
		state, _ := service.GetState(ctx)
		created := service.NewDocument(ctx, state.Snapshot.TabSetRevision)
		state, _ = service.GetState(ctx)
		service.CloseDocument(ctx, opened.DocumentID, state.Snapshot.TabSetRevision)
		state, _ = service.GetState(ctx)
		service.CloseDocument(ctx, created.Data.DocumentID, state.Snapshot.TabSetRevision)
		if got := sidebarVisible(t, service); got != shown {
			t.Fatalf("sidebar after open/new/close documents = %t, want unchanged %t", got, shown)
		}
	}
}
