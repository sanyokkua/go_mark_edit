//go:build darwin || linux

package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestOpeningAHardLinkFocusesTheExistingDocument(t *testing.T) {
	directory := t.TempDir()
	original := filepath.Join(directory, "original.md")
	link := filepath.Join(directory, "alias.md")
	if err := os.WriteFile(original, []byte("same inode\n"), 0o644); err != nil {
		t.Fatalf("write original: %v", err)
	}
	if err := os.Link(original, link); err != nil {
		t.Fatalf("create hard link: %v", err)
	}
	service := appmodel.NewAppModelService(appmodel.WithEmitter(&statePatchRecorder{}))

	first := service.OpenPath(context.Background(), original, 0)
	if first.Status != appmodel.OpenStatusOpened {
		t.Fatalf("open original status = %q, error = %+v", first.Status, first.Error)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after original: %v", err)
	}
	second := service.OpenPath(context.Background(), link, state.Snapshot.TabSetRevision)
	if second.Status != appmodel.OpenStatusFocused {
		t.Fatalf("open hard link status = %q, error = %+v", second.Status, second.Error)
	}
	if second.DocumentID != first.DocumentID {
		t.Fatalf("hard link document id = %q, want existing id %q", second.DocumentID, first.DocumentID)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after hard link: %v", err)
	}
	if len(state.Snapshot.Documents) != 1 {
		t.Fatalf("document count after hard-link open = %d, want one focused file document", len(state.Snapshot.Documents))
	}
}
