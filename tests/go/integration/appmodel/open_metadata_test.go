package appmodel_test

import (
	"context"
	"os"
	"reflect"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestOpenPatchMetadataMatchesHydratedState(t *testing.T) {
	path := t.TempDir() + "/notes.md"
	if err := os.WriteFile(path, []byte("# notes\n"), 0o644); err != nil {
		t.Fatalf("write document: %v", err)
	}
	recorder := &statePatchRecorder{}
	service := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(recorder))

	opened := service.OpenPath(context.Background(), path, 0)
	if opened.Status != appmodel.OpenStatusOpened {
		t.Fatalf("OpenPath status = %q, error = %+v", opened.Status, opened.Error)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	metadata, ok := state.Snapshot.Documents[opened.DocumentID]
	if !ok {
		t.Fatalf("hydrated state does not contain %q", opened.DocumentID)
	}
	patch := recorder.last()
	if patch.Documents == nil {
		t.Fatal("Open did not publish a document patch")
	}
	published, ok := patch.Documents.Upsert[opened.DocumentID]
	if !ok {
		t.Fatalf("Open patch does not contain %q", opened.DocumentID)
	}
	if !reflect.DeepEqual(published, metadata) {
		t.Fatalf("Open patch metadata = %+v, hydrated metadata = %+v", published, metadata)
	}
	if published.Status == "" || published.Status == "unsaved-changes" {
		t.Fatalf("opened metadata status = %q, want a clean saved status", published.Status)
	}
}
