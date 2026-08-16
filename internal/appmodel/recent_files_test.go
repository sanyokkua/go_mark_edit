package appmodel

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/db"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// Proves: FR-FT-039 (partial — the cap, dedupe, order and prune at the
// repository; promotion on explicit Save and Save As is proved by
// TestExplicitSaveAndSaveAsPromoteRecency)
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

// Proves: FR-FT-039 — "Every successful canonical Open/focus, explicit Save, or
// Save As MUST promote its path". Open promotion is proved by
// TestPromotionFailureEmitsPersistenceWarningWithoutRollback and the
// non-promoters by TestAutosaveAndReloadDoNotChangeRecency; the two write
// promoters had no covering body until T157.
//
// This is exactly the shape of the omission TestAutosaveAndReloadDoNotChangeRecency
// guards from the other side: `save.go:365` decides to promote from the write's
// SaveOrigin, so dropping either origin from that predicate is a one-token edit
// that no assertion would have noticed, and Save would quietly stop being a
// recency event.
func TestExplicitSaveAndSaveAsPromoteRecency(t *testing.T) {
	repository := &recordingRecentFilesRepository{}
	service := NewAppModelService(&recordingEmitter{})
	service.SetAutosaveEnabled(false)
	service.SetRecentFilesRepository(repository)

	root := t.TempDir()
	firstPath := filepath.Join(root, "first.md")
	secondPath := filepath.Join(root, "second.md")
	for _, path := range []string{firstPath, secondPath} {
		if err := os.WriteFile(path, []byte("base\n"), 0o600); err != nil {
			t.Fatalf("write fixture %s: %v", path, err)
		}
	}
	first := service.OpenPath(context.Background(), firstPath, 0)
	if first.Error != nil {
		t.Fatalf("open first = %+v", first.Error)
	}
	second := service.OpenPath(context.Background(), secondPath, serviceTabRevision(t, service))
	if second.Error != nil {
		t.Fatalf("open second = %+v", second.Error)
	}
	afterOpens, err := repository.List(context.Background())
	if err != nil {
		t.Fatalf("list after opens: %v", err)
	}
	if len(afterOpens) != 2 || filepath.Base(afterOpens[0]) != "second.md" {
		t.Fatalf("recency after opens = %v, want the second file newest", afterOpens)
	}

	// An explicit Save of the older document must move it back to the front.
	if err := service.UpdateBuffer(context.Background(), first.DocumentID, "edited\n"); err != nil {
		t.Fatalf("edit the first document: %v", err)
	}
	if saved := service.Save(context.Background(), first.DocumentID, 1, ""); saved.Status != apperr.WriteStatusCommitted {
		t.Fatalf("explicit Save = %+v", saved)
	}
	afterSave, err := repository.List(context.Background())
	if err != nil {
		t.Fatalf("list after the explicit Save: %v", err)
	}
	if len(afterSave) != 2 || filepath.Base(afterSave[0]) != "first.md" || filepath.Base(afterSave[1]) != "second.md" {
		t.Fatalf("recency after the explicit Save = %v, want first.md promoted over second.md", afterSave)
	}

	// Save As promotes the *adopted* path, and the source path keeps its place.
	adopted := filepath.Join(root, "adopted.md")
	service.SetDocumentSaveDialog(&saveDialogFixture{path: adopted, confirm: true})
	if err := service.UpdateBuffer(context.Background(), second.DocumentID, "edited too\n"); err != nil {
		t.Fatalf("edit the second document: %v", err)
	}
	if savedAs := service.SaveAs(context.Background(), second.DocumentID, 1, ""); savedAs.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save As = %+v", savedAs)
	}
	afterSaveAs, err := repository.List(context.Background())
	if err != nil {
		t.Fatalf("list after Save As: %v", err)
	}
	if len(afterSaveAs) != 3 || filepath.Base(afterSaveAs[0]) != "adopted.md" {
		t.Fatalf("recency after Save As = %v, want the adopted path newest", afterSaveAs)
	}
	if filepath.Base(afterSaveAs[1]) != "first.md" || filepath.Base(afterSaveAs[2]) != "second.md" {
		t.Fatalf("recency after Save As = %v, want the earlier order preserved beneath the adopted path", afterSaveAs)
	}
}

// Proves: FR-FT-028 (partial — the 40-entry newest-first cap; "Untitled
// documents and source content MUST NOT be retained" is proved by
// TestRecentlyClosedHistoryRetainsNoUntitledDocumentAndNoSourceContent)
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

