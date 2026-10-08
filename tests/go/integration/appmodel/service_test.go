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

func TestInitialStateContainsNoDocument(t *testing.T) {
	service := NewAppModelServiceForHost(WithVersion("integration-version"))
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if state.Snapshot.ApplicationVersion != "integration-version" || len(state.Snapshot.OrderedDocumentIDs) != 0 || len(state.Snapshot.Documents) != 0 || state.Snapshot.ActiveDocumentID != "" || state.ActiveBuffer != nil {
		t.Fatalf("initial state = %+v, want version, no tab, no active document and no buffer", state)
	}
}

func TestNewDocumentFromTheEmptyStartIsACleanUntitledDocument(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	documentID := newUntitledID(t, service)
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	document := state.Snapshot.Documents[documentID]
	if state.Snapshot.ActiveDocumentID != documentID || len(state.Snapshot.OrderedDocumentIDs) != 1 || state.ActiveBuffer == nil {
		t.Fatalf("state = %+v, want one tab and an active buffer", state)
	}
	if document.Title != "Untitled" || document.Path != "" || document.Dirty || document.Status != string(SaveStatusNotSaved) {
		t.Fatalf("document = %+v, want clean untitled metadata", document)
	}
	if state.ActiveBuffer.Content != "" || state.ActiveBuffer.DocumentID != documentID {
		t.Fatalf("buffer = %+v, want empty active document", state.ActiveBuffer)
	}
}

func TestDocumentCommandAndContentSeamsShareOneCoherentSnapshot(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	newUntitledID(t, service)
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
	documentID := newUntitledID(t, service)
	published := len(emitter.Patches())
	if err := service.UpdateBuffer(context.Background(), documentID, "metadata patch\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	patches := emitter.Patches()[published:]
	if len(patches) != 1 {
		t.Fatalf("emitted patches = %d, want one", len(patches))
	}
	patch := patches[0]
	if patch.Revision == 0 || patch.Documents == nil || patch.Documents.Upsert[documentID].Dirty == false {
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
