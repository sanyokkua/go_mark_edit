package appmodel_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/sanyokkua/go_mark_edit/internal/db"
)

func recentItemsFixture(t *testing.T) (*SqliteRecentItemsRepository, *AppModelService, *recordingEmitter) {
	t.Helper()
	database, err := db.Open(context.Background(), filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	repository := NewSqliteRecentItemsRepository(database)
	emitter := &recordingEmitter{}
	service := NewAppModelServiceForHost(WithEmitter(emitter), AppModelOption{RecentItemsRepository: repository})
	return repository, service, emitter
}

func TestRefreshingRecentItemsPublishesOnlyChangedCrossWindowHistoryAndPrunesMissingPaths(t *testing.T) {
	ctx := context.Background()
	repository, service, emitter := recentItemsFixture(t)
	if got := service.RefreshRecentItems(ctx); got.Error != nil || len(got.RecentItems) != 0 {
		t.Fatalf("initial refresh = %+v", got)
	}
	path := filepath.Join(t.TempDir(), "other-window.md")
	if err := os.WriteFile(path, []byte("content"), 0o600); err != nil {
		t.Fatal(err)
	}
	otherWindow := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{RecentItemsRepository: repository})
	otherState, err := otherWindow.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if opened := otherWindow.OpenPath(ctx, path, otherState.Snapshot.TabSetRevision); opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("other window open = %+v", opened)
	}
	before := emitter.Count()
	got := service.RefreshRecentItems(ctx)
	if got.Error != nil || len(got.RecentItems) != 1 || got.RecentItems[0].Path != canonicalPath(t, path) {
		t.Fatalf("refreshed = %+v", got)
	}
	if emitter.Count() != before+1 {
		t.Fatalf("patch count = %d, want %d", emitter.Count(), before+1)
	}
	patch := emitter.Patches()[emitter.Count()-1]
	if len(patch.RecentItems) != 1 || patch.CanReopenLastFile == nil || !*patch.CanReopenLastFile {
		t.Fatalf("refresh patch = %+v", patch)
	}
	before = emitter.Count()
	service.RefreshRecentItems(ctx)
	if emitter.Count() != before {
		t.Fatalf("unchanged refresh published %d patches", emitter.Count()-before)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	got = service.RefreshRecentItems(ctx)
	if got.Error != nil || len(got.RecentItems) != 0 {
		t.Fatalf("pruned refresh = %+v", got)
	}
	patch = emitter.Patches()[emitter.Count()-1]
	if patch.RecentItems == nil || patch.CanReopenLastFile == nil || *patch.CanReopenLastFile {
		t.Fatalf("prune patch = %+v", patch)
	}
	assertRecentItemsWireIsEmpty(t, patch)
	stored, err := repository.List(ctx)
	if err != nil || len(stored) != 0 {
		t.Fatalf("stored = %+v, %v", stored, err)
	}
}

