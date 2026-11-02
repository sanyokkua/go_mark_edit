package appmodel

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/db"
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

func TestCommittedDurabilityWarningTakesPrecedence(t *testing.T) {
	for _, failRecent := range []bool{false, true} {
		t.Run(fmt.Sprintf("recent=%v", failRecent), func(t *testing.T) {
			ctx := context.Background()
			directory := t.TempDir()
			database, err := db.Open(ctx, filepath.Join(directory, "settings.db"))
			if err != nil {
				t.Fatal(err)
			}
			service := NewAppModelServiceForHost(WithEmitter(&retentionEmitter{}), AppModelOption{RecentItemsRepository: NewSqliteRecentItemsRepository(database), WriteExecutor: func(snapshot WriteSnapshot) (file.DiskVersion, error) {
				replaced, err := file.AtomicReplace(file.AtomicReplaceRequest{TargetPath: snapshot.TargetPath, Data: snapshot.EncodedData, ExpectedVersion: snapshot.ExpectedDiskVersion})
				if err != nil {
					return replaced.Version, err
				}
				return replaced.Version, &committedWriteError{version: replaced.Version, err: errors.New("directory sync failed")}
			}})
			path := filepath.Join(directory, "notes.md")
			if err := os.WriteFile(path, []byte("original\n"), 0644); err != nil {
				t.Fatal(err)
			}
			opened := service.OpenPath(ctx, path, 0)
			if opened.Status != OpenStatusOpened {
				t.Fatalf("open = %+v", opened)
			}
			if err := service.UpdateBuffer(ctx, opened.DocumentID, "saved\n"); err != nil {
				t.Fatal(err)
			}
			if failRecent {
				if err := database.Close(); err != nil {
					t.Fatal(err)
				}
			} else {
				defer func() { _ = database.Close() }()
			}
			state, _ := service.GetState(ctx)
			result := service.Save(ctx, opened.DocumentID, state.Snapshot.Documents[opened.DocumentID].ContentRevision, "")
			if result.Status != apperr.WriteStatusCommitted || result.Error == nil || !strings.Contains(result.Error.Message, "confirmed on disk") {
				t.Fatalf("save = %+v, want durability warning", result)
			}
			got, err := os.ReadFile(path)
			if err != nil || string(got) != "saved\n" {
				t.Fatalf("disk = %q, %v", got, err)
			}
			state, _ = service.GetState(ctx)
			if state.Snapshot.Documents[opened.DocumentID].Dirty {
				t.Fatal("document remained dirty")
			}
		})
	}
}
