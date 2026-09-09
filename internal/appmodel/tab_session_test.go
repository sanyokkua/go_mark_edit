package appmodel

import (
	"context"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestTabSessionOrderRevision(t *testing.T) {
	emitter := &recordingEmitter{}
	service := NewAppModelService(emitter)
	before, _ := service.GetState(context.Background())

	created := service.NewDocument(context.Background(), before.Snapshot.TabSetRevision)
	if created.Error != nil || created.Data == nil {
		t.Fatalf("NewDocument = %+v", created)
	}
	state, _ := service.GetState(context.Background())
	if state.Snapshot.TabSetRevision != before.Snapshot.TabSetRevision+1 {
		t.Fatalf("tab revision after add = %d, want %d", state.Snapshot.TabSetRevision, before.Snapshot.TabSetRevision+1)
	}
	firstID := state.Snapshot.OrderedDocumentIDs[0]
	activation := service.ActivateDocument(context.Background(), firstID, state.Snapshot.TabSetRevision)
	if activation.Error != nil || activation.Data == nil || activation.Data.DocumentID != firstID {
		t.Fatalf("ActivateDocument = %+v", activation)
	}
	state, _ = service.GetState(context.Background())
	if state.Snapshot.ActiveDocumentID != firstID || state.Snapshot.TabSetRevision != before.Snapshot.TabSetRevision+2 {
		t.Fatalf("activated state = %+v", state.Snapshot)
	}
	if len(emitter.patches) != 2 {
		t.Fatalf("effective add/activation emitted %d patches, want 2", len(emitter.patches))
	}
}

func TestActivateDocumentAcknowledgement(t *testing.T) {
	service := NewAppModelService(&recordingEmitter{})
	before, _ := service.GetState(context.Background())
	created := service.NewDocument(context.Background(), before.Snapshot.TabSetRevision)
	state, _ := service.GetState(context.Background())
	firstID := state.Snapshot.OrderedDocumentIDs[0]

	ack := service.ActivateDocument(context.Background(), firstID, state.Snapshot.TabSetRevision)
	if ack.Data == nil || ack.Data.Content != "" || ack.Data.DocumentRevision != state.Snapshot.Documents[firstID].ContentRevision {
		t.Fatalf("activation acknowledgement = %+v", ack)
	}
	if ack.Data.ProjectionRevision == state.Snapshot.Revision {
		t.Fatalf("activation projection revision = %d, want a new revision", ack.Data.ProjectionRevision)
	}

	unchanged, _ := service.GetState(context.Background())
	patches := len(service.emitter.(*recordingEmitter).patches)
	same := service.ActivateDocument(context.Background(), firstID, unchanged.Snapshot.TabSetRevision)
	if same.Error != nil || same.Data == nil || same.Data.ProjectionRevision != unchanged.Snapshot.Revision {
		t.Fatalf("same active acknowledgement = %+v, state=%+v", same, unchanged.Snapshot)
	}
	if len(service.emitter.(*recordingEmitter).patches) != patches {
		t.Fatal("same active activation emitted a patch")
	}
	_ = created
}

// Proves: FR-FT-033
func TestStaleTabCommands(t *testing.T) {
	emitter := &recordingEmitter{}
	service := NewAppModelService(emitter)
	before, _ := service.GetState(context.Background())
	created := service.NewDocument(context.Background(), before.Snapshot.TabSetRevision)
	state, _ := service.GetState(context.Background())
	wantState := state
	patches := len(emitter.patches)

	staleActivation := service.ActivateDocument(context.Background(), before.Snapshot.ActiveDocumentID, before.Snapshot.TabSetRevision)
	if staleActivation.Error == nil || staleActivation.Error.Category != apperr.ClassifiedConflict {
		t.Fatalf("stale activation = %+v, want conflict", staleActivation)
	}
	staleReorder := service.ReorderDocument(context.Background(), created.Data.DocumentID, 0, before.Snapshot.TabSetRevision)
	if staleReorder.Error == nil || staleReorder.Error.Category != apperr.ClassifiedConflict {
		t.Fatalf("stale reorder = %+v, want conflict", staleReorder)
	}
	staleClose := service.CloseDocument(context.Background(), created.Data.DocumentID, before.Snapshot.TabSetRevision)
	if staleClose.Error == nil || staleClose.Error.Category != apperr.ClassifiedConflict {
		t.Fatalf("stale close = %+v, want conflict", staleClose)
	}
	after, _ := service.GetState(context.Background())
	if !reflect.DeepEqual(after, wantState) || len(emitter.patches) != patches {
		t.Fatalf("stale commands changed state: before=%+v after=%+v patches=%d", wantState.Snapshot, after.Snapshot, len(emitter.patches))
	}
}

func TestAdjacentAndFinalClose(t *testing.T) {
	emitter := &recordingEmitter{}
	service := NewAppModelService(emitter)
	state, _ := service.GetState(context.Background())
	for range 2 {
		created := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
		if created.Error != nil {
			t.Fatalf("NewDocument = %+v", created)
		}
		state, _ = service.GetState(context.Background())
	}
	order := append([]string(nil), state.Snapshot.OrderedDocumentIDs...)
	closed := service.CloseDocument(context.Background(), order[2], state.Snapshot.TabSetRevision)
	if closed.Error != nil || closed.ActiveDocumentID != order[1] || closed.ActiveBuffer == nil || closed.ActiveBuffer.DocumentID != order[1] {
		t.Fatalf("close last active = %+v", closed)
	}
	state, _ = service.GetState(context.Background())
	closed = service.CloseDocument(context.Background(), order[1], state.Snapshot.TabSetRevision)
	if closed.Error != nil || closed.ActiveDocumentID != order[0] {
		t.Fatalf("close middle active = %+v", closed)
	}
	state, _ = service.GetState(context.Background())
	closed = service.CloseDocument(context.Background(), order[0], state.Snapshot.TabSetRevision)
	if closed.Error != nil || closed.ActiveDocumentID != "" || closed.ActiveBuffer != nil {
		t.Fatalf("close final = %+v", closed)
	}
	state, _ = service.GetState(context.Background())
	if state.Snapshot.ActiveDocumentID != "" || state.ActiveBuffer != nil || len(state.Snapshot.OrderedDocumentIDs) != 0 {
		t.Fatalf("final close state = %+v", state)
	}
}

func autosaveTimerCount(service *AppModelService, documentID string) int {
	service.mu.RLock()
	defer service.mu.RUnlock()
	if document := service.state.documents[documentID]; document != nil && document.autosave != nil {
		return 1
	}
	return 0
}

// Proves: FR-FT-024 — the clause that a pending working-copy flush "MUST
// complete successfully before the document is removed", and that the resulting
// clean close does not prompt. The dirty-with-no-autosave case still routes to a
// close plan and is proved in close_plan_test.go.
//
// CloseDocument evaluated Dirty before flushing anything, so a tab with an
// autosave debounce still pending was refused with "prepare a close plan first"
// — a prompt for work the application had already accepted and was about to
// write. PrepareClose has always flushed first for exactly this reason.
func TestClosingATabFlushesItsPendingAutosaveInsteadOfPrompting(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, clock)
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "edited\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	if clock.Pending() != 1 {
		t.Fatalf("pending debounce = %d, want 1", clock.Pending())
	}

	outcome := service.CloseDocument(context.Background(), documentID, serviceTabRevision(t, service))

	if outcome.Error != nil {
		t.Fatalf("CloseDocument on a tab with a pending autosave = %+v, want a silent close", outcome.Error)
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file after close: %v", err)
	}
	if string(disk) != "edited\n" {
		t.Fatalf("file after close = %q, want the pending working copy %q", disk, "edited\n")
	}
}

