package appmodel

import (
	"context"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// Proves: FR-FT-001 (partial — the "regardless of the default open mode" clause is unproven; T157)
func TestNewDocumentDefaultsAndNoWrite(t *testing.T) {
	emitter := &recordingEmitter{}
	service := NewEmptyAppModelService(emitter)
	before, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before New: %v", err)
	}

	outcome := service.NewDocument(context.Background(), before.Snapshot.TabSetRevision)
	if outcome.Error != nil {
		t.Fatalf("NewDocument error = %+v", outcome.Error)
	}
	if outcome.Data == nil {
		t.Fatal("NewDocument returned no active acknowledgement")
	}
	after, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after New: %v", err)
	}
	if len(after.Snapshot.Documents) != 1 || len(after.Snapshot.OrderedDocumentIDs) != 1 {
		t.Fatalf("New state = %+v, want one document and one ordered tab", after.Snapshot)
	}
	documentID := after.Snapshot.OrderedDocumentIDs[0]
	if outcome.Data.DocumentID != documentID || after.Snapshot.ActiveDocumentID != documentID {
		t.Fatalf("New acknowledgement/state identity = %q/%q, want %q", outcome.Data.DocumentID, after.Snapshot.ActiveDocumentID, documentID)
	}
	metadata := after.Snapshot.Documents[documentID]
	if metadata.Title != "Untitled" || metadata.DisplayName != "Untitled" || metadata.Path != "" {
		t.Fatalf("New metadata identity = %+v, want empty untitled path", metadata)
	}
	if metadata.Encoding != "utf-8" || metadata.BOM != "absent" || metadata.LineEnding != "lf" || metadata.Capability != "writable" {
		t.Fatalf("New file characteristics = %+v", metadata)
	}
	if metadata.Dirty || metadata.View.Arrangement != ArrangementEditor || !metadata.View.EditorVisible || metadata.View.PreviewVisible {
		t.Fatalf("New defaults = %+v, want clean Editor-only document", metadata)
	}
	if len(after.Snapshot.RecentFiles) != 0 || after.Snapshot.CanReopenLastFile {
		t.Fatalf("New changed recent state = %+v", after.Snapshot)
	}
	if outcome.Data.Content != "" || outcome.Data.DocumentRevision != metadata.ContentRevision || outcome.Data.ProjectionRevision != after.Snapshot.Revision {
		t.Fatalf("New acknowledgement = %+v, state revision=%d metadata revision=%d", outcome.Data, after.Snapshot.Revision, metadata.ContentRevision)
	}
	if len(emitter.patches) != 1 {
		t.Fatalf("New emitted %d patches, want one", len(emitter.patches))
	}
	patch := emitter.patches[0]
	if patch.Documents == nil || patch.Documents.Upsert[documentID].Path != "" || patch.ActiveDocument == nil || !patch.ActiveDocument.Present {
		t.Fatalf("New patch = %+v, want metadata/order/active transition", patch)
	}
}

func TestNewDocumentRefusesStaleOrFortyFirst(t *testing.T) {
	staleEmitter := &recordingEmitter{}
	staleService := NewEmptyAppModelService(staleEmitter)
	before, err := staleService.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before stale New: %v", err)
	}
	stale := staleService.NewDocument(context.Background(), before.Snapshot.TabSetRevision+1)
	if stale.Error == nil || stale.Error.Category != apperr.ClassifiedConflict {
		t.Fatalf("stale New error = %+v, want conflict", stale.Error)
	}
	if stale.Data != nil || len(staleEmitter.patches) != 0 {
		t.Fatalf("stale New mutated state or emitted a patch: %+v / %d", stale.Data, len(staleEmitter.patches))
	}

	emitter := &recordingEmitter{}
	service := NewEmptyAppModelService(emitter)
	for count := 0; count < maxOpenDocuments; count++ {
		state, stateErr := service.GetState(context.Background())
		if stateErr != nil {
			t.Fatalf("GetState at document %d: %v", count, stateErr)
		}
		outcome := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
		if outcome.Error != nil || outcome.Data == nil {
			t.Fatalf("New document %d = %+v", count+1, outcome)
		}
	}
	beforeFortyFirst, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before 41st New: %v", err)
	}
	patchesBefore := len(emitter.patches)
	fortyFirst := service.NewDocument(context.Background(), beforeFortyFirst.Snapshot.TabSetRevision)
	if fortyFirst.Error == nil || fortyFirst.Error.Category != apperr.ClassifiedCapacityLimit {
		t.Fatalf("41st New error = %+v, want capacity-limit", fortyFirst.Error)
	}
	if !strings.Contains(fortyFirst.Error.Message, "40") || fortyFirst.Data != nil {
		t.Fatalf("41st New error = %+v, want safe message naming 40", fortyFirst.Error)
	}
	afterFortyFirst, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after 41st New: %v", err)
	}
	if len(afterFortyFirst.Snapshot.Documents) != maxOpenDocuments || len(afterFortyFirst.Snapshot.OrderedDocumentIDs) != maxOpenDocuments || len(emitter.patches) != patchesBefore {
		t.Fatalf("41st New changed state: documents=%d order=%d patches=%d", len(afterFortyFirst.Snapshot.Documents), len(afterFortyFirst.Snapshot.OrderedDocumentIDs), len(emitter.patches))
	}
}
