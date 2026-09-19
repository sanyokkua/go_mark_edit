package appmodel_test

import (
	"context"
	"os"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestExternalChangeCheckProvidesARevisionBoundPreview(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := os.WriteFile(path, []byte("external\n"), 0o640); err != nil {
		t.Fatalf("external replacement: %v", err)
	}

	checked := service.CheckExternalChanges(context.Background(), documentID)
	if checked.Status != apperr.ConflictStatusDetected || checked.Preview == nil {
		t.Fatalf("CheckExternalChanges = %+v, want a preview", checked)
	}
	preview := checked.Preview
	if preview.DocumentID != documentID || preview.ContentRevision != checked.DocumentRevision || preview.Path == "" || preview.OnDisk.Text != "external\n" || preview.Yours.Text != "base\n" {
		t.Fatalf("conflict preview = %+v, want identity, revision, path and bounded sides", preview)
	}

	skipped := service.SkipConflict(context.Background(), documentID, preview.ContentRevision, preview.DetectedDiskVersion)
	if skipped.Status != apperr.ConflictStatusSkipped || skipped.Error != nil {
		t.Fatalf("SkipConflict = %+v, want skipped", skipped)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after skip: %v", err)
	}
	if state.Snapshot.Documents[documentID].ConflictBlocked {
		t.Fatal("skipping a conflict left the document blocked")
	}
}

func TestReloadFromDiskReplacesTheBufferAndAdvancesItsRevision(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := os.WriteFile(path, []byte("reloaded\n"), 0o640); err != nil {
		t.Fatalf("external replacement: %v", err)
	}
	detected := service.CheckExternalChanges(context.Background(), documentID)
	if detected.Preview == nil {
		t.Fatalf("CheckExternalChanges = %+v, want preview", detected)
	}

	reloaded := service.ReloadFromDisk(context.Background(), documentID, detected.Preview.ContentRevision, detected.Preview.DetectedDiskVersion)
	if reloaded.Status != apperr.ConflictStatusReloaded || reloaded.ActiveBuffer == nil || reloaded.ActiveBuffer.Content != "reloaded\n" {
		t.Fatalf("ReloadFromDisk = %+v, want the external buffer", reloaded)
	}
	if reloaded.DocumentRevision <= detected.Preview.ContentRevision {
		t.Fatalf("reloaded revision = %d, want greater than detected %d", reloaded.DocumentRevision, detected.Preview.ContentRevision)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after reload: %v", err)
	}
	metadata := state.Snapshot.Documents[documentID]
	if metadata.Dirty || metadata.ConflictBlocked || metadata.Status != string(SaveStatusSaved) {
		t.Fatalf("reloaded metadata = %+v, want clean unblocked document", metadata)
	}
}

func TestMissingBackingFileBecomesADetachedDocument(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}))
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove backing file: %v", err)
	}

	result := service.CheckExternalChanges(context.Background(), documentID)
	if result.Status != apperr.ConflictStatusDetached || result.Error != nil {
		t.Fatalf("CheckExternalChanges after deletion = %+v, want detached", result)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after deletion: %v", err)
	}
	if !state.Snapshot.Documents[documentID].Detached {
		t.Fatal("missing backing file did not mark the document detached")
	}
}

func TestKeepMineAuthorizationIsSingleUseAndSavesTheCurrentBuffer(t *testing.T) {
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "mine\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	if err := os.WriteFile(path, []byte("external\n"), 0o640); err != nil {
		t.Fatalf("external replacement: %v", err)
	}
	detected := service.CheckExternalChanges(context.Background(), documentID)
	if detected.Preview == nil {
		t.Fatalf("CheckExternalChanges = %+v, want preview", detected)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before authorization: %v", err)
	}
	authorized := service.AuthorizeKeepMine(context.Background(), documentID, detected.Preview.ContentRevision, state.Snapshot.Documents[documentID].Path, detected.Preview.DetectedDiskVersion)
	if authorized.Status != apperr.ConflictStatusAuthorized || authorized.DecisionToken == "" {
		t.Fatalf("AuthorizeKeepMine = %+v, want one decision token", authorized)
	}

	saved := service.Save(context.Background(), documentID, detected.Preview.ContentRevision, authorized.DecisionToken)
	if saved.Status != apperr.WriteStatusCommitted {
		t.Fatalf("Save with keep-mine token = %+v, want committed", saved)
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read saved file: %v", err)
	}
	if string(disk) != "mine\n" {
		t.Fatalf("saved bytes = %q, want current buffer", disk)
	}
	if err := os.WriteFile(path, []byte("changed again\n"), 0o640); err != nil {
		t.Fatalf("second external replacement: %v", err)
	}
	secondDetected := service.CheckExternalChanges(context.Background(), documentID)
	if secondDetected.Preview == nil {
		t.Fatalf("second CheckExternalChanges = %+v, want preview", secondDetected)
	}
	second := service.Save(context.Background(), documentID, saved.Data.WrittenContentRevision, authorized.DecisionToken)
	if second.Status == apperr.WriteStatusCommitted {
		t.Fatal("reused keep-mine authorization committed a second write")
	}
}
