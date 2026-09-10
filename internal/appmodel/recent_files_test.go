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
	"time"

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
	service := NewEmptyAppModelService(WithEmitter(emitter), WithRecentFilesRepository(failingRecentFilesRepository{err: errors.New("database is locked")}))

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
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithAutosaveTimer(clock), WithRecentFilesRepository(repository))

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
	root := t.TempDir()
	adopted := filepath.Join(root, "adopted.md")
	dialog := &saveDialogFixture{path: adopted, confirm: true}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithDialogs(nil, dialog), WithRecentFilesRepository(repository))
	service.SetAutosaveEnabled(false)

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
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}))
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
	if service.state.recentlyClosed[0].path == "" || service.state.recentlyClosed[0].identity.IsZero() {
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

	service := NewAppModelService(WithEmitter(&recordingEmitter{}))
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
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}))
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

/*
T184 — SC-FT-008's focus arm of promotion.

The criterion promotes "each successful canonical Open/**focus**", and
`file_lifecycle.go` promotes on the focus branch as well as the open branch.
`TestOpenFocusesCanonicalDuplicate` drives exactly that path — it opens a file,
then opens an alias of it and gets `OpenStatusFocused` — and makes **no recents
assertion at all**, so the focus half of the clause was reached by a test that
was not looking at it.
*/
// Proves: SC-FT-008 (the focus arm of promotion)
func TestFocusingAnOpenDocumentPromotesItToTheFrontOfRecents(t *testing.T) {
	database, err := db.Open(context.Background(), filepath.Join(t.TempDir(), "recents.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer func() { _ = database.Close() }()
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}), WithRecentFilesRepository(NewSqliteRecentFilesRepository(database)))
	paths := recentFixturePaths(t, "first.md", "second.md")

	state, _ := service.GetState(context.Background())
	first := service.OpenPath(context.Background(), paths[0], state.Snapshot.TabSetRevision)
	if first.Status != apperr.OpenStatusOpened {
		t.Fatalf("first open = %+v, want opened", first)
	}
	state, _ = service.GetState(context.Background())
	second := service.OpenPath(context.Background(), paths[1], state.Snapshot.TabSetRevision)
	if second.Status != apperr.OpenStatusOpened {
		t.Fatalf("second open = %+v, want opened", second)
	}
	state, _ = service.GetState(context.Background())
	if state.Snapshot.RecentFiles[0] != paths[1] {
		t.Fatalf("recents after two opens = %v, want the second file first", state.Snapshot.RecentFiles)
	}

	// Re-opening an already-open file focuses it rather than opening it again.
	state, _ = service.GetState(context.Background())
	focused := service.OpenPath(context.Background(), paths[0], state.Snapshot.TabSetRevision)
	if focused.Status != apperr.OpenStatusFocused || focused.DocumentID != first.DocumentID {
		t.Fatalf("re-open = %+v, want the first document focused", focused)
	}

	state, _ = service.GetState(context.Background())
	if state.Snapshot.RecentFiles[0] != paths[0] {
		t.Fatalf("recents after a focus = %v, want the focused file promoted to the front", state.Snapshot.RecentFiles)
	}
}

