package appmodel

import (
	"context"
	"testing"
)

func TestMoveTabOnePositionRequiresConfirmation(t *testing.T) {
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
	target := state.Snapshot.OrderedDocumentIDs[0]
	orderBefore := append([]string(nil), state.Snapshot.OrderedDocumentIDs...)
	result := service.ReorderDocument(context.Background(), target, 1, state.Snapshot.TabSetRevision)
	if result.Error != nil || result.Status != "reordered" {
		t.Fatalf("ReorderDocument = %+v", result)
	}
	if result.OrderedDocumentIDs[1] != target || result.ActiveDocumentID != state.Snapshot.ActiveDocumentID {
		t.Fatalf("reorder result = %+v", result)
	}
	if orderBefore[0] != target || result.TabSetRevision != state.Snapshot.TabSetRevision+1 {
		t.Fatalf("reorder transition = before=%v result=%+v", orderBefore, result)
	}
}

func TestMoveTabPastEdgeIsNoOpWithoutRevisionBump(t *testing.T) {
	emitter := &recordingEmitter{}
	service := NewAppModelService(emitter)
	state, _ := service.GetState(context.Background())
	created := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
	if created.Error != nil {
		t.Fatalf("NewDocument = %+v", created)
	}
	state, _ = service.GetState(context.Background())
	first := state.Snapshot.OrderedDocumentIDs[0]
	patches := len(emitter.patches)
	result := service.ReorderDocument(context.Background(), first, -1, state.Snapshot.TabSetRevision)
	if result.Error != nil || result.Status != "noop" || result.TabSetRevision != state.Snapshot.TabSetRevision {
		t.Fatalf("edge reorder = %+v, state=%+v", result, state.Snapshot)
	}
	after, _ := service.GetState(context.Background())
	if after.Snapshot.Revision != state.Snapshot.Revision || len(emitter.patches) != patches {
		t.Fatalf("edge reorder changed revision or emitted patch: before=%+v after=%+v", state.Snapshot, after.Snapshot)
	}
}