// Proves: FR-FT-028 — "Untitled documents and source content MUST NOT be
// retained" in the recently-closed history. The cap and ordering are proved by
// the sibling above; this clause had no covering body until T157.
//
// It is a privacy and correctness rule at once. Reopen last file re-reads from
// disk (TestReopenLastFileLifecycle proves it returns the *current* bytes), so
// retaining the source would keep a copy of every closed document's text alive
// in a window's memory for no purpose, and an untitled entry would offer a
// Reopen with no file behind it.
//
// The content half is asserted reflectively rather than against the three
// fields the entry happens to have today, so adding a `content` field to
// recentlyClosedDocument fails this test instead of silently passing it.
func TestRecentlyClosedHistoryRetainsNoUntitledDocumentAndNoSourceContent(t *testing.T) {
	const marker = "SOURCE-CONTENT-MARKER-a1b2c3\n"

	service := NewAppModelService(&recordingEmitter{})
	service.SetAutosaveEnabled(false)

	// An untitled document, closed while empty so no close plan is needed.
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before New: %v", err)
	}
	untitled := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
	if untitled.Data == nil {
		t.Fatalf("NewDocument = %+v", untitled)
	}
	closed := service.CloseDocument(context.Background(), untitled.Data.DocumentID, serviceTabRevision(t, service))
	if closed.Error != nil {
		t.Fatalf("close the untitled document = %+v", closed.Error)
	}
	service.mu.RLock()
	untitledEntries := len(service.state.recentlyClosed)
	canReopen := service.state.canReopenLastFile
	service.mu.RUnlock()
	if untitledEntries != 0 || canReopen {
		t.Fatalf("closing an untitled document left %d recently-closed entries (canReopen=%t), want none", untitledEntries, canReopen)
	}

	// A path-backed document whose buffer holds a distinctive marker.
	path := filepath.Join(t.TempDir(), "retained.md")
	if err := os.WriteFile(path, []byte(marker), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	opened := service.OpenPath(context.Background(), path, serviceTabRevision(t, service))
	if opened.Error != nil {
		t.Fatalf("open = %+v", opened.Error)
	}
	if opened.ActiveBuffer == nil || opened.ActiveBuffer.Content != marker {
		t.Fatalf("opened buffer = %+v, want the marker content in memory while the document is open", opened.ActiveBuffer)
	}
	if closed := service.CloseDocument(context.Background(), opened.DocumentID, serviceTabRevision(t, service)); closed.Error != nil {
		t.Fatalf("close = %+v", closed.Error)
	}

	service.mu.RLock()
	entries := append([]recentlyClosedDocument(nil), service.state.recentlyClosed...)
	service.mu.RUnlock()
	if len(entries) != 1 {
		t.Fatalf("recently-closed entries = %d, want the one path-backed close", len(entries))
	}
	if filepath.Base(entries[0].path) != "retained.md" {
		t.Fatalf("retained entry = %+v, want the closed document's canonical path", entries[0])
	}
	if found := stringFieldsContaining(reflect.ValueOf(entries[0]), "SOURCE-CONTENT-MARKER"); len(found) != 0 {
		t.Fatalf("the recently-closed entry retained the document's source content in %v", found)
	}
}

// stringFieldsContaining walks a struct and reports the dotted field paths of
// every string that contains needle.
func stringFieldsContaining(value reflect.Value, needle string) []string {
	var found []string
	var walk func(reflect.Value, string)
	walk = func(current reflect.Value, path string) {
		switch current.Kind() {
		case reflect.String:
			if strings.Contains(current.String(), needle) {
				found = append(found, path)
			}
		case reflect.Struct:
			for index := 0; index < current.NumField(); index++ {
				name := current.Type().Field(index).Name
				if path != "" {
					name = path + "." + name
				}
				walk(current.Field(index), name)
			}
		case reflect.Pointer, reflect.Interface:
			if !current.IsNil() {
				walk(current.Elem(), path)
			}
		case reflect.Slice, reflect.Array:
			for index := 0; index < current.Len(); index++ {
				walk(current.Index(index), fmt.Sprintf("%s[%d]", path, index))
			}
		case reflect.Map:
			for _, key := range current.MapKeys() {
				walk(current.MapIndex(key), fmt.Sprintf("%s[%v]", path, key))
			}
		default:
		}
	}
	walk(value, "")
	return found
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

type recordingRecentFilesRepository struct{ paths []string }

func (repository *recordingRecentFilesRepository) List(context.Context) ([]string, error) {
	return append([]string(nil), repository.paths...), nil
}

func (repository *recordingRecentFilesRepository) Promote(_ context.Context, path string) ([]string, error) {
	repository.paths = promoteRecentFile(repository.paths, path)
	return append([]string(nil), repository.paths...), nil
}
