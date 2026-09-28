package appmodel

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// AtomicReplace commits every write via rename-over-target, which gives the
// target path a new on-disk identity each save. document.identity must track
// that identity so a later Open of an unrelated file that receives the freed
// inode cannot be mistaken for this still-open document.
func TestSaveRefreshesDocumentIdentityAfterAtomicReplace(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}))
	ctx := context.Background()

	path := filepath.Join(t.TempDir(), "document.md")
	if err := os.WriteFile(path, []byte("disk\n"), 0o644); err != nil {
		t.Fatalf("write document: %v", err)
	}

	opened := service.OpenPath(ctx, path, 0)
	if opened.Status != OpenStatusOpened {
		t.Fatalf("OpenPath = %+v", opened)
	}

	if err := service.UpdateBuffer(ctx, opened.DocumentID, "edited\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	metadata := state.Snapshot.Documents[opened.DocumentID]
	if result := service.Save(ctx, opened.DocumentID, metadata.ContentRevision, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save = %+v", result)
	}

	onDisk, err := file.CanonicalizeDocumentPath(path)
	if err != nil {
		t.Fatalf("CanonicalizeDocumentPath: %v", err)
	}

	service.mu.RLock()
	savedIdentity := service.state.documents[opened.DocumentID].identity
	service.mu.RUnlock()

	if !savedIdentity.Equal(onDisk.Identity) {
		t.Fatalf("document identity after save = %+v, want current on-disk identity %+v", savedIdentity, onDisk.Identity)
	}
}
