package appmodel

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestOpenPathLifecycle(t *testing.T) {
	path := writeOpenFixture(t, "notes.md", "# Notes\nhello\n")
	emitter := &recordingEmitter{}
	service := NewEmptyAppModelService(emitter)
	initial, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before Open: %v", err)
	}

	outcome := service.OpenPath(context.Background(), path, initial.Snapshot.TabSetRevision)
	if outcome.Status != OpenStatusOpened || outcome.Error != nil || outcome.ActiveBuffer == nil {
		t.Fatalf("Open outcome = %+v, want opened acknowledgement", outcome)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after Open: %v", err)
	}
	metadata := state.Snapshot.Documents[outcome.DocumentID]
	if metadata.Path == "" || metadata.DisplayName != "notes.md" || metadata.ParentName == "" {
		t.Fatalf("opened metadata = %+v", metadata)
	}
	if metadata.Encoding != "utf-8" || metadata.BOM != "absent" || metadata.LineEnding != "lf" || metadata.Capability != "writable" || metadata.Dirty {
		t.Fatalf("opened characteristics = %+v", metadata)
	}
	if state.Snapshot.ActiveDocumentID != outcome.DocumentID || state.ActiveBuffer == nil || state.ActiveBuffer.Content != "# Notes\nhello\n" {
		t.Fatalf("opened active state = %+v", state)
	}
	if len(state.Snapshot.RecentFiles) != 1 || state.Snapshot.RecentFiles[0] != metadata.Path {
		t.Fatalf("opened recent files = %+v", state.Snapshot.RecentFiles)
	}
	if outcome.ActiveBuffer.DocumentRevision != metadata.ContentRevision || outcome.ActiveBuffer.ProjectionRevision != state.Snapshot.Revision {
		t.Fatalf("opened acknowledgement = %+v, state=%+v", outcome.ActiveBuffer, state.Snapshot)
	}
	if len(emitter.patches) != 1 {
		t.Fatalf("Open emitted %d patches, want one", len(emitter.patches))
	}
}

func TestOpenFocusesCanonicalDuplicate(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "one", "note.md")
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		t.Fatalf("create target directory: %v", err)
	}
	if err := os.WriteFile(target, []byte("one\n"), 0o644); err != nil {
		t.Fatalf("write target: %v", err)
	}
	alias := filepath.Join(root, "alias.md")
	if err := os.Symlink(target, alias); err != nil {
		t.Fatalf("create alias: %v", err)
	}
	service := NewEmptyAppModelService(&recordingEmitter{})
	firstState, _ := service.GetState(context.Background())
	first := service.OpenPath(context.Background(), target, firstState.Snapshot.TabSetRevision)
	state, _ := service.GetState(context.Background())
	second := service.OpenPath(context.Background(), alias, state.Snapshot.TabSetRevision)
	if first.DocumentID == "" || second.DocumentID != first.DocumentID || second.Status != OpenStatusFocused {
		t.Fatalf("duplicate outcomes = %+v / %+v", first, second)
	}
	state, _ = service.GetState(context.Background())
	if len(state.Snapshot.Documents) != 1 || len(state.Snapshot.OrderedDocumentIDs) != 1 {
		t.Fatalf("duplicate created extra state = %+v", state.Snapshot)
	}
}

