package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/db"
)

func TestRecentFilesPromoteInMRUOrderAndPruneMissingEntries(t *testing.T) {
	database, err := db.Open(context.Background(), filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatalf("open settings database: %v", err)
	}
	defer func() { _ = database.Close() }()
	repository := NewSqliteRecentFilesRepository(database)
	paths := make([]string, 0, 7)
	for index := 0; index < 7; index++ {
		path := filepath.Join(t.TempDir(), "note.md")
		if err := os.WriteFile(path, []byte("note\n"), 0o640); err != nil {
			t.Fatalf("write recent fixture %d: %v", index, err)
		}
		paths = append(paths, path)
		if _, err := repository.Promote(context.Background(), path); err != nil {
			t.Fatalf("promote recent fixture %d: %v", index, err)
		}
	}
	entries, err := repository.List(context.Background())
	if err != nil {
		t.Fatalf("list recent files: %v", err)
	}
	if len(entries) != 6 || entries[0] != canonicalPath(t, paths[6]) {
		t.Fatalf("recent entries = %v, want six entries newest first", entries)
	}
	if err := os.Remove(paths[6]); err != nil {
		t.Fatalf("remove newest recent fixture: %v", err)
	}
	entries, err = repository.List(context.Background())
	if err != nil {
		t.Fatalf("list after pruning: %v", err)
	}
	if len(entries) != 5 || entries[0] != canonicalPath(t, paths[5]) {
		t.Fatalf("pruned recent entries = %v, want stale newest removed lazily", entries)
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
		AppModelOption{RecentFilesRepository: NewSqliteRecentFilesRepository(database)},
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
	if len(state.Snapshot.RecentFiles) != 2 || state.Snapshot.RecentFiles[0] != canonicalPath(t, second) || state.Snapshot.RecentFiles[1] != canonicalPath(t, first) {
		t.Fatalf("projected recents = %v, want second then first", state.Snapshot.RecentFiles)
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

func canonicalPath(t *testing.T, path string) string {
	t.Helper()
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatalf("canonicalize %q: %v", path, err)
	}
	return canonical
}
