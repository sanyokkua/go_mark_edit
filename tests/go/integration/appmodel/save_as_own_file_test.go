package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

// editingSaveDialog returns a chosen path and, while it is open, lets another
// program change the document's file.
type editingSaveDialog struct {
	path      string
	whileOpen func()
}

func (dialog editingSaveDialog) ChooseSaveFile(context.Context, SaveDialogRequest) (string, error) {
	dialog.whileOpen()
	return dialog.path, nil
}

func (dialog editingSaveDialog) ConfirmOverwrite(context.Context, string) (bool, error) {
	return true, nil
}

func TestSaveAsOntoTheDocumentsOwnFileComparesAnExternalEditMadeWhileTheDialogWasOpen(t *testing.T) {
	for _, alias := range []string{"same path", "hardlink", "symlink"} {
		t.Run(alias, func(t *testing.T) {
			ctx := context.Background()
			dialog := &editingSaveDialog{}
			service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithDialogs(nil, dialog), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
			path, id := openAutosaveDocument(t, service, "base\n")
			dialog.path = path
			switch alias {
			case "hardlink":
				dialog.path = filepath.Join(filepath.Dir(path), "alias.md")
				if err := os.Link(path, dialog.path); err != nil {
					t.Fatalf("create hardlink: %v", err)
				}
			case "symlink":
				dialog.path = filepath.Join(filepath.Dir(path), "alias.md")
				if err := os.Symlink(path, dialog.path); err != nil {
					t.Skipf("symlinks unavailable: %v", err)
				}
			}
			dialog.whileOpen = func() {
				if err := os.WriteFile(path, []byte("external\n"), 0o640); err != nil {
					t.Errorf("external edit: %v", err)
				}
			}
			if err := service.UpdateBuffer(ctx, id, "mine\n"); err != nil {
				t.Fatalf("UpdateBuffer: %v", err)
			}

			result := service.SaveAs(ctx, id, contentRevision(t, service, id), "")

			if result.Status != apperr.WriteStatusConflict || result.Conflict == nil || result.Conflict.OnDisk.Text != "external\n" {
				t.Fatalf("SaveAs = %+v, want a comparison with the external edit", result)
			}
			disk, err := os.ReadFile(path)
			if err != nil || string(disk) != "external\n" {
				t.Fatalf("disk = %q, %v; want the external edit kept", disk, err)
			}
		})
	}
}

func TestSaveAsOntoTheDocumentsOwnFileIgnoresATimestampOnlyTouch(t *testing.T) {
	ctx := context.Background()
	dialog := &editingSaveDialog{}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithDialogs(nil, dialog), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, id := openAutosaveDocument(t, service, "base\n")
	dialog.path = path
	dialog.whileOpen = func() {
		later := time.Now().Add(time.Hour)
		if err := os.Chtimes(path, later, later); err != nil {
			t.Errorf("touch: %v", err)
		}
	}
	if err := service.UpdateBuffer(ctx, id, "mine\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}

	result := service.SaveAs(ctx, id, contentRevision(t, service, id), "")

	if result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("SaveAs = %+v, want committed", result)
	}
	disk, err := os.ReadFile(path)
	if err != nil || string(disk) != "mine\n" {
		t.Fatalf("disk = %q, %v; want the buffer", disk, err)
	}
}

func TestSaveAsOntoTheDocumentsOwnFileAfterKeepMineWritesTheBuffer(t *testing.T) {
	ctx := context.Background()
	dialog := &editingSaveDialog{whileOpen: func() {}}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithDialogs(nil, dialog), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	fixture := authorizeKeepMineFixture(t, service, "mine\n")
	dialog.path = fixture.path

	result := service.SaveAs(ctx, fixture.id, fixture.revision, fixture.token)

	if result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("SaveAs with Keep mine = %+v, want committed", result)
	}
	disk, err := os.ReadFile(fixture.path)
	if err != nil || string(disk) != "mine\n" {
		t.Fatalf("disk = %q, %v; want the buffer", disk, err)
	}
}

func contentRevision(t *testing.T, service *AppModelService, id string) uint64 {
	t.Helper()
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	return state.Snapshot.Documents[id].ContentRevision
}