func TestOpenReplacesOnlyEmptyUntitled(t *testing.T) {
	path := writeOpenFixture(t, "replacement.md", "replacement\n")
	service := NewAppModelService(&recordingEmitter{})
	initial, _ := service.GetState(context.Background())
	replaced := service.OpenPath(context.Background(), path, initial.Snapshot.TabSetRevision)
	state, _ := service.GetState(context.Background())
	if replaced.Status != OpenStatusOpened || len(state.Snapshot.Documents) != 1 || state.Snapshot.ActiveDocumentID != replaced.DocumentID {
		t.Fatalf("empty placeholder replacement = %+v / %+v", replaced, state.Snapshot)
	}

	service = NewAppModelService(&recordingEmitter{})
	initial, _ = service.GetState(context.Background())
	if err := service.UpdateBuffer(context.Background(), initial.Snapshot.ActiveDocumentID, "keep me"); err != nil {
		t.Fatalf("make untitled document nonempty: %v", err)
	}
	state, _ = service.GetState(context.Background())
	appended := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	state, _ = service.GetState(context.Background())
	if appended.Status != OpenStatusOpened || len(state.Snapshot.Documents) != 2 {
		t.Fatalf("nonempty placeholder was replaced: %+v / %+v", appended, state.Snapshot)
	}
}

func TestOpenRefusesFortyFirstWithoutMutation(t *testing.T) {
	root := t.TempDir()
	service := NewEmptyAppModelService(&recordingEmitter{})
	for count := 0; count < maxOpenDocuments; count++ {
		path := filepath.Join(root, "doc-"+string(rune('a'+count))+".md")
		if err := os.WriteFile(path, []byte("doc\n"), 0o644); err != nil {
			t.Fatalf("write fixture %d: %v", count, err)
		}
		state, _ := service.GetState(context.Background())
		outcome := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
		if outcome.Error != nil || outcome.DocumentID == "" {
			t.Fatalf("open %d = %+v", count+1, outcome)
		}
	}
	before, _ := service.GetState(context.Background())
	patchCount := len(service.emitter.(*recordingEmitter).patches)
	refusedPath := filepath.Join(root, "refused.md")
	if err := os.WriteFile(refusedPath, []byte("refused\n"), 0o644); err != nil {
		t.Fatalf("write refusal fixture: %v", err)
	}
	refused := service.OpenPath(context.Background(), refusedPath, before.Snapshot.TabSetRevision)
	if refused.Error == nil || refused.Error.Category != apperr.ClassifiedCapacityLimit || refused.Status != OpenStatusRefused {
		t.Fatalf("41st Open = %+v", refused)
	}
	after, _ := service.GetState(context.Background())
	if len(after.Snapshot.Documents) != maxOpenDocuments || len(after.Snapshot.OrderedDocumentIDs) != maxOpenDocuments || len(service.emitter.(*recordingEmitter).patches) != patchCount {
		t.Fatalf("41st Open changed state = %+v", after.Snapshot)
	}
}

// Proves: FR-FT-040
func TestOpenStaleRecentEntryRefusesNotFoundWithoutMutation(t *testing.T) {
	/*
	 * A missing path returned no error through two layers. `CurrentDiskVersion`
	 * reports absence as `DiskVersion{}, nil` (`internal/file/disk_version.go:39-42`)
	 * and `ReadClassifiedStable` short-circuits on `!before.Exists`
	 * (`document_reader.go:144-146`), so neither `readErr` nor `read.Error` fired
	 * and `identity` was "". The match loop's `document.canonicalIdentity == identity`
	 * is then satisfied by *any* untitled document, so the stale entry silently
	 * focused an unrelated tab; with no untitled tab it minted a blank pathless
	 * document and promoted "", surfacing `persistence-warning`.
	 *
	 * `NewAppModelService` is used rather than `NewEmptyAppModelService` precisely
	 * because it seeds one untitled placeholder — that is the arm that produced the
	 * wrong-tab focus, and an empty service would only exercise the blank-document
	 * arm.
	 */
	missing := writeOpenFixture(t, "deleted-recent.md", "gone\n")
	if err := os.Remove(missing); err != nil {
		t.Fatalf("remove recent fixture: %v", err)
	}

	emitter := &recordingEmitter{}
	service := NewAppModelService(emitter)
	before, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before Open: %v", err)
	}
	documentCount := len(before.Snapshot.Documents)
	orderedCount := len(before.Snapshot.OrderedDocumentIDs)
	patchCount := len(emitter.patches)

	outcome := service.OpenPath(context.Background(), missing, before.Snapshot.TabSetRevision)
	if outcome.Status != apperr.OpenStatusRefused || outcome.Error == nil || outcome.Error.Category != apperr.ClassifiedNotFound {
		t.Fatalf("Open of a deleted recent entry = %+v, want a refused not-found", outcome)
	}
	if outcome.DocumentID != "" {
		t.Fatalf("Open of a deleted recent entry resolved to document %q, want none", outcome.DocumentID)
	}

	after, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after Open: %v", err)
	}
	if len(after.Snapshot.Documents) != documentCount || len(after.Snapshot.OrderedDocumentIDs) != orderedCount || len(emitter.patches) != patchCount {
		t.Fatalf("refused Open mutated tab state = %+v", after.Snapshot)
	}
	if len(service.reservations) != 0 {
		t.Fatalf("refused Open left %d open reservation(s)", len(service.reservations))
	}
}

