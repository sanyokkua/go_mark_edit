package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/db"
)

func TestRecentItemsPromoteInMRUOrderAndPruneMissingEntries(t *testing.T) {
	database, err := db.Open(context.Background(), filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open settings database: %v", err)
	}
	defer func() { _ = database.Close() }()
	repository := NewSqliteRecentItemsRepository(database)
	paths := make([]string, 0, 11)
	for index := 0; index < 11; index++ {
		path := filepath.Join(t.TempDir(), "note.md")
		if err := os.WriteFile(path, []byte("note\n"), 0o640); err != nil {
			t.Fatalf("write recent fixture %d: %v", index, err)
		}
		paths = append(paths, path)
		if _, err := repository.Promote(context.Background(), path, "file"); err != nil {
			t.Fatalf("promote recent fixture %d: %v", index, err)
		}
	}
	entries, err := repository.List(context.Background())
	if err != nil {
		t.Fatalf("list recent files: %v", err)
	}
	if len(entries) != 10 || entries[0] != (apperr.RecentItem{Path: canonicalPath(t, paths[10]), Kind: "file"}) {
		t.Fatalf("recent entries = %v, want ten entries newest first", entries)
	}
	if err := os.Remove(paths[10]); err != nil {
		t.Fatalf("remove newest recent fixture: %v", err)
	}
	entries, err = repository.List(context.Background())
	if err != nil {
		t.Fatalf("list after pruning: %v", err)
	}
	if len(entries) != 9 || entries[0] != (apperr.RecentItem{Path: canonicalPath(t, paths[9]), Kind: "file"}) {
		t.Fatalf("pruned recent entries = %v, want stale newest removed lazily", entries)
	}
	folder := filepath.Join(t.TempDir(), "workspace")
	if err := os.Mkdir(folder, 0o750); err != nil {
		t.Fatalf("create recent folder: %v", err)
	}
	if _, err := repository.Promote(context.Background(), folder, "folder"); err != nil {
		t.Fatalf("promote recent folder: %v", err)
	}
	entries, err = repository.List(context.Background())
	if err != nil {
		t.Fatalf("list mixed recent items: %v", err)
	}
	if len(entries) != 10 || entries[0] != (apperr.RecentItem{Path: folder, Kind: "folder"}) {
		t.Fatalf("mixed recent entries = %v, want the folder newest and retained", entries)
	}
	if _, err := repository.Promote(context.Background(), folder, "folder"); err != nil {
		t.Fatalf("re-promote recent folder: %v", err)
	}
	entries, err = repository.List(context.Background())
	if err != nil {
		t.Fatalf("list deduplicated folder: %v", err)
	}
	if len(entries) != 10 || entries[0] != (apperr.RecentItem{Path: folder, Kind: "folder"}) {
		t.Fatalf("deduplicated recent entries = %v", entries)
	}
	if err := repository.Clear(context.Background()); err != nil {
		t.Fatalf("clear recent items: %v", err)
	}
	entries, err = repository.List(context.Background())
	if err != nil || len(entries) != 0 {
		t.Fatalf("cleared recent entries = %v, error=%v", entries, err)
	}
}

func TestOpeningFilesProjectsDurableRecentOrderAfterEachCommit(t *testing.T) {
	database, err := db.Open(context.Background(), filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open settings database: %v", err)
	}
	defer func() { _ = database.Close() }()
	service := NewAppModelServiceForHost(
		WithEmitter(&recordingEmitter{}),
		AppModelOption{RecentItemsRepository: NewSqliteRecentItemsRepository(database)},
	)
	first, _ := openAutosaveDocument(t, service, "first\n")
	second := filepath.Join(t.TempDir(), "second.md")
	if err := os.WriteFile(second, []byte("second\n"), 0o640); err != nil {
		t.Fatalf("write second fixture: %v", err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before second open: %v", err)
	}
	opened := service.OpenPath(context.Background(), second, state.Snapshot.TabSetRevision)
	if opened.DocumentID == "" {
		t.Fatalf("second OpenPath = %+v", opened)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after second open: %v", err)
	}
	if len(state.Snapshot.RecentItems) != 2 || state.Snapshot.RecentItems[0] != (apperr.RecentItem{Path: canonicalPath(t, second), Kind: "file"}) || state.Snapshot.RecentItems[1] != (apperr.RecentItem{Path: canonicalPath(t, first), Kind: "file"}) {
		t.Fatalf("projected recents = %v, want second then first", state.Snapshot.RecentItems)
	}
}

func TestReopenLastFileReadsTheFileAgainAfterClosingIt(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	path, documentID := openAutosaveDocument(t, service, "before close\n")
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before close: %v", err)
	}
	closed := service.CloseDocument(context.Background(), documentID, state.Snapshot.TabSetRevision)
	if closed.Error != nil || closed.Status != "closed" {
		t.Fatalf("CloseDocument = %+v, want closed", closed)
	}
	if err := os.WriteFile(path, []byte("changed while closed\n"), 0o640); err != nil {
		t.Fatalf("change closed file: %v", err)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before reopen: %v", err)
	}
	reopened := service.ReopenLastFile(context.Background(), state.Snapshot.TabSetRevision)
	if reopened.Status != "opened" || reopened.ActiveBuffer == nil || reopened.ActiveBuffer.Content != "changed while closed\n" {
		t.Fatalf("ReopenLastFile = %+v, want current disk content", reopened)
	}
}

func TestReopenLastPrefersClosedTabAndRestoresItsViewBeforeRecentFolder(t *testing.T) {
	ctx := context.Background()
	repository, service, _ := recentItemsFixture(t)
	path, documentID := openAutosaveDocument(t, service, "closed tab\n")
	folder := t.TempDir()
	if _, err := repository.Promote(ctx, folder, "folder"); err != nil {
		t.Fatal(err)
	}
	view := apperr.DocViewInput{
		EditorVisible:  true,
		PreviewVisible: false,
		Cursor:         apperr.CursorPosition{Line: 1, Column: 4},
		Selection: apperr.SelectionRange{
			Start: apperr.CursorPosition{Line: 1, Column: 4},
			End:   apperr.CursorPosition{Line: 1, Column: 4},
		},
	}
	if err := service.SetDocView(ctx, documentID, view); err != nil {
		t.Fatal(err)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	closed := service.CloseDocument(ctx, documentID, state.Snapshot.TabSetRevision)
	if closed.Status != apperr.TabTransitionClosed {
		t.Fatalf("close = %+v", closed)
	}
	state, err = service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	reopened := service.ReopenLastFile(ctx, state.Snapshot.TabSetRevision)
	if reopened.Status != apperr.OpenStatusOpened {
		t.Fatalf("reopen = %+v, want closed document ahead of recent folder", reopened)
	}
	state, err = service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	metadata := state.Snapshot.Documents[reopened.DocumentID]
	if metadata.Path != canonicalPath(t, path) || metadata.View.Cursor != view.Cursor || metadata.View.PreviewVisible != view.PreviewVisible {
		t.Fatalf("restored document = %+v", metadata)
	}
}

func canonicalPath(t *testing.T, path string) string {
	t.Helper()
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatalf("canonicalize %q: %v", path, err)
	}
	return canonical
}
