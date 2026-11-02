package appmodel_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestWriteProtectedOpenAndSaveAs(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "source.md")
	target := filepath.Join(dir, "copy.md")
	original := []byte("\xef\xbb\xbfone\r\ntwo\r\n")
	if err := os.WriteFile(source, original, 0444); err != nil {
		t.Fatal(err)
	}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}}, WithDialogs(nil, saveDialog{path: target, confirm: true}))
	state, _ := service.GetState(context.Background())
	opened := service.OpenPath(context.Background(), source, state.Snapshot.TabSetRevision)
	state, _ = service.GetState(context.Background())
	meta := state.Snapshot.Documents[opened.DocumentID]
	if meta.Capability != "write-protected-read-only" {
		t.Fatalf("capability = %q", meta.Capability)
	}
	if result := service.Save(context.Background(), opened.DocumentID, meta.ContentRevision, ""); result.Status != apperr.WriteStatusRefused {
		t.Fatalf("Save = %+v", result)
	}
	if result := service.SaveAs(context.Background(), opened.DocumentID, meta.ContentRevision, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("SaveAs = %+v", result)
	}
	got, err := os.ReadFile(target)
	if err != nil || string(got) != string(original) {
		t.Fatalf("copy = %q, %v", got, err)
	}
}

func TestSaveAsAfterProtectedConflictCancelPreservesUnsavedEdits(t *testing.T) {
	ctx := context.Background()
	target := filepath.Join(t.TempDir(), "copy.md")
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}}, WithDialogs(nil, saveDialog{path: target, confirm: true}))
	source, id := openAutosaveDocument(t, service, "original\n")
	if err := service.UpdateBuffer(ctx, id, "unsaved\n"); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(source, 0444); err != nil {
		t.Fatal(err)
	}
	state, _ := service.GetState(ctx)
	rev := state.Snapshot.Documents[id].ContentRevision
	conflict := service.CheckExternalChanges(ctx, id)
	if conflict.Preview == nil || !conflict.Preview.ReadOnly {
		t.Fatalf("protected conflict = %+v", conflict)
	}
	if result := service.AuthorizeKeepMine(ctx, id, rev, source, conflict.Preview.DetectedDiskVersion); result.Status != apperr.ConflictStatusRefused {
		t.Fatalf("Keep mine = %+v", result)
	}
	if result := service.CancelConflict(ctx, id, rev, conflict.Preview.DetectedDiskVersion); result.Status != apperr.ConflictStatusCancelled {
		t.Fatalf("Cancel = %+v", result)
	}
	if result := service.SaveAs(ctx, id, rev, ""); result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save As = %+v", result)
	}
	copied, err := os.ReadFile(target)
	if err != nil || string(copied) != "unsaved\n" {
		t.Fatalf("copy = %q, %v", copied, err)
	}
	original, err := os.ReadFile(source)
	if err != nil || string(original) != "original\n" {
		t.Fatalf("source = %q, %v", original, err)
	}
}

func TestProtectedSaveAsRejectsSourceAliases(t *testing.T) {
	for _, alias := range []string{"source", "symlink", "hardlink"} {
		t.Run(alias, func(t *testing.T) {
			dir := t.TempDir()
			source := filepath.Join(dir, "source.md")
			target := source
			if err := os.WriteFile(source, []byte("original\n"), 0444); err != nil {
				t.Fatal(err)
			}
			if alias == "symlink" {
				target = filepath.Join(dir, "link.md")
				if err := os.Symlink(source, target); err != nil {
					t.Fatal(err)
				}
			}
			if alias == "hardlink" {
				target = filepath.Join(dir, "link.md")
				if err := os.Link(source, target); err != nil {
					t.Fatal(err)
				}
			}
			service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithDialogs(nil, saveDialog{path: target, confirm: true}))
			state, _ := service.GetState(context.Background())
			opened := service.OpenPath(context.Background(), source, state.Snapshot.TabSetRevision)
			state, _ = service.GetState(context.Background())
			rev := state.Snapshot.Documents[opened.DocumentID].ContentRevision
			if result := service.SaveAs(context.Background(), opened.DocumentID, rev, ""); result.Status == apperr.WriteStatusCommitted {
				t.Fatalf("Save As = %+v", result)
			}
			got, err := os.ReadFile(source)
			if err != nil || string(got) != "original\n" {
				t.Fatalf("source = %q, %v", got, err)
			}
		})
	}
}

func TestProtectedReplacementCannotBeSaveAsTarget(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	source := filepath.Join(dir, "source.md")
	target := filepath.Join(dir, "alias.md")
	if err := os.WriteFile(source, []byte("base\n"), 0644); err != nil {
		t.Fatal(err)
	}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithDialogs(nil, saveDialog{path: target, confirm: true}))
	state, _ := service.GetState(ctx)
	opened := service.OpenPath(ctx, source, state.Snapshot.TabSetRevision)
	if err := service.UpdateBuffer(ctx, opened.DocumentID, "mine\n"); err != nil {
		t.Fatal(err)
	}
	replacement := filepath.Join(dir, "replacement.md")
	if err := os.WriteFile(replacement, []byte("external\n"), 0444); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(replacement, source); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(source, target); err != nil {
		t.Fatal(err)
	}
	state, _ = service.GetState(ctx)
	revision := state.Snapshot.Documents[opened.DocumentID].ContentRevision
	conflict := service.CheckExternalChanges(ctx, opened.DocumentID)
	if conflict.Preview == nil || !conflict.Preview.ReadOnly {
		t.Fatalf("protected conflict = %+v", conflict)
	}
	if result := service.CancelConflict(ctx, opened.DocumentID, revision, conflict.Preview.DetectedDiskVersion); result.Status != apperr.ConflictStatusCancelled {
		t.Fatalf("cancel = %+v", result)
	}
	result := service.SaveAs(ctx, opened.DocumentID, revision, "")
	if result.Status == apperr.WriteStatusCommitted {
		t.Fatalf("Save As = %+v", result)
	}
	got, err := os.ReadFile(source)
	if err != nil || string(got) != "external\n" {
		t.Fatalf("source = %q, %v", got, err)
	}
}