func TestClearingRecentItemsPersistsEmptyListAndRecomputesReopenAvailability(t *testing.T) {
	ctx := context.Background()
	repository, service, emitter := recentItemsFixture(t)
	path := filepath.Join(t.TempDir(), "recent.md")
	if err := os.WriteFile(path, []byte("content"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Promote(ctx, path, "file"); err != nil {
		t.Fatal(err)
	}
	service.RefreshRecentItems(ctx)
	handler := NewAppModelHandler(service, nil, func() context.Context { return ctx })
	before := emitter.Count()
	if got := handler.ClearRecentItems(bridge.Request{ID: "clear-recents"}); got.Error != nil {
		t.Fatalf("clear = %+v", got)
	}
	stored, err := repository.List(ctx)
	if err != nil || len(stored) != 0 {
		t.Fatalf("stored = %+v, %v", stored, err)
	}
	if emitter.Count() != before+1 {
		t.Fatalf("patch count = %d, want %d", emitter.Count(), before+1)
	}
	patch := emitter.Patches()[emitter.Count()-1]
	if patch.RecentItems == nil || patch.CanReopenLastFile == nil || *patch.CanReopenLastFile {
		t.Fatalf("clear patch = %+v", patch)
	}
	assertRecentItemsWireIsEmpty(t, patch)
}

func assertRecentItemsWireIsEmpty(t *testing.T, patch apperr.AppStatePatch) {
	t.Helper()
	data, err := json.Marshal(patch)
	if err != nil {
		t.Fatal(err)
	}
	var wire map[string]json.RawMessage
	if err := json.Unmarshal(data, &wire); err != nil {
		t.Fatal(err)
	}
	if string(wire["recentItems"]) != "[]" {
		t.Fatalf("recentItems on event wire = %s, want []", wire["recentItems"])
	}
	withoutRecentItems, err := json.Marshal(apperr.AppStatePatch{Revision: patch.Revision})
	if err != nil {
		t.Fatal(err)
	}
	wire = nil
	if err := json.Unmarshal(withoutRecentItems, &wire); err != nil {
		t.Fatal(err)
	}
	if _, exists := wire["recentItems"]; exists {
		t.Fatalf("unrelated event unexpectedly updates Recent Items: %s", withoutRecentItems)
	}
}

func TestClearingRecentItemsKeepsReopenAvailableForAClosedTab(t *testing.T) {
	ctx := context.Background()
	_, service, emitter := recentItemsFixture(t)
	_, documentID := openAutosaveDocument(t, service, "to close\n")
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if closed := service.CloseDocument(ctx, documentID, state.Snapshot.TabSetRevision); closed.Status != apperr.TabTransitionClosed {
		t.Fatalf("close = %+v", closed)
	}
	if cleared := service.ClearRecentItems(ctx); cleared.Error != nil {
		t.Fatalf("clear = %+v", cleared)
	}
	patch := emitter.Patches()[emitter.Count()-1]
	if patch.RecentItems == nil || patch.CanReopenLastFile == nil || !*patch.CanReopenLastFile {
		t.Fatalf("clear with closed tab patch = %+v", patch)
	}
}

func TestRefreshingRecentItemsReportsFailedPatchDeliveryAndCanRetry(t *testing.T) {
	ctx := context.Background()
	repository, _, _ := recentItemsFixture(t)
	path := filepath.Join(t.TempDir(), "recent.md")
	if err := os.WriteFile(path, []byte("content"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Promote(ctx, path, "file"); err != nil {
		t.Fatal(err)
	}
	emitter := &workspaceToggleEmitter{fail: true}
	service := NewAppModelServiceForHost(WithEmitter(emitter), AppModelOption{RecentItemsRepository: repository})
	if got := service.RefreshRecentItems(ctx); got.Error == nil || got.Category != apperr.ClassifiedIOFailure {
		t.Fatalf("failed refresh = %+v, want delivery failure", got)
	}
	emitter.fail = false
	if got := service.RefreshRecentItems(ctx); got.Error != nil || len(got.RecentItems) != 1 || len(emitter.patches) != 1 {
		t.Fatalf("retry refresh = %+v, patches=%d", got, len(emitter.patches))
	}
}

func TestClearingRecentItemsReportsFailedPatchAfterDurableClear(t *testing.T) {
	ctx := context.Background()
	repository, _, _ := recentItemsFixture(t)
	path := filepath.Join(t.TempDir(), "recent.md")
	if err := os.WriteFile(path, []byte("content"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Promote(ctx, path, "file"); err != nil {
		t.Fatal(err)
	}
	emitter := &workspaceToggleEmitter{}
	service := NewAppModelServiceForHost(WithEmitter(emitter), AppModelOption{RecentItemsRepository: repository})
	if _, err := service.GetState(ctx); err != nil {
		t.Fatal(err)
	}
	emitter.fail = true
	if got := service.ClearRecentItems(ctx); got.Error == nil || got.Category != apperr.ClassifiedIOFailure {
		t.Fatalf("failed clear = %+v, want delivery failure", got)
	}
	stored, err := repository.List(ctx)
	if err != nil || len(stored) != 0 {
		t.Fatalf("durable clear = %+v, %v", stored, err)
	}
	emitter.fail = false
	if got := service.RefreshRecentItems(ctx); got.Error != nil || len(got.RecentItems) != 0 || len(emitter.patches) != 1 || emitter.patches[0].RecentItems == nil {
		t.Fatalf("resync after clear = %+v, patches=%+v", got, emitter.patches)
	}
}

func TestReopenLastFallsBackToRecentFileWhenNoTabWasClosed(t *testing.T) {
	ctx := context.Background()
	repository, service, _ := recentItemsFixture(t)
	path := filepath.Join(t.TempDir(), "recent.md")
	if err := os.WriteFile(path, []byte("from disk"), 0o600); err != nil {
		t.Fatal(err)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	opened := service.OpenPath(ctx, path, state.Snapshot.TabSetRevision)
	if opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("open = %+v", opened)
	}
	state, err = service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !state.Snapshot.CanReopenLastFile {
		t.Fatal("first file did not enable Reopen Last")
	}
	fresh := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{RecentItemsRepository: repository})
	state, err = fresh.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !state.Snapshot.CanReopenLastFile {
		t.Fatal("fresh session with recent file did not enable Reopen Last")
	}
	reopened := fresh.ReopenLastFile(ctx, state.Snapshot.TabSetRevision)
	if reopened.Status != apperr.OpenStatusOpened || reopened.ActiveBuffer == nil || reopened.ActiveBuffer.Content != "from disk" {
		t.Fatalf("reopen = %+v", reopened)
	}
}

func TestReopenLastReturnsFolderTargetWithoutOpeningWorkspace(t *testing.T) {
	ctx := context.Background()
	repository, service, emitter := recentItemsFixture(t)
	folder := t.TempDir()
	if _, err := repository.Promote(ctx, folder, "folder"); err != nil {
		t.Fatal(err)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !state.Snapshot.CanReopenLastFile {
		t.Fatal("recent folder did not enable Reopen Last")
	}
	before := emitter.Count()
	reopened := service.ReopenLastFile(ctx, state.Snapshot.TabSetRevision)
	if reopened.Status != apperr.OpenStatusFolderTarget || reopened.Path != state.Snapshot.RecentItems[0].Path {
		t.Fatalf("reopen = %+v", reopened)
	}
	if emitter.Count() != before {
		t.Fatalf("folder target published %d patches", emitter.Count()-before)
	}
	state, err = service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if state.Snapshot.Workspace != nil {
		t.Fatalf("folder target opened workspace %+v", state.Snapshot.Workspace)
	}
}

func TestReopenLastRefusesMissingRecentFileAndEmptyHistory(t *testing.T) {
	ctx := context.Background()
	repository, service, _ := recentItemsFixture(t)
	empty, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := service.ReopenLastFile(ctx, empty.Snapshot.TabSetRevision); got.Status != apperr.OpenStatusRefused || got.Error == nil || got.Error.Category != apperr.ClassifiedNotFound {
		t.Fatalf("empty = %+v", got)
	}
	path := filepath.Join(t.TempDir(), "stale.md")
	if err := os.WriteFile(path, []byte("content"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.Promote(ctx, path, "file"); err != nil {
		t.Fatal(err)
	}
	service.RefreshRecentItems(ctx)
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	got := service.ReopenLastFile(ctx, state.Snapshot.TabSetRevision)
	if got.Status != apperr.OpenStatusRefused || got.Error == nil || got.Error.Category != apperr.ClassifiedNotFound {
		t.Fatalf("missing = %+v", got)
	}
}
