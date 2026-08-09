package appmodel

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestRecentFilesMRUPersistenceAndLazyPrune(t *testing.T) {
	database, err := db.Open(context.Background(), filepath.Join(t.TempDir(), "recents.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer func() { _ = database.Close() }()
	repository := NewSqliteRecentFilesRepository(database)

	paths := make([]string, 7)
	for index := range paths {
		paths[index] = filepath.Join(t.TempDir(), "file-"+string(rune('a'+index))+".md")
		if err := os.WriteFile(paths[index], []byte("content"), 0o600); err != nil {
			t.Fatalf("write fixture %d: %v", index, err)
		}
		canonical, err := file.CanonicalizeCandidateDocumentPath(paths[index])
		if err != nil {
			t.Fatalf("canonicalize fixture %d: %v", index, err)
		}
		paths[index] = canonical.Path
		if _, err := repository.Promote(context.Background(), paths[index]); err != nil {
			t.Fatalf("promote %d: %v", index, err)
		}
	}

	got, err := repository.List(context.Background())
	if err != nil {
		t.Fatalf("list recent files: %v", err)
	}
	want := append([]string(nil), paths[1:]...)
	for left, right := 0, len(want)-1; left < right; left, right = left+1, right-1 {
		want[left], want[right] = want[right], want[left]
	}
	if !reflect.DeepEqual(got, want[:6]) {
		t.Fatalf("recent files = %v, want %v", got, want[:6])
	}
	if err := os.Remove(paths[5]); err != nil {
		t.Fatalf("remove stale fixture: %v", err)
	}
	got, err = repository.List(context.Background())
	if err != nil {
		t.Fatalf("list after stale prune: %v", err)
	}
	if len(got) != 5 || got[0] != paths[6] || got[1] != paths[4] {
		t.Fatalf("recent files after lazy prune = %v, want newest surviving entries", got)
	}
}

func TestPromotionIsLatestValueTransaction(t *testing.T) {
	first, second := openTwoRecentFilesDatabases(t)
	firstRepository := NewSqliteRecentFilesRepository(first)
	secondRepository := NewSqliteRecentFilesRepository(second)
	paths := recentFixturePaths(t, "a.md", "b.md", "c.md")

	if _, err := firstRepository.Promote(context.Background(), paths[0]); err != nil {
		t.Fatalf("seed promotion: %v", err)
	}
	if _, err := secondRepository.Promote(context.Background(), paths[1]); err != nil {
		t.Fatalf("second promotion: %v", err)
	}
	if _, err := firstRepository.Promote(context.Background(), paths[2]); err != nil {
		t.Fatalf("latest promotion: %v", err)
	}
	got, err := secondRepository.List(context.Background())
	if err != nil {
		t.Fatalf("read latest list: %v", err)
	}
	if !reflect.DeepEqual(got, []string{paths[2], paths[1], paths[0]}) {
		t.Fatalf("latest committed list = %v, want c,b,a", got)
	}
}

func TestTwoInstancesInterleavedPromotionFollowsCommitOrder(t *testing.T) {
	first, second := openTwoRecentFilesDatabases(t)
	firstRepository := NewSqliteRecentFilesRepository(first)
	secondRepository := NewSqliteRecentFilesRepository(second)
	readComplete := make(chan struct{})
	releaseFirst := make(chan struct{})
	firstRepository.afterReadDecision = func() {
		close(readComplete)
		<-releaseFirst
	}

	result := make(chan error, 1)
	paths := recentFixturePaths(t, "first.md", "second.md")
	go func() {
		_, err := firstRepository.Promote(context.Background(), paths[0])
		result <- err
	}()
	<-readComplete
	if _, err := secondRepository.Promote(context.Background(), paths[1]); err != nil {
		t.Fatalf("second instance promotion: %v", err)
	}
	close(releaseFirst)
	if err := <-result; err != nil {
		t.Fatalf("first instance promotion: %v", err)
	}

	got, err := firstRepository.List(context.Background())
	if err != nil {
		t.Fatalf("read interleaved list: %v", err)
	}
	if !reflect.DeepEqual(got, paths) {
		t.Fatalf("interleaved recency = %v, want commit order first,second", got)
	}
}

func TestStaleSnapshotPromotionIsRejected(t *testing.T) {
	first, second := openTwoRecentFilesDatabases(t)
	firstRepository := NewSqliteRecentFilesRepository(first)
	secondRepository := NewSqliteRecentFilesRepository(second)
	readComplete := make(chan struct{})
	releaseFirst := make(chan struct{})
	firstRepository.afterReadDecision = func() {
		close(readComplete)
		<-releaseFirst
	}

	result := make(chan struct {
		paths []string
		err   error
	}, 1)
	paths := recentFixturePaths(t, "stale-reader.md", "committed-after-read.md")
	go func() {
		promoted, err := firstRepository.Promote(context.Background(), paths[0])
		result <- struct {
			paths []string
			err   error
		}{paths: promoted, err: err}
	}()
	<-readComplete
	if _, err := secondRepository.Promote(context.Background(), paths[1]); err != nil {
		t.Fatalf("committed promotion: %v", err)
	}
	close(releaseFirst)
	outcome := <-result
	if outcome.err != nil {
		t.Fatalf("stale reader promotion: %v", outcome.err)
	}
	if len(outcome.paths) < 2 || outcome.paths[0] != paths[0] || outcome.paths[1] != paths[1] {
		t.Fatalf("stale reader result = %v, want both latest values", outcome.paths)
	}
}

func recentFixturePaths(t *testing.T, names ...string) []string {
	t.Helper()
	root := t.TempDir()
	paths := make([]string, len(names))
	for index, name := range names {
		paths[index] = filepath.Join(root, name)
		if err := os.WriteFile(paths[index], []byte(name+"\n"), 0o600); err != nil {
			t.Fatalf("write recent fixture %s: %v", name, err)
		}
		canonical, err := file.CanonicalizeCandidateDocumentPath(paths[index])
		if err != nil {
			t.Fatalf("canonicalize recent fixture %s: %v", name, err)
		}
		paths[index] = canonical.Path
	}
	return paths
}

func TestPromotionFailureEmitsPersistenceWarningWithoutRollback(t *testing.T) {
	path := filepath.Join(t.TempDir(), "persisted.md")
	if err := os.WriteFile(path, []byte("before\n"), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	emitter := &recordingEmitter{}
	service := NewEmptyAppModelService(emitter)
	service.SetRecentFilesRepository(failingRecentFilesRepository{err: errors.New("database is locked")})

	opened := service.OpenPath(context.Background(), path, 0)
	if opened.Status != apperr.OpenStatusOpened || opened.ActiveBuffer == nil {
		t.Fatalf("OpenPath = %+v, want successful open", opened)
	}
	if opened.Error == nil || opened.Error.Category != apperr.ClassifiedPersistenceWarning {
		t.Fatalf("OpenPath warning = %+v, want one persistence-warning", opened.Error)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("state after failed promotion: %v", err)
	}
	if len(state.Snapshot.RecentFiles) != 0 {
		t.Fatalf("failed promotion changed recent projection = %v", state.Snapshot.RecentFiles)
	}

	if err := service.UpdateBuffer(context.Background(), opened.DocumentID, "after\n"); err != nil {
		t.Fatalf("update buffer: %v", err)
	}
	saved := service.Save(context.Background(), opened.DocumentID, 1, "")
	if saved.Status != apperr.WriteStatusCommitted || saved.Error == nil || saved.Error.Category != apperr.ClassifiedPersistenceWarning {
		t.Fatalf("Save = %+v, want committed write with one warning", saved)
	}
	bytes, err := os.ReadFile(path)
	if err != nil || string(bytes) != "after\n" {
		t.Fatalf("saved bytes = %q/%v, want committed file write", bytes, err)
	}
}

func TestAutosaveAndReloadDoNotChangeRecency(t *testing.T) {
	clock := &fakeAutosaveClock{}
	repository := &recordingRecentFilesRepository{paths: []string{"/workspace/seed.md"}}
	service := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, clock)
	service.SetRecentFilesRepository(repository)

	firstPath := filepath.Join(t.TempDir(), "first.md")
	secondPath := filepath.Join(t.TempDir(), "second.md")
	if err := os.WriteFile(firstPath, []byte("first\n"), 0o600); err != nil {
		t.Fatalf("write first fixture: %v", err)
	}
	if err := os.WriteFile(secondPath, []byte("second\n"), 0o600); err != nil {
		t.Fatalf("write second fixture: %v", err)
	}
	first := service.OpenPath(context.Background(), firstPath, 0)
	state, _ := service.GetState(context.Background())
	second := service.OpenPath(context.Background(), secondPath, state.Snapshot.TabSetRevision)
	if first.Error != nil || second.Error != nil {
		t.Fatalf("open fixtures = %+v / %+v", first.Error, second.Error)
	}
	before, err := repository.List(context.Background())
	if err != nil {
		t.Fatalf("read recency before non-promoting actions: %v", err)
	}
	if err := service.UpdateBuffer(context.Background(), first.DocumentID, "edited\n"); err != nil {
		t.Fatalf("edit first document: %v", err)
	}
	clock.FireNext()
	if err := os.WriteFile(firstPath, []byte("reloaded\n"), 0o600); err != nil {
		t.Fatalf("rewrite first fixture: %v", err)
	}
	version, err := file.CurrentDiskVersion(firstPath)
	if err != nil {
		t.Fatalf("current disk version: %v", err)
	}
	reloaded := service.ReloadFromDisk(context.Background(), first.DocumentID, 1, apperr.DiskVersion{
		Exists:           version.Exists,
		Size:             version.Size,
		ModifiedUnixNano: version.ModifiedUnixNano,
		Mode:             uint32(version.Mode),
		FileIdentity:     version.FileIdentity,
	})
	if reloaded.Error != nil {
		t.Fatalf("ReloadFromDisk = %+v", reloaded)
	}
	after, err := repository.List(context.Background())
	if err != nil {
		t.Fatalf("read recency after non-promoting actions: %v", err)
	}
	if !reflect.DeepEqual(after, before) {
		t.Fatalf("autosave/reload changed recency: before=%v after=%v", before, after)
	}
}

func TestRecentlyClosedHistory(t *testing.T) {
	service := NewEmptyAppModelService(&recordingEmitter{})
	for index := 0; index < 41; index++ {
		path := filepath.Join(t.TempDir(), "closed-"+string(rune('a'+index%26))+"-"+string(rune('0'+index/26))+".md")
		if err := os.WriteFile(path, []byte("closed\n"), 0o600); err != nil {
			t.Fatalf("write closed fixture %d: %v", index, err)
		}
		state, err := service.GetState(context.Background())
		if err != nil {
			t.Fatalf("state before open %d: %v", index, err)
		}
		opened := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
		if opened.Error != nil {
			t.Fatalf("open closed fixture %d: %+v", index, opened.Error)
		}
		state, _ = service.GetState(context.Background())
		closed := service.CloseDocument(context.Background(), opened.DocumentID, state.Snapshot.TabSetRevision)
		if closed.Error != nil {
			t.Fatalf("close closed fixture %d: %+v", index, closed.Error)
		}
	}
	if len(service.state.recentlyClosed) != 40 {
		t.Fatalf("recently closed length = %d, want 40", len(service.state.recentlyClosed))
	}
	if service.state.recentlyClosed[0].path == "" || service.state.recentlyClosed[0].identity == "" {
		t.Fatalf("newest closed entry = %+v, want canonical path and identity", service.state.recentlyClosed[0])
	}
}

func TestReopenLastFileLifecycle(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "reopen.md")
	if err := os.WriteFile(path, []byte("original\n"), 0o600); err != nil {
		t.Fatalf("write reopen fixture: %v", err)
	}
	service := NewEmptyAppModelService(&recordingEmitter{})
	opened := service.OpenPath(context.Background(), path, 0)
	if opened.Error != nil {
		t.Fatalf("open = %+v", opened.Error)
	}
	oldID := opened.DocumentID
	state, _ := service.GetState(context.Background())
	closed := service.CloseDocument(context.Background(), oldID, state.Snapshot.TabSetRevision)
	if closed.Error != nil {
		t.Fatalf("close = %+v", closed.Error)
	}
	if err := os.WriteFile(path, []byte("current\n"), 0o600); err != nil {
		t.Fatalf("rewrite reopen fixture: %v", err)
	}
	state, _ = service.GetState(context.Background())
	reopened := service.ReopenLastFile(context.Background(), state.Snapshot.TabSetRevision)
	if reopened.Error != nil || reopened.ActiveBuffer == nil || reopened.DocumentID == oldID {
		t.Fatalf("reopen = %+v, want fresh identity and active buffer", reopened)
	}
	if reopened.ActiveBuffer.Content != "current\n" {
		t.Fatalf("reopened content = %q, want current disk content", reopened.ActiveBuffer.Content)
	}
	if len(service.state.recentlyClosed) != 0 || service.state.canReopenLastFile {
		t.Fatalf("reopen history = %v, canReopen=%t; want consumed", service.state.recentlyClosed, service.state.canReopenLastFile)
	}
}

type failingRecentFilesRepository struct{ err error }

func (repository failingRecentFilesRepository) List(context.Context) ([]string, error) {
	return nil, repository.err
}

func (repository failingRecentFilesRepository) Promote(context.Context, string) ([]string, error) {
	return nil, repository.err
}

func (repository failingRecentFilesRepository) Remove(context.Context, string) ([]string, error) {
	return nil, repository.err
}

type recordingRecentFilesRepository struct{ paths []string }

func (repository *recordingRecentFilesRepository) List(context.Context) ([]string, error) {
	return append([]string(nil), repository.paths...), nil
}

func (repository *recordingRecentFilesRepository) Promote(_ context.Context, path string) ([]string, error) {
	repository.paths = promoteRecentFile(repository.paths, path)
	return append([]string(nil), repository.paths...), nil
}

func (repository *recordingRecentFilesRepository) Remove(_ context.Context, path string) ([]string, error) {
	filtered := repository.paths[:0]
	for _, candidate := range repository.paths {
		if candidate != path {
			filtered = append(filtered, candidate)
		}
	}
	repository.paths = filtered
	return append([]string(nil), repository.paths...), nil
}