func TestPersistedArrangementPrecedence(t *testing.T) {
	path := writeOpenFixture(t, "arrangement.md", "arrangement\n")
	repository := &recordingFileMetadataRepository{arrangements: map[string]string{}}
	canonical, err := file.CanonicalizeDocumentPath(path)
	if err != nil {
		t.Fatalf("canonicalize arrangement fixture: %v", err)
	}
	repository.arrangements[canonical.Path] = ArrangementPreview
	service := NewEmptyAppModelService(&recordingEmitter{})
	service.SetFileMetadataRepository(repository)
	service.SetDefaultOpenMode(OpenModeEditor)
	state, _ := service.GetState(context.Background())
	outcome := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if outcome.Error != nil {
		t.Fatalf("open persisted arrangement: %+v", outcome.Error)
	}
	state, _ = service.GetState(context.Background())
	if got := state.Snapshot.Documents[outcome.DocumentID].View.Arrangement; got != ArrangementPreview {
		t.Fatalf("persisted arrangement = %q, want %q", got, ArrangementPreview)
	}
}

func TestIdentityReservationLifecycle(t *testing.T) {
	path := writeOpenFixture(t, "reserved.md", "reserved\n")
	service := NewEmptyAppModelService(&recordingEmitter{})
	state, _ := service.GetState(context.Background())
	preparation, classified := service.PrepareOpen(context.Background(), path, state.Snapshot.TabSetRevision)
	if classified != nil || preparation.ReservationID == "" || len(service.reservations) != 1 {
		t.Fatalf("preparation = %+v, error=%+v, reservations=%d", preparation, classified, len(service.reservations))
	}
	if err := service.CancelPreparedOpen(preparation.ReservationID); err != nil {
		t.Fatalf("cancel preparation: %v", err)
	}
	if len(service.reservations) != 0 {
		t.Fatalf("cancel leaked reservation: %d", len(service.reservations))
	}
}

func TestPendingReservationCountsTowardLimit(t *testing.T) {
	root := t.TempDir()
	service := NewEmptyAppModelService(&recordingEmitter{})
	preparations := make([]OpenPreparation, 0, maxOpenDocuments)
	for count := 0; count < maxOpenDocuments; count++ {
		path := filepath.Join(root, "pending-"+string(rune('a'+count))+".md")
		if err := os.WriteFile(path, []byte("pending\n"), 0o644); err != nil {
			t.Fatalf("write pending fixture: %v", err)
		}
		preparation, classified := service.PrepareOpen(context.Background(), path, 0)
		if classified != nil {
			t.Fatalf("prepare %d = %+v", count+1, classified)
		}
		preparations = append(preparations, preparation)
	}
	path := filepath.Join(root, "pending-refused.md")
	if err := os.WriteFile(path, []byte("pending\n"), 0o644); err != nil {
		t.Fatalf("write refusal fixture: %v", err)
	}
	_, classified := service.PrepareOpen(context.Background(), path, 0)
	if classified == nil || classified.Category != apperr.ClassifiedCapacityLimit {
		t.Fatalf("pending 41st preparation = %+v, want capacity-limit", classified)
	}
	for _, preparation := range preparations {
		if err := service.CancelPreparedOpen(preparation.ReservationID); err != nil {
			t.Fatalf("cancel pending reservation: %v", err)
		}
	}
}

