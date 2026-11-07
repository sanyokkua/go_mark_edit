package appmodel_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

type keepMineFixture struct {
	service  *AppModelService
	path     string
	id       string
	revision uint64
	token    string
}

// authorizeKeepMineFixture edits a document, replaces its file externally and
// returns a Keep mine authorization for that external version.
func authorizeKeepMineFixture(t *testing.T, service *AppModelService, mine string) keepMineFixture {
	t.Helper()
	ctx := context.Background()
	path, id := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(ctx, id, mine); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}
	if err := os.WriteFile(path, []byte("external\n"), 0o640); err != nil {
		t.Fatalf("external replacement: %v", err)
	}
	detected := service.CheckExternalChanges(ctx, id)
	if detected.Preview == nil {
		t.Fatalf("CheckExternalChanges = %+v, want comparison", detected)
	}
	authorized := service.AuthorizeKeepMine(ctx, id, detected.Preview.ContentRevision, detected.Preview.Path, detected.Preview.DetectedDiskVersion)
	if authorized.Status != apperr.ConflictStatusAuthorized || authorized.DecisionToken == "" {
		t.Fatalf("AuthorizeKeepMine = %+v, want authorization", authorized)
	}
	return keepMineFixture{service: service, path: path, id: id, revision: detected.Preview.ContentRevision, token: authorized.DecisionToken}
}

func assertLaterSaveConflictsAndKeepsExternalFile(t *testing.T, fixture keepMineFixture, revision uint64) {
	t.Helper()
	saved := fixture.service.Save(context.Background(), fixture.id, revision, "")
	if saved.Status == apperr.WriteStatusCommitted || saved.Conflict == nil {
		t.Fatalf("Save without a new decision = %+v, want a comparison", saved)
	}
	disk, err := os.ReadFile(fixture.path)
	if err != nil || string(disk) != "external\n" {
		t.Fatalf("disk = %q, %v; want the external version kept", disk, err)
	}
}

func TestCancelledSaveAsAfterKeepMineLeavesTheExternalVersionUndecided(t *testing.T) {
	dialog := &saveDialogFixture{path: ""}
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), WithDialogs(nil, dialog), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	fixture := authorizeKeepMineFixture(t, service, "mine\n")

	cancelled := service.SaveAs(context.Background(), fixture.id, fixture.revision, fixture.token)
	if cancelled.Status != apperr.WriteStatusCancelled {
		t.Fatalf("SaveAs = %+v, want cancelled", cancelled)
	}

	assertLaterSaveConflictsAndKeepsExternalFile(t, fixture, fixture.revision)
}

func TestKeepMineSaveThatCannotBeEncodedLeavesTheExternalVersionUndecided(t *testing.T) {
	ctx := context.Background()
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	fixture := authorizeKeepMineFixture(t, service, "mine\x00\n")

	refused := service.Save(ctx, fixture.id, fixture.revision, fixture.token)
	if refused.Status == apperr.WriteStatusCommitted || refused.Error == nil || refused.Error.Category != apperr.ClassifiedUnsupportedInput {
		t.Fatalf("Save of unencodable content = %+v, want an encoding refusal", refused)
	}
	if err := service.UpdateBuffer(ctx, fixture.id, "mine\n"); err != nil {
		t.Fatalf("UpdateBuffer: %v", err)
	}

	assertLaterSaveConflictsAndKeepsExternalFile(t, fixture, fixture.revision+1)
}

func TestKeepMineSaveWhoseReplacementFailsLeavesTheExternalVersionUndecided(t *testing.T) {
	ctx := context.Background()
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	fixture := authorizeKeepMineFixture(t, service, "mine\n")
	directory := filepath.Dir(fixture.path)
	if err := os.Chmod(directory, 0o555); err != nil {
		t.Fatalf("make directory read-only: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(directory, 0o755) })

	refused := service.Save(ctx, fixture.id, fixture.revision, fixture.token)
	if refused.Status == apperr.WriteStatusCommitted {
		t.Fatalf("Save into a read-only directory = %+v, want a refusal", refused)
	}
	if err := os.Chmod(directory, 0o755); err != nil {
		t.Fatalf("restore directory permissions: %v", err)
	}

	assertLaterSaveConflictsAndKeepsExternalFile(t, fixture, fixture.revision)
}

func TestCancelledClosePlanAfterKeepMineLeavesTheExternalVersionUndecided(t *testing.T) {
	ctx := context.Background()
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	fixture := authorizeKeepMineFixture(t, service, "mine\n")
	state, err := service.GetState(ctx)
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	plan := service.PrepareClose(ctx, apperr.ClosePlanSingle, []string{fixture.id}, state.Snapshot.TabSetRevision)
	if plan.Error != nil || plan.Data == nil {
		t.Fatalf("PrepareClose = %+v", plan)
	}
	ready := service.ResolveClosePlan(ctx, plan.Data.ID, []apperr.ClosePlanDecision{{DocumentID: fixture.id, Choice: apperr.CloseChoiceSave, DecisionToken: fixture.token}})
	if ready.Data == nil || ready.Data.Status != apperr.ClosePlanReady {
		t.Fatalf("ResolveClosePlan with Keep mine = %+v, want ready", ready)
	}
	cancelled := service.ResolveClosePlan(ctx, plan.Data.ID, []apperr.ClosePlanDecision{{Choice: apperr.CloseChoiceCancel}})
	if cancelled.Error != nil {
		t.Fatalf("cancel close plan = %+v", cancelled)
	}

	assertLaterSaveConflictsAndKeepsExternalFile(t, fixture, fixture.revision)
}

func TestKeepMineSaveRetriedAfterAFailedReplacementStillWritesTheBuffer(t *testing.T) {
	ctx := context.Background()
	service := NewAppModelServiceForHost(WithEmitter(&recordingEmitter{}), AppModelOption{AutosaveTimer: &fakeAutosaveClock{}})
	fixture := authorizeKeepMineFixture(t, service, "mine\n")
	directory := filepath.Dir(fixture.path)
	if err := os.Chmod(directory, 0o555); err != nil {
		t.Fatalf("make directory read-only: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(directory, 0o755) })
	if refused := service.Save(ctx, fixture.id, fixture.revision, fixture.token); refused.Status == apperr.WriteStatusCommitted {
		t.Fatalf("Save into a read-only directory = %+v, want a refusal", refused)
	}
	if err := os.Chmod(directory, 0o755); err != nil {
		t.Fatalf("restore directory permissions: %v", err)
	}

	saved := service.Save(ctx, fixture.id, fixture.revision, fixture.token)
	if saved.Status != apperr.WriteStatusCommitted {
		t.Fatalf("retried Keep mine Save = %+v, want committed", saved)
	}
	disk, err := os.ReadFile(fixture.path)
	if err != nil || string(disk) != "mine\n" {
		t.Fatalf("disk = %q, %v; want the buffer", disk, err)
	}
}
