package appmodel_test

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestExplicitSaveWritesTheCurrentBufferAndProjectsCleanState(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "edited\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before save: %v", err)
	}
	revision := state.Snapshot.Documents[documentID].ContentRevision
	result := service.Save(context.Background(), documentID, revision, "")
	if result.Status != apperr.WriteStatusCommitted || result.Data == nil || result.Data.TargetPath == "" {
		t.Fatalf("Save = %+v, want committed write outcome", result)
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read saved file: %v", err)
	}
	if string(disk) != "edited\n" {
		t.Fatalf("saved bytes = %q, want current buffer", disk)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after save: %v", err)
	}
	metadata := state.Snapshot.Documents[documentID]
	if metadata.Dirty || metadata.Status != string(SaveStatusSaved) {
		t.Fatalf("saved metadata = %+v, want clean saved document", metadata)
	}
}

func TestSaveAsUsesTheDialogTargetAndAdoptsItsCanonicalPath(t *testing.T) {
	target := filepath.Join(t.TempDir(), "saved.md")
	service := NewAppModelServiceForHost(
		WithEmitter(&recordingEmitter{}),
		AppModelOption{AutosaveTimer: &fakeAutosaveClock{}},
		WithDialogs(nil, saveDialog{path: target}),
	)
	documentID := newUntitledID(t, service)
	if err := service.UpdateBuffer(context.Background(), documentID, "untitled content\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before Save As: %v", err)
	}
	result := service.Save(context.Background(), documentID, state.Snapshot.Documents[documentID].ContentRevision, "")
	if result.Status != apperr.WriteStatusCommitted || result.Data == nil || !result.Data.TargetPathAdopted {
		t.Fatalf("Save for untitled document = %+v, want adopted Save As", result)
	}
	disk, err := os.ReadFile(target)
	if err != nil || string(disk) != "untitled content\n" {
		t.Fatalf("Save As bytes = %q, error=%v; want target content", disk, err)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after Save As: %v", err)
	}
	if got := state.Snapshot.Documents[documentID].Path; got == "" || state.Snapshot.Documents[documentID].Dirty {
		t.Fatalf("Save As metadata = %+v, want adopted clean path", state.Snapshot.Documents[documentID])
	}
}

func TestSaveAsUpdatesTheTitleAndDisplayNameOfAnOpenDocument(t *testing.T) {
	directory := t.TempDir()
	source := filepath.Join(directory, "c.md")
	target := filepath.Join(directory, "c-copy.md")
	if err := os.WriteFile(source, []byte("content\n"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	service := NewAppModelServiceForHost(
		WithEmitter(&recordingEmitter{}),
		AppModelOption{AutosaveTimer: &fakeAutosaveClock{}},
		WithDialogs(nil, saveDialog{path: target}),
	)
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before open: %v", err)
	}
	opened := service.OpenPath(context.Background(), source, state.Snapshot.TabSetRevision)
	if opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("OpenPath = %+v", opened)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before Save As: %v", err)
	}
	result := service.SaveAs(context.Background(), opened.DocumentID, state.Snapshot.Documents[opened.DocumentID].ContentRevision, "")
	if result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("SaveAs = %+v", result)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after Save As: %v", err)
	}
	metadata := state.Snapshot.Documents[opened.DocumentID]
	if metadata.Title != "c-copy.md" || metadata.DisplayName != "c-copy.md" {
		t.Fatalf("Save As title = %q and display name = %q, want c-copy.md", metadata.Title, metadata.DisplayName)
	}
}

func TestSaveRefusesAnUnsupportedSaveAsSuffixBeforeCreatingTheTarget(t *testing.T) {
	target := filepath.Join(t.TempDir(), "saved.png")
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithDialogs(nil, saveDialog{path: target}))
	documentID := newUntitledID(t, service)
	if err := service.UpdateBuffer(context.Background(), documentID, "content\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before unsupported Save As: %v", err)
	}
	result := service.Save(context.Background(), documentID, state.Snapshot.Documents[documentID].ContentRevision, "")
	if result.Status != apperr.WriteStatusRefused || result.Error == nil || result.Error.Category != apperr.ClassifiedUnsupportedInput {
		t.Fatalf("unsupported Save As = %+v, want classified refusal", result)
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("unsupported Save As created target: stat error=%v", err)
	}
}