func TestProtectedMixedSaveAsRequiresNormalization(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	source := filepath.Join(dir, "source.md")
	target := filepath.Join(dir, "copy.md")
	original := "\xef\xbb\xbfa\r\nb\n"
	if err := os.WriteFile(source, []byte(original), 0444); err != nil {
		t.Fatal(err)
	}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithDialogs(nil, saveDialog{path: target}))
	state, _ := service.GetState(ctx)
	opened := service.OpenPath(ctx, source, state.Snapshot.TabSetRevision)
	state, _ = service.GetState(ctx)
	rev := state.Snapshot.Documents[opened.DocumentID].ContentRevision
	requested := service.SaveAs(ctx, opened.DocumentID, rev, "")
	if requested.Status != apperr.WriteStatusNeedsNormalization {
		t.Fatalf("normalization = %+v", requested)
	}
	saved := service.SaveAs(ctx, opened.DocumentID, rev, requested.DecisionToken)
	if saved.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save As = %+v", saved)
	}
	got, err := os.ReadFile(target)
	if err != nil || string(got) != "\xef\xbb\xbfa\r\nb\r\n" {
		t.Fatalf("copy = %q, %v", got, err)
	}
	got, err = os.ReadFile(source)
	if err != nil || string(got) != original {
		t.Fatalf("source = %q, %v", got, err)
	}
}

func TestReloadReclassifiesWritePermission(t *testing.T) {
	ctx := context.Background()
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	path, id := openAutosaveDocument(t, service, "original\n")
	for _, tc := range []struct {
		mode       os.FileMode
		capability string
	}{{0444, "write-protected-read-only"}, {0644, "writable"}} {
		if err := os.Chmod(path, tc.mode); err != nil {
			t.Fatal(err)
		}
		state, _ := service.GetState(ctx)
		rev := state.Snapshot.Documents[id].ContentRevision
		conflict := service.CheckExternalChanges(ctx, id)
		if conflict.Preview == nil {
			t.Fatalf("conflict = %+v", conflict)
		}
		if result := service.ReloadFromDisk(ctx, id, rev, conflict.Preview.DetectedDiskVersion); result.Status != apperr.ConflictStatusReloaded {
			t.Fatalf("reload = %+v", result)
		}
		state, _ = service.GetState(ctx)
		if got := state.Snapshot.Documents[id].Capability; got != tc.capability {
			t.Fatalf("capability = %q, want %q", got, tc.capability)
		}
	}
}

func TestWriteProtectedDocumentDoesNotScheduleAutosave(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "locked.md")
	if err := os.WriteFile(path, []byte("base\n"), 0444); err != nil {
		t.Fatal(err)
	}
	clock := &manualAutosaveFactory{}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: clock})
	state, _ := service.GetState(ctx)
	opened := service.OpenPath(ctx, path, state.Snapshot.TabSetRevision)
	_ = service.UpdateBuffer(ctx, opened.DocumentID, "attempted edit\n")
	if clock.fireNext() {
		t.Fatal("read-only document scheduled autosave")
	}
	got, err := os.ReadFile(path)
	if err != nil || string(got) != "base\n" {
		t.Fatalf("source = %q, %v", got, err)
	}
}

type protectingSaveDialog struct {
	source, target   string
	protectOnConfirm bool
}

func (d protectingSaveDialog) ChooseSaveFile(context.Context, SaveDialogRequest) (string, error) {
	if !d.protectOnConfirm {
		if err := os.Chmod(d.source, 0444); err != nil {
			return "", err
		}
	}
	return d.target, nil
}
func (d protectingSaveDialog) ConfirmOverwrite(context.Context, string) (bool, error) {
	if d.protectOnConfirm {
		if err := os.Chmod(d.source, 0444); err != nil {
			return false, err
		}
	}
	return true, nil
}

func TestSaveAsRejectsSourceProtectedDuringDialog(t *testing.T) {
	for _, onConfirm := range []bool{false, true} {
		t.Run(fmt.Sprintf("confirm=%v", onConfirm), func(t *testing.T) {
			ctx := context.Background()
			dir := t.TempDir()
			source := filepath.Join(dir, "source.md")
			alias := filepath.Join(dir, "alias.md")
			if err := os.WriteFile(source, []byte("original\n"), 0644); err != nil {
				t.Fatal(err)
			}
			if err := os.Link(source, alias); err != nil {
				t.Fatal(err)
			}
			service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithDialogs(nil, protectingSaveDialog{source: source, target: alias, protectOnConfirm: onConfirm}))
			state, _ := service.GetState(ctx)
			opened := service.OpenPath(ctx, source, state.Snapshot.TabSetRevision)
			if err := service.UpdateBuffer(ctx, opened.DocumentID, "mine\n"); err != nil {
				t.Fatal(err)
			}
			state, _ = service.GetState(ctx)
			result := service.SaveAs(ctx, opened.DocumentID, state.Snapshot.Documents[opened.DocumentID].ContentRevision, "")
			if result.Status != apperr.WriteStatusRefused || result.Category != apperr.ClassifiedPermissionDenied {
				t.Fatalf("Save As = %+v, want permission-denied refusal", result)
			}
			got, err := os.ReadFile(alias)
			if err != nil || string(got) != "original\n" {
				t.Fatalf("alias = %q, %v", got, err)
			}
		})
	}
}
