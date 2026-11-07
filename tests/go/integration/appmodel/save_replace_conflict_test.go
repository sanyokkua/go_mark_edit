package appmodel_test

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// replaceAfterExternalChange runs the real atomic replacement, letting another
// program change the target once just after the save's own disk check.
func replaceAfterExternalChange(change func()) WriteExecutor {
	var once sync.Once
	return func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		once.Do(change)
		replaced, err := file.AtomicReplace(file.AtomicReplaceRequest{
			TargetPath: snapshot.TargetPath, Data: snapshot.EncodedData,
			ExpectedVersion: snapshot.ExpectedDiskVersion, ExpectedRawHash: snapshot.ExpectedRawHash,
		})
		return replaced.Version, err
	}
}

func TestSaveThatMeetsAnExternalEditDuringReplacementReturnsTheComparison(t *testing.T) {
	ctx := context.Background()
	var path string
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}, WriteExecutor: replaceAfterExternalChange(func() {
		if err := os.WriteFile(path, []byte("external\n"), 0o640); err != nil {
			t.Errorf("external edit: %v", err)
		}
	})})
	path, id := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(ctx, id, "mine\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}

	result := service.Save(ctx, id, contentRevision(t, service, id), "")

	if result.Status != apperr.WriteStatusConflict || result.Conflict == nil || result.Conflict.OnDisk.Text != "external\n" || result.Conflict.Yours.Text != "mine\n" {
		t.Fatalf("Save = %+v, want a comparison with the external edit", result)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if !state.Snapshot.Documents[id].ConflictBlocked {
		t.Fatal("the document is not marked as having an external change")
	}
	disk, err := os.ReadFile(path)
	if err != nil || string(disk) != "external\n" {
		t.Fatalf("disk = %q, %v; want the external edit kept", disk, err)
	}
}

func TestSaveThatMeetsATimestampOnlyTouchDuringReplacementCommits(t *testing.T) {
	ctx := context.Background()
	var path string
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}, WriteExecutor: replaceAfterExternalChange(func() {
		later := time.Now().Add(time.Hour)
		if err := os.Chtimes(path, later, later); err != nil {
			t.Errorf("touch: %v", err)
		}
	})})
	path, id := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(ctx, id, "mine\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}

	result := service.Save(ctx, id, contentRevision(t, service, id), "")

	if result.Status != apperr.WriteStatusCommitted || result.Error != nil {
		t.Fatalf("Save = %+v, want committed", result)
	}
	disk, err := os.ReadFile(path)
	if err != nil || string(disk) != "mine\n" {
		t.Fatalf("disk = %q, %v; want the buffer", disk, err)
	}
}

// keepMineSave prepares an external edit the user chose to overwrite with
// Keep mine and returns the save's revision and authorization token.
func keepMineSave(t *testing.T, service *AppModelService, path, id string) (uint64, string) {
	t.Helper()
	ctx := context.Background()
	if err := service.UpdateBuffer(ctx, id, "mine\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	if err := os.WriteFile(path, []byte("external\n"), 0o640); err != nil {
		t.Fatalf("external edit: %v", err)
	}
	detected := service.CheckExternalChanges(ctx, id)
	if detected.Preview == nil {
		t.Fatalf("CheckExternalChanges = %+v, want a comparison", detected)
	}
	authorized := service.AuthorizeKeepMine(ctx, id, detected.Preview.ContentRevision, path, detected.Preview.DetectedDiskVersion)
	if authorized.Status != apperr.ConflictStatusAuthorized || authorized.DecisionToken == "" {
		t.Fatalf("AuthorizeKeepMine = %+v, want an authorization", authorized)
	}
	return detected.Preview.ContentRevision, authorized.DecisionToken
}

func TestKeepMineSaveThatMeetsATimestampOnlyTouchDuringReplacementCommitsOnce(t *testing.T) {
	ctx := context.Background()
	var path string
	commits := 0
	replace := replaceAfterExternalChange(func() {
		later := time.Now().Add(time.Hour)
		if err := os.Chtimes(path, later, later); err != nil {
			t.Errorf("touch: %v", err)
		}
	})
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}, WriteExecutor: func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		version, err := replace(snapshot)
		if err == nil {
			commits++
		}
		return version, err
	}})
	path, id := openAutosaveDocument(t, service, "base\n")
	revision, token := keepMineSave(t, service, path, id)

	result := service.Save(ctx, id, revision, token)

	if result.Status != apperr.WriteStatusCommitted || result.Error != nil || result.Conflict != nil {
		t.Fatalf("Save = %+v, want committed", result)
	}
	if commits != 1 {
		t.Fatalf("committed replacements = %d, want 1", commits)
	}
	disk, err := os.ReadFile(path)
	if err != nil || string(disk) != "mine\n" {
		t.Fatalf("disk = %q, %v; want the kept text", disk, err)
	}
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if metadata := state.Snapshot.Documents[id]; metadata.ConflictBlocked || metadata.Dirty {
		t.Fatalf("metadata = %+v, want a clean document without an external change", metadata)
	}
}

func TestKeepMineSaveThatMeetsAnotherExternalEditDuringReplacementReturnsTheComparison(t *testing.T) {
	ctx := context.Background()
	var path string
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}, WriteExecutor: replaceAfterExternalChange(func() {
		if err := os.WriteFile(path, []byte("second external\n"), 0o640); err != nil {
			t.Errorf("external edit: %v", err)
		}
	})})
	path, id := openAutosaveDocument(t, service, "base\n")
	revision, token := keepMineSave(t, service, path, id)

	result := service.Save(ctx, id, revision, token)

	if result.Status != apperr.WriteStatusConflict || result.Conflict == nil || result.Conflict.OnDisk.Text != "second external\n" || result.Conflict.Yours.Text != "mine\n" {
		t.Fatalf("Save = %+v, want a comparison with the second external edit", result)
	}
	disk, err := os.ReadFile(path)
	if err != nil || string(disk) != "second external\n" {
		t.Fatalf("disk = %q, %v; want the second external edit kept", disk, err)
	}
}