func TestMixedLineEndingSaveRequiresAndConsumesOneNormalizationDecision(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, documentID := openAutosaveDocument(t, service, "first\r\nsecond\n")
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after mixed open: %v", err)
	}
	if state.Snapshot.Documents[documentID].LineEnding != "mixed" {
		t.Fatalf("mixed fixture line ending = %q, want mixed", state.Snapshot.Documents[documentID].LineEnding)
	}
	if err := service.UpdateBuffer(context.Background(), documentID, "changed\nagain\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before normalization: %v", err)
	}
	revision := state.Snapshot.Documents[documentID].ContentRevision
	needs := service.Save(context.Background(), documentID, revision, "")
	if needs.Status != apperr.WriteStatusNeedsNormalization || needs.DecisionToken == "" || needs.ProposedEnding == "" {
		t.Fatalf("mixed-ending Save = %+v, want one normalization decision", needs)
	}
	if cancelled := service.CancelNormalization(documentID, needs.DecisionToken); cancelled.Error != nil {
		t.Fatalf("CancelNormalization = %+v", cancelled)
	}
	retry := service.Save(context.Background(), documentID, revision, "")
	if retry.Status != apperr.WriteStatusNeedsNormalization || retry.DecisionToken == needs.DecisionToken {
		t.Fatalf("Save after cancellation = %+v, want a fresh decision", retry)
	}
	saved := service.Save(context.Background(), documentID, revision, retry.DecisionToken)
	if saved.Status != apperr.WriteStatusCommitted {
		t.Fatalf("authorized mixed-ending Save = %+v, want committed", saved)
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read normalized file: %v", err)
	}
	if string(disk) != "changed\nagain\n" && string(disk) != "changed\r\nagain\r\n" {
		t.Fatalf("normalized bytes = %q, want a uniform line ending", disk)
	}
}

func TestSaveRejectsAStaleContentRevisionWithoutWriting(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "edited\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	result := service.Save(context.Background(), documentID, 0, "")
	if result.Status != apperr.WriteStatusRefused || result.Error == nil || result.Error.Category != apperr.ClassifiedConflict {
		t.Fatalf("stale Save = %+v, want conflict refusal", result)
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read stale-save file: %v", err)
	}
	if string(disk) != "base\n" {
		t.Fatalf("stale Save changed disk to %q", disk)
	}
}

func TestTouchedSavedFileIsUnchanged(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, id := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), id, "edited\n"); err != nil {
		t.Fatal(err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if result := service.Save(context.Background(), id, state.Snapshot.Documents[id].ContentRevision, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save = %+v", result)
	}
	assertTouchedUnchanged(t, service, path, id)
}

func TestTouchedSavedUntitledWithoutNewlineIsUnchanged(t *testing.T) {
	path := filepath.Join(t.TempDir(), "hello.md")
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}}, WithDialogs(nil, saveDialog{path: path}))
	id := newUntitledID(t, service)
	if err := service.UpdateBuffer(context.Background(), id, "hello"); err != nil {
		t.Fatal(err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if result := service.Save(context.Background(), id, state.Snapshot.Documents[id].ContentRevision, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save = %+v", result)
	}
	assertTouchedUnchanged(t, service, path, id)
}

func assertTouchedUnchanged(t *testing.T, service *AppModelService, path, id string) {
	t.Helper()
	future := time.Now().Add(time.Hour)
	if err := os.Chtimes(path, future, future); err != nil {
		t.Fatal(err)
	}
	if result := service.CheckExternalChanges(context.Background(), id); result.Status != apperr.ConflictStatusUnchanged {
		t.Fatalf("CheckExternalChanges = %+v, want unchanged", result)
	}
}

func TestSaveAsPreservesBOMOnNextSave(t *testing.T) {
	target := filepath.Join(t.TempDir(), "copy.md")
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}}, WithDialogs(nil, saveDialog{path: target}))
	_, id := openAutosaveDocument(t, service, "\xef\xbb\xbfbase\n")
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if result := service.SaveAs(context.Background(), id, state.Snapshot.Documents[id].ContentRevision, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("SaveAs = %+v", result)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got := state.Snapshot.Documents[id].BOM; got != "present" {
		t.Errorf("BOM after Save As = %q, want present", got)
	}
	if err := service.UpdateBuffer(context.Background(), id, "edited\n"); err != nil {
		t.Fatal(err)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if result := service.Save(context.Background(), id, state.Snapshot.Documents[id].ContentRevision, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save = %+v", result)
	}
	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(data, []byte{0xef, 0xbb, 0xbf}) {
		t.Fatalf("saved bytes = %q, want BOM", data)
	}
}

func TestTouchedSavedGrownDocumentIsUnchangedAndEditable(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, id := openAutosaveDocument(t, service, "base\n")
	content := strings.Repeat("a", 10_485_761)
	if err := service.UpdateBuffer(context.Background(), id, content); err != nil {
		t.Fatal(err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if result := service.Save(context.Background(), id, state.Snapshot.Documents[id].ContentRevision, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save = %+v", result)
	}
	assertTouchedUnchanged(t, service, path, id)
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got := state.Snapshot.Documents[id].Capability; got != "writable" {
		t.Fatalf("capability = %q, want writable", got)
	}
	if err := service.UpdateBuffer(context.Background(), id, content+"x"); err != nil {
		t.Fatalf("edit after save: %v", err)
	}
}
