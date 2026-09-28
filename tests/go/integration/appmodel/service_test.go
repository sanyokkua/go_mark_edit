package appmodel_test

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestInitialStateContainsOneCleanUntitledDocument(t *testing.T) {
	service := NewAppModelServiceForHost(WithVersion("integration-version"))
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if state.Snapshot.ApplicationVersion != "integration-version" || len(state.Snapshot.OrderedDocumentIDs) != 1 || state.ActiveBuffer == nil {
		t.Fatalf("initial state = %+v, want version, one tab and active buffer", state)
	}
	document := state.Snapshot.Documents[state.Snapshot.ActiveDocumentID]
	if document.Title != "Untitled" || document.Path != "" || document.Dirty || document.Status != string(SaveStatusNotSaved) {
		t.Fatalf("initial document = %+v, want clean untitled metadata", document)
	}
	if state.ActiveBuffer.Content != "" || state.ActiveBuffer.DocumentID != document.DocumentID {
		t.Fatalf("initial buffer = %+v, want empty active document", state.ActiveBuffer)
	}
}

func TestDocumentCommandAndContentSeamsShareOneCoherentSnapshot(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	accessor := service.ContentAccessor()
	commands := service.DocumentCommands()
	before, err := accessor.SnapshotActive(context.Background())
	if err != nil {
		t.Fatalf("initial SnapshotActive: %v", err)
	}
	if err := commands.UpdateBuffer(context.Background(), before.DocumentID, "through the command seam\n"); err != nil {
		t.Fatalf("UpdateBuffer through command seam: %v", err)
	}
	after, err := accessor.SnapshotActive(context.Background())
	if err != nil {
		t.Fatalf("updated SnapshotActive: %v", err)
	}
	if after.DocumentID != before.DocumentID || after.Content != "through the command seam\n" || after.Revision <= before.Revision {
		t.Fatalf("active snapshot changed incoherently: before=%+v after=%+v", before, after)
	}
}

func TestStatePatchesAreRevisionedAndContainMetadataOnly(t *testing.T) {
	emitter := &recordingEmitter{}
	service := NewAppModelServiceForHost(WithEmitter(emitter))
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if err := service.UpdateBuffer(context.Background(), state.Snapshot.ActiveDocumentID, "metadata patch\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	patches := emitter.Patches()
	if len(patches) != 1 {
		t.Fatalf("emitted patches = %d, want one", len(patches))
	}
	patch := patches[0]
	if patch.Revision == 0 || patch.Documents == nil || patch.Documents.Upsert[state.Snapshot.ActiveDocumentID].Dirty == false {
		t.Fatalf("state patch = %+v, want revisioned dirty metadata", patch)
	}
	encoded, err := json.Marshal(patch)
	if err != nil {
		t.Fatalf("marshal state patch: %v", err)
	}
	if strings.Contains(string(encoded), "metadata patch") {
		t.Fatalf("state patch leaked source content: %s", encoded)
	}
}

func TestFailedStatePublicationRestoresThePriorProjection(t *testing.T) {
	service := NewAppModelServiceForHost()
	before, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("initial GetState: %v", err)
	}
	if err := service.UpdateBuffer(context.Background(), before.Snapshot.ActiveDocumentID, "must not publish"); err == nil {
		t.Fatal("UpdateBuffer succeeded without a state publisher")
	}
	after, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after rejected publication: %v", err)
	}
	if !reflect.DeepEqual(after, before) {
		t.Fatalf("publication failure changed state: before=%+v after=%+v", before, after)
	}
}

func TestDocumentViewRejectsHidingBothPanes(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	err = service.SetDocView(context.Background(), state.Snapshot.ActiveDocumentID, apperr.DocViewInput{
		Cursor: apperr.CursorPosition{Line: 1, Column: 1},
		Selection: apperr.SelectionRange{
			Start: apperr.CursorPosition{Line: 1, Column: 1},
			End:   apperr.CursorPosition{Line: 1, Column: 1},
		},
	})
	if err == nil {
		t.Fatal("SetDocView accepted two hidden panes")
	}
}
