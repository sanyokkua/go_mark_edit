package appmodel_test

import (
	"context"
	"os"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestActivatingAndReorderingTabsReturnsTheAuthoritativeAcknowledgement(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("initial GetState: %v", err)
	}
	firstID := state.Snapshot.ActiveDocumentID
	created := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
	if created.Data == nil {
		t.Fatalf("NewDocument: %+v", created)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after NewDocument: %v", err)
	}
	activated := service.ActivateDocument(context.Background(), firstID, state.Snapshot.TabSetRevision)
	if activated.Data == nil || activated.Data.DocumentID != firstID || activated.Data.Content != "" {
		t.Fatalf("ActivateDocument = %+v, want active buffer acknowledgement", activated)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after activation: %v", err)
	}
	reordered := service.ReorderDocument(context.Background(), firstID, 1, state.Snapshot.TabSetRevision)
	if reordered.Status != apperr.TabTransitionReordered || len(reordered.OrderedDocumentIDs) != 2 || reordered.OrderedDocumentIDs[1] != firstID {
		t.Fatalf("ReorderDocument = %+v, want backend-confirmed order", reordered)
	}
}

func TestClosingAFileWithPendingAutosaveFlushesItBeforeRemoval(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: clock})
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "flushed on close\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	if clock.Pending() != 1 {
		t.Fatalf("pending autosave timers = %d, want one", clock.Pending())
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before close: %v", err)
	}
	closed := service.CloseDocument(context.Background(), documentID, state.Snapshot.TabSetRevision)
	if closed.Error != nil || closed.Status != apperr.TabTransitionClosed {
		t.Fatalf("CloseDocument = %+v, want closed after flush", closed)
	}
	disk, err := os.ReadFile(path)
	if err != nil || string(disk) != "flushed on close\n" {
		t.Fatalf("disk after close = %q, error=%v; want flushed buffer", disk, err)
	}
	if clock.Pending() != 0 {
		t.Fatalf("pending autosave after close = %d, want none", clock.Pending())
	}
}

func TestClosingTheFinalCleanTabLeavesAnExplicitlyEmptyState(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	closed := service.CloseDocument(context.Background(), state.Snapshot.ActiveDocumentID, state.Snapshot.TabSetRevision)
	if closed.Error != nil || closed.Status != apperr.TabTransitionClosed || closed.ActiveDocumentID != "" || closed.ActiveBuffer != nil {
		t.Fatalf("CloseDocument final tab = %+v, want empty acknowledgement", closed)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after final close: %v", err)
	}
	if len(state.Snapshot.OrderedDocumentIDs) != 0 || state.Snapshot.ActiveDocumentID != "" || state.ActiveBuffer != nil {
		t.Fatalf("final state = %+v, want no documents and no active buffer", state)
	}
}