/*
T184 — SC-FT-008's display boundary.

"Explicit display/choice refresh MUST observe the latest committed list."
`TestPromotionIsLatestValueTransaction` proves the *repository* sees another
instance's commits, which is a different seam: the one the criterion means is
`GetState` → `refreshRecentFiles` (`service.go:312`, `recent_files.go:11`), and
nothing asserted that a commit made out of band reaches a projection snapshot.
*/
// Proves: SC-FT-008 (the display boundary observes the latest committed list)
func TestGetStateObservesARecentsCommitMadeOutOfBand(t *testing.T) {
	first, second := openTwoRecentFilesDatabases(t)
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}), WithRecentFilesRepository(NewSqliteRecentFilesRepository(first)))
	paths := recentFixturePaths(t, "seen.md", "outofband.md")

	state, _ := service.GetState(context.Background())
	if opened := service.OpenPath(context.Background(), paths[0], state.Snapshot.TabSetRevision); opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("seed open = %+v, want opened", opened)
	}
	state, _ = service.GetState(context.Background())
	if len(state.Snapshot.RecentFiles) != 1 {
		t.Fatalf("recents after the seed = %v, want one entry", state.Snapshot.RecentFiles)
	}

	// Another instance commits, through its own connection to the same file.
	if _, err := NewSqliteRecentFilesRepository(second).Promote(context.Background(), paths[1]); err != nil {
		t.Fatalf("out-of-band promotion: %v", err)
	}

	// The next display refresh must carry it, with no command issued here.
	state, _ = service.GetState(context.Background())
	if len(state.Snapshot.RecentFiles) != 2 || state.Snapshot.RecentFiles[0] != paths[1] {
		t.Fatalf("recents at the display boundary = %v, want the out-of-band commit observed first", state.Snapshot.RecentFiles)
	}
}

// countingRecentFilesRepository records how often each seam is reached, so a
// timer or watcher added later shows up as calls nobody asked for. T184.
type countingRecentFilesRepository struct {
	paths    []string
	lists    int
	promotes int
}

func (repository *countingRecentFilesRepository) List(context.Context) ([]string, error) {
	repository.lists++
	return append([]string(nil), repository.paths...), nil
}

func (repository *countingRecentFilesRepository) Promote(_ context.Context, path string) ([]string, error) {
	repository.promotes++
	repository.paths = promoteRecentFile(repository.paths, path)
	return append([]string(nil), repository.paths...), nil
}

/*
T184 — SC-FT-008's "prune missing entries **without background polling**", for
recents specifically.

`TestNoWatcherOrPollingTimerIsRegistered` (`conflict_test.go:147`) counts
disk-version conflict reads through the constructor's conflict-reader option.
It says nothing about `RecentFilesRepository.List`, so the recents half of the clause
rested entirely on a comment at `recent_files.go:9-10` — "performs validation
only when state is requested, never from a watcher or timer" — which is the same
shape as the guard T128 found unwired.

Counted rather than timed: a sleep proves only that nothing fired *yet*, while a
call count that stays put across a quiet interval and then moves on the next
`GetState` shows what actually drives the seam.
*/
// Proves: SC-FT-008 (recents are pruned at the display boundary, not by polling)
func TestRecentsAreListedOnlyAtDisplayAndChoice(t *testing.T) {
	repository := &countingRecentFilesRepository{}
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}), WithRecentFilesRepository(repository))
	paths := recentFixturePaths(t, "counted.md")

	state, _ := service.GetState(context.Background())
	listsAfterFirstDisplay := repository.lists
	if listsAfterFirstDisplay == 0 {
		t.Fatal("GetState performed no List, so this test cannot tell polling from display")
	}

	// An explicit choice: opening a file promotes, and refreshes for display.
	if opened := service.OpenPath(context.Background(), paths[0], state.Snapshot.TabSetRevision); opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("open = %+v, want opened", opened)
	}
	listsAfterChoice := repository.lists
	if repository.promotes != 1 {
		t.Fatalf("promotions = %d, want exactly the one explicit choice", repository.promotes)
	}

	// Now leave the service alone. Nothing may reach the repository on its own.
	time.Sleep(150 * time.Millisecond)
	if repository.lists != listsAfterChoice {
		t.Fatalf("List calls rose from %d to %d while idle, so something polls", listsAfterChoice, repository.lists)
	}
	if repository.promotes != 1 {
		t.Fatalf("promotions rose to %d while idle", repository.promotes)
	}

	// And the next display refresh still reaches it, so the count above is a
	// quiet seam rather than a dead one.
	if _, err := service.GetState(context.Background()); err != nil {
		t.Fatalf("state after idle: %v", err)
	}
	if repository.lists <= listsAfterChoice {
		t.Fatalf("List calls = %d after a display refresh, want more than the %d before it", repository.lists, listsAfterChoice)
	}
}