// Proves: FR-FT-024 — the clause that the document is removed only after its
// accepted work is resolved, here as the invariant that no autosave timer may
// outlive the document it names.
//
// closeDocuments deleted the document from state without cancelling its debounce,
// leaving an entry in service.autosaveTimers keyed by an id that no longer
// resolves. This exercises closeDocuments directly because it is the shared
// removal primitive behind both CloseDocument and ExecuteClosePlan, and the
// invariant belongs to it rather than to either caller.
func TestClosingDocumentsCancelsTheirAutosaveTimers(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, clock)
	_, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "edited\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	if autosaveTimerCount(service, documentID) != 1 {
		t.Fatal("no autosave timer scheduled for the edited document")
	}

	if result := service.closeDocuments(context.Background(), []string{documentID}, nil); result.Error != nil {
		t.Fatalf("closeDocuments: %+v", result.Error)
	}

	if leaked := autosaveTimerCount(service, documentID); leaked != 0 {
		t.Fatalf("autosave timer entries for the removed document = %d, want 0", leaked)
	}
}

// Proves: FR-FT-024 — the clause that the flush must *complete*. A flush that
// never returns does not satisfy "MUST complete successfully"; it hangs the
// close instead.
//
// flushAutosaveMode loops until the debounce is claimed, but runAutosave declines
// a document that is no longer autosave-eligible and leaves the entry in place
// when it does, so the loop re-read an unchanged entry forever. It is reachable
// today from PrepareClose: edit a document, have its file disappear so the
// document detaches, then close the window.
func TestFlushingForCloseTerminatesWhenTheDocumentBecameIneligible(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, clock)
	_, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "edited\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	setAutosaveDocumentFlags(service, documentID, true, file.CapabilityWritable)

	returned := make(chan struct{})
	go func() {
		service.flushAutosaveForClose(documentID)
		close(returned)
	}()

	select {
	case <-returned:
	case <-time.After(5 * time.Second):
		t.Fatal("flushAutosaveForClose did not return within 5s: the debounce it cannot run is never cancelled, so the close spins forever")
	}
	if leaked := autosaveTimerCount(service, documentID); leaked != 0 {
		t.Fatalf("autosave timer entries after an unrunnable flush = %d, want 0", leaked)
	}
}
