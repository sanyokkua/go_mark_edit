package appmodel

import (
	"context"
	"reflect"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
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
