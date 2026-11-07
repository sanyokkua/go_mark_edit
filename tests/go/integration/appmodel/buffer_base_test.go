package appmodel_test

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"

	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

// reloadExternally replaces the file on disk and accepts the reload, returning
// the revision the reload produced.
func reloadExternally(t *testing.T, service *AppModelService, path, documentID, external string) uint64 {
	t.Helper()
	if err := os.WriteFile(path, []byte(external), 0o640); err != nil {
		t.Fatalf("external replacement: %v", err)
	}
	detected := service.CheckExternalChanges(context.Background(), documentID)
	if detected.Preview == nil {
		t.Fatalf("CheckExternalChanges = %+v, want preview", detected)
	}
	reloaded := service.ReloadFromDisk(context.Background(), documentID, detected.Preview.ContentRevision, detected.Preview.DetectedDiskVersion)
	if reloaded.Status != apperr.ConflictStatusReloaded || reloaded.ActiveBuffer == nil {
		t.Fatalf("ReloadFromDisk = %+v, want reloaded", reloaded)
	}
	return reloaded.ActiveBuffer.DocumentRevision
}

func TestBufferUpdateBasedBeforeAReloadIsRefusedAndAutosaveKeepsTheReloadedText(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: clock})
	path, documentID := openAutosaveDocument(t, service, "base\n")
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	openedRevision := state.Snapshot.Documents[documentID].ContentRevision

	reloadedRevision := reloadExternally(t, service, path, documentID, "external\n")

	// An edit typed against the pre-reload session, delivered after the reload.
	err = service.UpdateBufferFrom(context.Background(), documentID, "stale edit\n", openedRevision)
	if !errors.Is(err, ErrBufferSuperseded) {
		t.Fatalf("stale UpdateBufferFrom error = %v, want ErrBufferSuperseded", err)
	}
	if clock.Pending() != 0 {
		t.Fatalf("pending autosave timers = %d, want none for a refused update", clock.Pending())
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after stale update: %v", err)
	}
	metadata := state.Snapshot.Documents[documentID]
	if metadata.Dirty || metadata.ContentRevision != reloadedRevision || state.ActiveBuffer == nil || state.ActiveBuffer.Content != "external\n" {
		t.Fatalf("after stale update metadata = %+v buffer = %+v, want the clean reloaded buffer", metadata, state.ActiveBuffer)
	}
	saved := service.Save(context.Background(), documentID, reloadedRevision, "")
	if saved.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save after stale update = %+v, want committed", saved)
	}
	if disk, err := os.ReadFile(path); err != nil || string(disk) != "external\n" {
		t.Fatalf("disk = %q (%v), want the reloaded text", disk, err)
	}

	// An edit based on the reload is ordinary and autosaves.
	if err := service.UpdateBufferFrom(context.Background(), documentID, "after reload\n", reloadedRevision); err != nil {
		t.Fatalf("UpdateBufferFrom on the reloaded base: %v", err)
	}
	if !clock.FireNext() {
		t.Fatal("autosave timer did not fire for the accepted edit")
	}
	if disk, err := os.ReadFile(path); err != nil || string(disk) != "after reload\n" {
		t.Fatalf("disk = %q (%v), want the post-reload edit", disk, err)
	}
}

func TestBufferUpdateBasedOnAnEarlierEditOfTheSameSessionIsAccepted(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	_, documentID := openAutosaveDocument(t, service, "base\n")
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	base := state.Snapshot.Documents[documentID].ContentRevision
	for _, content := range []string{"one\n", "two\n"} {
		if err := service.UpdateBufferFrom(context.Background(), documentID, content, base); err != nil {
			t.Fatalf("UpdateBufferFrom(%q): %v", content, err)
		}
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after edits: %v", err)
	}
	if state.ActiveBuffer == nil || state.ActiveBuffer.Content != "two\n" {
		t.Fatalf("active buffer = %+v, want the latest session edit", state.ActiveBuffer)
	}
}

func TestBoundUpdateBufferReportsASupersededBaseWithTheRevisionToRebaseOnto(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, documentID := openAutosaveDocument(t, service, "base\n")
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	openedRevision := state.Snapshot.Documents[documentID].ContentRevision
	reloadedRevision := reloadExternally(t, service, path, documentID, "external\n")
	handler := NewAppModelHandler(service, nil, func() context.Context { return context.Background() })

	stale := handler.UpdateBuffer(bridge.Request{ID: "stale-update"}, documentID, "stale edit\n", openedRevision)
	if stale.Status != apperr.BufferUpdateSuperseded || stale.Error != nil || stale.Category != "" {
		t.Fatalf("stale UpdateBuffer = %+v, want a superseded status without an error", stale)
	}
	if stale.DocumentRevision != reloadedRevision {
		t.Fatalf("stale UpdateBuffer revision = %d, want the current revision %d", stale.DocumentRevision, reloadedRevision)
	}
	accepted := handler.UpdateBuffer(bridge.Request{ID: "fresh-update"}, documentID, "fresh edit\n", reloadedRevision)
	if accepted.Status != apperr.BufferUpdateAccepted || accepted.Error != nil {
		t.Fatalf("fresh UpdateBuffer = %+v, want accepted", accepted)
	}
}
