package appmodel_test

import (
	"context"
	"testing"

	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestStatePublicationsRemainStrictlyRevisionOrdered(t *testing.T) {
	emitter := &recordingEmitter{}
	service := NewAppModelServiceForHost(WithEmitter(emitter))
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("initial GetState: %v", err)
	}
	created := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
	if created.Data == nil {
		t.Fatalf("NewDocument: %+v", created)
	}
	if err := service.UpdateBuffer(context.Background(), created.Data.DocumentID, "published metadata\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before reorder: %v", err)
	}
	if result := service.ReorderDocument(context.Background(), state.Snapshot.OrderedDocumentIDs[0], 1, state.Snapshot.TabSetRevision); result.Error != nil {
		t.Fatalf("ReorderDocument: %+v", result)
	}

	patches := emitter.Patches()
	if len(patches) != 3 {
		t.Fatalf("published patches = %d, want New, UpdateBuffer and reorder", len(patches))
	}
	for index, patch := range patches {
		if patch.Revision == 0 || (index > 0 && patch.Revision <= patches[index-1].Revision) {
			t.Fatalf("patch revisions = %+v, want strictly increasing", patches)
		}
	}
}