func TestConcurrentSameIdentityRequestsJoinOneOutcome(t *testing.T) {
	path := writeOpenFixture(t, "concurrent.md", "concurrent\n")
	service := NewEmptyAppModelService(&recordingEmitter{})
	preparations := make([]OpenPreparation, 2)
	errors := make([]*apperr.ClassifiedError, 2)
	var wait sync.WaitGroup
	for index := range preparations {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			preparations[index], errors[index] = service.PrepareOpen(context.Background(), path, 0)
		}(index)
	}
	wait.Wait()
	if preparations[0].ReservationID == "" || preparations[0].ReservationID != preparations[1].ReservationID || errors[0] != nil || errors[1] != nil {
		t.Fatalf("concurrent preparations = %+v / %+v, errors=%+v", preparations[0], preparations[1], errors)
	}
	if len(service.reservations) != 1 {
		t.Fatalf("concurrent preparations reserved %d identities, want one", len(service.reservations))
	}
	if err := service.CancelPreparedOpen(preparations[0].ReservationID); err != nil {
		t.Fatalf("cancel joined reservation: %v", err)
	}
}

func TestReservationReleasedOnEveryTerminalOutcome(t *testing.T) {
	path := writeOpenFixture(t, "terminal.md", "terminal\n")
	service := NewEmptyAppModelService(&recordingEmitter{})
	state, _ := service.GetState(context.Background())
	preparation, classified := service.PrepareOpen(context.Background(), path, state.Snapshot.TabSetRevision)
	if classified != nil {
		t.Fatalf("prepare terminal outcome: %+v", classified)
	}
	outcome := service.CommitPreparedOpen(context.Background(), preparation.ReservationID)
	if outcome.Error != nil || len(service.reservations) != 0 {
		t.Fatalf("commit terminal outcome = %+v, reservations=%d", outcome, len(service.reservations))
	}
}

func TestOpenSelectionPerformsNoMutationBeforeFlush(t *testing.T) {
	path := writeOpenFixture(t, "two-phase.md", "two phase\n")
	emitter := &recordingEmitter{}
	service := NewEmptyAppModelService(emitter)
	before, _ := service.GetState(context.Background())
	preparation, classified := service.PrepareOpen(context.Background(), path, before.Snapshot.TabSetRevision)
	if classified != nil {
		t.Fatalf("prepare Open: %+v", classified)
	}
	selected, _ := service.GetState(context.Background())
	if len(selected.Snapshot.Documents) != len(before.Snapshot.Documents) || selected.Snapshot.ActiveDocumentID != before.Snapshot.ActiveDocumentID || len(emitter.patches) != 0 {
		t.Fatalf("selection mutated model before flush: before=%+v selected=%+v patches=%d", before.Snapshot, selected.Snapshot, len(emitter.patches))
	}
	if outcome := service.CommitPreparedOpen(context.Background(), preparation.ReservationID); outcome.Error != nil {
		t.Fatalf("commit Open: %+v", outcome.Error)
	}
}

func writeOpenFixture(t *testing.T, name, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(content), 0o640); err != nil {
		t.Fatalf("write Open fixture: %v", err)
	}
	return path
}

type recordingFileMetadataRepository struct {
	arrangements map[string]string
}

func (repository *recordingFileMetadataRepository) ReadArrangement(_ context.Context, path string) (string, bool, error) {
	arrangement, ok := repository.arrangements[path]
	return arrangement, ok, nil
}

func (repository *recordingFileMetadataRepository) WriteArrangement(_ context.Context, path, arrangement string) error {
	repository.arrangements[path] = arrangement
	return nil
}
