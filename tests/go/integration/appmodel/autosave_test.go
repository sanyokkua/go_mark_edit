package appmodel_test

import (
	"context"
	"os"
	"testing"

	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestAutosaveDebounceWritesTheLatestAcceptedBuffer(t *testing.T) {
	clock := &fakeAutosaveClock{}
	emitter := &recordingEmitter{}
	service := NewAppModelServiceForHost(WithEmitter(emitter), AppModelOption{AutosaveTimer: clock})
	path, documentID := openAutosaveDocument(t, service, "base\n")

	if err := service.UpdateBuffer(context.Background(), documentID, "first\n"); err != nil {
		t.Fatalf("first edit: %v", err)
	}
	if err := service.UpdateBuffer(context.Background(), documentID, "latest\n"); err != nil {
		t.Fatalf("latest edit: %v", err)
	}
	if clock.Pending() != 1 {
		t.Fatalf("pending autosave timers = %d, want one replacement timer", clock.Pending())
	}
	if !clock.FireNext() {
		t.Fatal("autosave timer did not fire")
	}

	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read autosaved file: %v", err)
	}
	if string(disk) != "latest\n" {
		t.Fatalf("disk content = %q, want latest accepted buffer", disk)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after autosave: %v", err)
	}
	metadata := state.Snapshot.Documents[documentID]
	if metadata.Dirty || metadata.Status != string(SaveStatusAutosaved) {
		t.Fatalf("autosaved metadata = %+v, want clean autosaved document", metadata)
	}
}

func TestAutosaveSkipsUntitledAndDetachesWhenTheBackingFileDisappears(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: clock})
	path, documentID := openAutosaveDocument(t, service, "base\n")

	if err := service.UpdateBuffer(context.Background(), documentID, "edited\n"); err != nil {
		t.Fatalf("file edit: %v", err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove backing file: %v", err)
	}
	if !clock.FireNext() {
		t.Fatal("detached autosave timer did not fire")
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after disappearance: %v", err)
	}
	metadata := state.Snapshot.Documents[documentID]
	if !metadata.Detached || !metadata.Dirty || metadata.Status != string(SaveStatusUnsavedChanges) {
		t.Fatalf("disappeared-file metadata = %+v, want detached dirty document", metadata)
	}

	newDocument := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
	if newDocument.Data == nil {
		t.Fatalf("NewDocument = %+v", newDocument)
	}
	if err := service.UpdateBuffer(context.Background(), newDocument.Data.DocumentID, "untitled\n"); err != nil {
		t.Fatalf("untitled edit: %v", err)
	}
	if clock.Pending() != 0 {
		t.Fatalf("untitled edit scheduled %d timers, want none", clock.Pending())
	}
}

func TestAutosaveConflictLeavesExternalBytesUntouchedAndBlocksTheDocument(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: clock})
	path, documentID := openAutosaveDocument(t, service, "base\n")

	if err := service.UpdateBuffer(context.Background(), documentID, "mine\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	if err := os.WriteFile(path, []byte("external\n"), 0o640); err != nil {
		t.Fatalf("external replacement: %v", err)
	}
	if !clock.FireNext() {
		t.Fatal("conflict autosave timer did not fire")
	}

	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read externally changed file: %v", err)
	}
	if string(disk) != "external\n" {
		t.Fatalf("external bytes = %q, want untouched replacement", disk)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after conflict: %v", err)
	}
	metadata := state.Snapshot.Documents[documentID]
	if !metadata.ConflictBlocked || metadata.Status != string(SaveStatusUnsavedChanges) {
		t.Fatalf("conflicted metadata = %+v, want blocked unsaved document", metadata)
	}
}

func TestDisablingAutosaveCancelsPendingWorkWithoutClearingDirtyState(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: clock})
	path, documentID := openAutosaveDocument(t, service, "base\n")

	if err := service.UpdateBuffer(context.Background(), documentID, "while off\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	service.SetAutosaveEnabled(false)
	if clock.Pending() != 0 || clock.FireNext() {
		t.Fatalf("autosave remained armed after disabling: pending=%d", clock.Pending())
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file while autosave disabled: %v", err)
	}
	if string(disk) != "base\n" {
		t.Fatalf("disk content while autosave disabled = %q, want original bytes", disk)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState while autosave disabled: %v", err)
	}
	if metadata := state.Snapshot.Documents[documentID]; !metadata.Dirty || metadata.Status != string(SaveStatusUnsavedChanges) {
		t.Fatalf("disabled-autosave metadata = %+v, want dirty unsaved document", metadata)
	}

	service.SetAutosaveEnabled(true)
	if clock.Pending() != 0 {
		t.Fatalf("enabling autosave scheduled catch-up work: %d timers", clock.Pending())
	}
	if err := service.UpdateBuffer(context.Background(), documentID, "after re-enable\n"); err != nil {
		t.Fatalf("edit after re-enable: %v", err)
	}
	if !clock.FireNext() {
		t.Fatal("autosave after re-enable did not fire")
	}
	disk, err = os.ReadFile(path)
	if err != nil {
		t.Fatalf("read re-enabled autosave: %v", err)
	}
	if string(disk) != "after re-enable\n" {
		t.Fatalf("disk content after re-enable = %q, want new edit", disk)
	}
}
