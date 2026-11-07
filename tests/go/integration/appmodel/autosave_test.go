package appmodel_test

import (
	"context"
	"os"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"

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

func TestDiscardFenceRetainsLatestAutosaveWithoutWritingUntilCancel(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: clock})
	path, id := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), id, "first\n"); err != nil {
		t.Fatal(err)
	}
	service.BeginShutdownDiscard()
	if err := service.UpdateBuffer(context.Background(), id, "latest\n"); err != nil {
		t.Fatal(err)
	}
	if clock.FireNext() {
		t.Fatal("discard fence left an armed autosave")
	}
	if err := service.DrainDiscardBeforeClose(); err != nil {
		t.Fatalf("discard drain: %+v", err)
	}
	if bytes, err := os.ReadFile(path); err != nil || string(bytes) != "base\n" {
		t.Fatalf("disk while fenced = %q, %v", bytes, err)
	}
	service.EndShutdownDrain()
	if !clock.FireNext() {
		t.Fatal("cancel did not rearm latest intent")
	}
	if bytes, err := os.ReadFile(path); err != nil || string(bytes) != "latest\n" {
		t.Fatalf("disk after cancel = %q, %v", bytes, err)
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

func TestMixedEndingsWaitForExplicitNormalization(t *testing.T) {
	for _, boundary := range []string{"elapsed debounce", "close drain"} {
		t.Run(boundary, func(t *testing.T) { testMixedEndingsWaitForExplicitNormalization(t, boundary) })
	}
}

func testMixedEndingsWaitForExplicitNormalization(t *testing.T, boundary string) {
	t.Helper()
	ctx := context.Background()
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: clock})
	path, id := writeMixedDocument(t, service, "a\r\nb\n")
	if err := service.UpdateBuffer(ctx, id, "edited\n"); err != nil {
		t.Fatal(err)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	revision := state.Snapshot.Documents[id].ContentRevision
	prompt := service.Save(ctx, id, revision, "")
	if prompt.Status != apperr.WriteStatusNeedsNormalization || prompt.DecisionToken == "" {
		t.Fatalf("Save = %+v, want normalization prompt", prompt)
	}
	if clock.Pending() != 0 {
		t.Fatalf("mixed document scheduled %d timers, want none", clock.Pending())
	}
	if boundary == "elapsed debounce" {
		clock.FireNext()
	} else {
		prepareMixedClose(t, service, id, state.Snapshot.TabSetRevision)
	}
	if clock.Pending() != 0 {
		t.Fatalf("pending timers = %d, want none", clock.Pending())
	}
	disk, err := os.ReadFile(path)
	if err != nil || string(disk) != "a\r\nb\n" {
		t.Fatalf("disk before confirmation = %q, %v", disk, err)
	}
	saved := service.Save(ctx, id, revision, prompt.DecisionToken)
	if saved.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save with original token = %+v, want committed", saved)
	}
	disk, err = os.ReadFile(path)
	if err != nil || string(disk) != "edited\r\n" {
		t.Fatalf("disk after confirmation = %q, %v", disk, err)
	}
}

func prepareMixedClose(t *testing.T, service *AppModelService, id string, revision uint64) {
	t.Helper()
	plan := service.PrepareClose(context.Background(), apperr.ClosePlanSingle, []string{id}, revision)
	if plan.Error != nil || plan.Data == nil {
		t.Fatalf("PrepareClose = %+v", plan)
	}
}