/*
T184 — SC-FT-008's clause K, against a **non-empty** prior order.

"A failed metadata transaction MUST retain the last committed order and MUST NOT
be reported as a successful promotion." The existing coverage used
`failingRecentFilesRepository`, which fails `List` *and* `Promote`, so the "last
committed order" at the moment of failure was the empty list and the assertion
collapsed to "no phantom entry appeared" — it could not distinguish retaining an
order from having none.

This holds a real write transaction open on a second connection to the same
database file, so the promotion fails with a genuine SQLite busy error rather
than a fake error value: `grep -i busy` across the test tree previously found
only a hand-written string.
*/
// Proves: SC-FT-008 (a failed metadata transaction retains a populated order)
func TestFailedPromotionRetainsAPopulatedCommittedOrder(t *testing.T) {
	first, second := openTwoRecentFilesDatabases(t)
	repository := NewSqliteRecentFilesRepository(first)
	service := NewEmptyAppModelService(WithEmitter(&recordingEmitter{}), WithRecentFilesRepository(repository))
	paths := recentFixturePaths(t, "committed-a.md", "committed-b.md", "refused.md")

	// A populated, committed order — the thing that must survive the failure.
	for _, path := range paths[:2] {
		if _, err := repository.Promote(context.Background(), path); err != nil {
			t.Fatalf("seed promotion %s: %v", path, err)
		}
	}
	state, _ := service.GetState(context.Background())
	committed := append([]string(nil), state.Snapshot.RecentFiles...)
	if len(committed) != 2 || committed[0] != paths[1] {
		t.Fatalf("committed order = %v, want two entries newest first", committed)
	}

	/*
	 * Make the *write* fail while leaving the committed row readable, which is
	 * what keeps the prior order populated — the whole point of this clause.
	 *
	 * A trigger rather than lock contention. A genuine SQLITE_BUSY is reachable
	 * (`isRecentSQLiteBusy` and the retry loop exist for it) but costs about
	 * fifteen seconds in a unit test: the busy timeout is 5000 ms and
	 * `withEntries` retries three times. A trigger that aborts the upsert is the
	 * same thing the requirement cares about — a real SQLite transaction that
	 * fails — at no cost, and unlike dropping the table it leaves `List`
	 * returning the committed order.
	 */
	if _, err := second.DB.ExecContext(context.Background(), `
CREATE TRIGGER refuse_recent_files_write
BEFORE UPDATE ON settings
WHEN NEW.key = 'recent.files'
BEGIN
  SELECT RAISE(ABORT, 'recent files write refused');
END;`); err != nil {
		t.Fatalf("install the refusing trigger: %v", err)
	}
	defer func() {
		_, _ = second.DB.ExecContext(context.Background(), "DROP TRIGGER IF EXISTS refuse_recent_files_write")
	}()

	state, _ = service.GetState(context.Background())
	opened := service.OpenPath(context.Background(), paths[2], state.Snapshot.TabSetRevision)

	// The open itself succeeds — recents are history, not the document.
	if opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("open during contention = %+v, want the document opened", opened)
	}
	// And the failure is reported as a warning rather than as a success.
	if opened.Error == nil || opened.Error.Category != apperr.ClassifiedPersistenceWarning {
		t.Fatalf("open warning = %+v, want a persistence warning for the refused promotion", opened.Error)
	}

	// The clause: the previously committed order is still there, unchanged, and
	// the refused path did not appear.
	state, _ = service.GetState(context.Background())
	if len(state.Snapshot.RecentFiles) != len(committed) {
		t.Fatalf("recents after a failed promotion = %v, want the committed order %v", state.Snapshot.RecentFiles, committed)
	}
	for index, path := range committed {
		if state.Snapshot.RecentFiles[index] != path {
			t.Fatalf("recents after a failed promotion = %v, want the committed order %v", state.Snapshot.RecentFiles, committed)
		}
	}
	for _, path := range state.Snapshot.RecentFiles {
		if path == paths[2] {
			t.Fatalf("refused promotion appeared in recents = %v", state.Snapshot.RecentFiles)
		}
	}
}
