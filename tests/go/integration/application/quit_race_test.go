package application_test

import (
	"context"
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestReviewDeadlineAfterQuitPlanRemovalPreservesTabsOnCancel(t *testing.T) {
	ctx := context.Background()
	clock := &shutdownClock{now: time.Unix(1200, 0)}
	model := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingLifecycleEmitter{}))
	model.SetAutosaveEnabled(false)
	path := filepath.Join(t.TempDir(), "draft.md")
	if err := os.WriteFile(path, []byte("base\n"), 0644); err != nil {
		t.Fatal(err)
	}
	state, _ := model.GetState(ctx)
	opened := model.OpenPath(ctx, path, state.Snapshot.TabSetRevision)
	if opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("open: %+v", opened)
	}
	if err := model.UpdateBuffer(ctx, opened.DocumentID, "unsaved latest\n"); err != nil {
		t.Fatal(err)
	}
	prompt := make(chan struct{}, 1)
	answer := make(chan bool, 1)
	owner := application.NewShutdownOwner(model, application.ShutdownOption{Clock: clock}, application.WithNativeConfirmation(func(context.Context, []string, bool) (bool, error) { prompt <- struct{}{}; return <-answer, nil }))
	owner.WindowReady(ctx)
	owner.BeforeClose(ctx)
	state, _ = model.GetState(ctx)
	plan := model.PrepareClose(ctx, apperr.ClosePlanQuit, nil, state.Snapshot.TabSetRevision)
	if plan.Error != nil || plan.Data == nil {
		t.Fatalf("prepare: %+v", plan)
	}
	resolved := model.ResolveClosePlan(ctx, plan.Data.ID, []apperr.ClosePlanDecision{{DocumentID: opened.DocumentID, Choice: apperr.CloseChoiceDiscard}})
	if resolved.Error != nil || resolved.Data == nil || resolved.Data.Status != apperr.ClosePlanReady {
		t.Fatalf("resolve: %+v", resolved)
	}
	result := model.ExecuteClosePlan(ctx, plan.Data.ID)
	if result.Error != nil || result.Status != apperr.TabTransitionNoop {
		t.Fatalf("execute: %+v", result)
	}
	// The browser is now waiting for ExecuteClosePlan's response or the subsequent
	// getState (useCloseWorkflow.ts:230), so AuthorizeQuit has not been called.
	clock.fire(10 * time.Second)
	select {
	case <-prompt:
	case <-time.After(time.Second):
		t.Fatal("native prompt not shown")
	}
	answer <- false
	waitForShutdownState(t, owner, application.ShutdownIdle, "native Cancel")
	state, _ = model.GetState(ctx)
	if doc, ok := state.Snapshot.Documents[opened.DocumentID]; !ok || !doc.Dirty || len(state.Snapshot.OrderedDocumentIDs) != 1 || state.Snapshot.OrderedDocumentIDs[0] != opened.DocumentID || state.ActiveBuffer == nil || state.ActiveBuffer.Content != "unsaved latest\n" {
		t.Fatalf("native Cancel lost unsaved state: %+v", state)
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "base\n" {
		t.Fatalf("file = %q, %v", data, err)
	}
}

func TestQuitAuthorizationRequiresCurrentCompletedPlan(t *testing.T) {
	for _, tc := range []string{"missing", "incomplete", "edited", "wrong-id", "completed"} {
		t.Run(tc, func(t *testing.T) { checkQuitAuthorization(t, tc) })
	}
}

func checkQuitAuthorization(t *testing.T, tc string) {
	t.Helper()
	ctx := context.Background()
	model := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingLifecycleEmitter{}))
	model.SetAutosaveEnabled(false)
	path := filepath.Join(t.TempDir(), "draft.md")
	if err := os.WriteFile(path, []byte("base\n"), 0644); err != nil {
		t.Fatal(err)
	}
	state, _ := model.GetState(ctx)
	opened := model.OpenPath(ctx, path, state.Snapshot.TabSetRevision)
	if err := model.UpdateBuffer(ctx, opened.DocumentID, "draft\n"); err != nil {
		t.Fatal(err)
	}
	quit := 0
	owner := application.NewShutdownOwner(model, application.WithNativeQuit(func(context.Context) { quit++ }))
	owner.WindowReady(ctx)
	owner.BeforeClose(ctx)
	id := owner.Snapshot().Request.ID
	prepareAuthorizationCase(t, model, opened.DocumentID, tc)
	if tc == "wrong-id" {
		id = "wrong"
	}
	refusal := owner.AuthorizeQuit(ctx, id)
	if tc != "completed" {
		if refusal == nil || quit != 0 {
			t.Fatalf("refusal = %+v, quit = %d", refusal, quit)
		}
		return
	}
	if refusal != nil || quit != 1 {
		t.Fatalf("refusal = %+v, quit = %d", refusal, quit)
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "base\n" {
		t.Fatalf("file = %q, %v", data, err)
	}
}

func prepareAuthorizationCase(t *testing.T, model *appmodel.AppModelService, id, tc string) {
	t.Helper()
	if tc == "missing" {
		return
	}
	ctx := context.Background()
	state, _ := model.GetState(ctx)
	plan := model.PrepareClose(ctx, apperr.ClosePlanQuit, nil, state.Snapshot.TabSetRevision)
	if plan.Error != nil || plan.Data == nil {
		t.Fatalf("prepare = %+v", plan)
	}
	if tc == "incomplete" {
		return
	}
	resolved := model.ResolveClosePlan(ctx, plan.Data.ID, []apperr.ClosePlanDecision{{DocumentID: id, Choice: apperr.CloseChoiceDiscard}})
	if resolved.Error != nil {
		t.Fatalf("resolve = %+v", resolved)
	}
	if result := model.ExecuteClosePlan(ctx, plan.Data.ID); result.Error != nil || result.Status != apperr.TabTransitionNoop {
		t.Fatalf("execute = %+v", result)
	}
	if tc == "edited" {
		if err := model.UpdateBuffer(ctx, id, "later\n"); err != nil {
			t.Fatal(err)
		}
	}
}

func TestPreparedQuitFencesMutationsUntilDrainEnds(t *testing.T) {
	ctx := context.Background()
	model := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingLifecycleEmitter{}))
	model.SetAutosaveEnabled(false)
	state, _ := model.GetState(ctx)
	created := model.NewDocument(ctx, state.Snapshot.TabSetRevision)
	if created.Error != nil || created.Data == nil {
		t.Fatalf("new = %+v", created)
	}
	id := created.Data.DocumentID
	if err := model.UpdateBuffer(ctx, id, "before"); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "other.md")
	if err := os.WriteFile(path, []byte("other"), 0644); err != nil {
		t.Fatal(err)
	}
	state, _ = model.GetState(ctx)
	preparedOpen, openErr := model.PrepareOpen(ctx, path, state.Snapshot.TabSetRevision)
	if openErr != nil {
		t.Fatal(openErr)
	}
	model.SetPendingClose(apperr.PendingClose{ID: "quit", Owner: apperr.PendingCloseOwnerFrontend})
	state, _ = model.GetState(ctx)
	plan := model.PrepareClose(ctx, apperr.ClosePlanQuit, nil, state.Snapshot.TabSetRevision)
	resolved := model.ResolveClosePlan(ctx, plan.Data.ID, []apperr.ClosePlanDecision{{DocumentID: id, Choice: apperr.CloseChoiceDiscard}})
	if resolved.Error != nil {
		t.Fatalf("resolve = %+v", resolved)
	}
	if result := model.ExecuteClosePlan(ctx, plan.Data.ID); result.Error != nil {
		t.Fatalf("execute = %+v", result)
	}
	if refusal := model.ClaimPreparedQuit("quit"); refusal != nil {
		t.Fatal(refusal)
	}
	if err := model.UpdateBuffer(ctx, id, "after"); err == nil {
		t.Fatal("edit accepted after quit authorization")
	}
	if result := model.NewDocument(ctx, state.Snapshot.TabSetRevision); result.Error == nil {
		t.Fatal("new tab accepted after quit authorization")
	}
	if result := model.CommitPreparedOpen(ctx, preparedOpen.ReservationID); result.Error == nil {
		t.Fatal("prepared open accepted after quit authorization")
	}
	model.EndShutdownDrain()
	model.ClearPendingClose("quit")
	if err := model.UpdateBuffer(ctx, id, "after"); err != nil {
		t.Fatalf("edit after release: %v", err)
	}
	if result := model.NewDocument(ctx, state.Snapshot.TabSetRevision); result.Error != nil {
		t.Fatalf("new tab after release: %+v", result)
	}
}

type failingPreparedQuitDrain struct {
	*appmodel.AppModelService
	entered, release chan struct{}
}

func (m *failingPreparedQuitDrain) DrainDiscardBeforeClose() *apperr.ClassifiedError {
	close(m.entered)
	<-m.release
	return &apperr.ClassifiedError{Category: apperr.ClassifiedIOFailure, Message: "drain failed"}
}

func TestPreparedQuitDrainFailureReleasesMutationFence(t *testing.T) {
	ctx := context.Background()
	model := &failingPreparedQuitDrain{AppModelService: appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingLifecycleEmitter{})), entered: make(chan struct{}), release: make(chan struct{})}
	model.SetAutosaveEnabled(false)
	state, _ := model.GetState(ctx)
	created := model.NewDocument(ctx, state.Snapshot.TabSetRevision)
	id := created.Data.DocumentID
	if err := model.UpdateBuffer(ctx, id, "draft"); err != nil {
		t.Fatal(err)
	}
	owner := application.NewShutdownOwner(model)
	owner.WindowReady(ctx)
	owner.BeforeClose(ctx)
	closeID := owner.Snapshot().Request.ID
	state, _ = model.GetState(ctx)
	plan := model.PrepareClose(ctx, apperr.ClosePlanQuit, nil, state.Snapshot.TabSetRevision)
	resolved := model.ResolveClosePlan(ctx, plan.Data.ID, []apperr.ClosePlanDecision{{DocumentID: id, Choice: apperr.CloseChoiceDiscard}})
	if resolved.Error != nil {
		t.Fatal(resolved.Error)
	}
	if result := model.ExecuteClosePlan(ctx, plan.Data.ID); result.Error != nil {
		t.Fatal(result.Error)
	}
	result := make(chan *apperr.ClassifiedError, 1)
	go func() { result <- owner.AuthorizeQuit(ctx, closeID) }()
	<-model.entered
	if err := model.UpdateBuffer(ctx, id, "later"); err == nil {
		t.Fatal("edit accepted during prepared quit drain")
	}
	close(model.release)
	if refusal := <-result; refusal == nil {
		t.Fatal("failed drain accepted")
	}
	if err := model.UpdateBuffer(ctx, id, "later"); err != nil {
		t.Fatalf("edit after drain failure: %v", err)
	}
	if refusal := owner.CancelQuit(ctx, closeID); refusal != nil {
		t.Fatal(refusal)
	}
}

func TestPreparedQuitRejectsDocumentDetachedBeforeAuthorization(t *testing.T) {
	ctx := context.Background()
	model := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingLifecycleEmitter{}))
	path := filepath.Join(t.TempDir(), "draft.md")
	if err := os.WriteFile(path, []byte("base"), 0644); err != nil {
		t.Fatal(err)
	}
	state, _ := model.GetState(ctx)
	opened := model.OpenPath(ctx, path, state.Snapshot.TabSetRevision)
	model.SetPendingClose(apperr.PendingClose{ID: "quit", Owner: apperr.PendingCloseOwnerFrontend})
	state, _ = model.GetState(ctx)
	plan := model.PrepareClose(ctx, apperr.ClosePlanQuit, nil, state.Snapshot.TabSetRevision)
	if result := model.ExecuteClosePlan(ctx, plan.Data.ID); result.Error != nil {
		t.Fatal(result.Error)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if result := model.CheckExternalChanges(ctx, opened.DocumentID); result.Status != apperr.ConflictStatusDetached {
		t.Fatalf("check = %+v", result)
	}
	if refusal := model.ClaimPreparedQuit("quit"); refusal == nil {
		t.Fatal("accepted clean plan after document became detached")
	}
}

func TestQuitPlanRejectsDetachBeforeExecution(t *testing.T) {
	ctx := context.Background()
	model := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingLifecycleEmitter{}))
	path := filepath.Join(t.TempDir(), "draft.md")
	if err := os.WriteFile(path, []byte("base"), 0644); err != nil {
		t.Fatal(err)
	}
	state, _ := model.GetState(ctx)
	opened := model.OpenPath(ctx, path, state.Snapshot.TabSetRevision)
	model.SetPendingClose(apperr.PendingClose{ID: "quit", Owner: apperr.PendingCloseOwnerFrontend})
	state, _ = model.GetState(ctx)
	plan := model.PrepareClose(ctx, apperr.ClosePlanQuit, nil, state.Snapshot.TabSetRevision)
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if result := model.CheckExternalChanges(ctx, opened.DocumentID); result.Status != apperr.ConflictStatusDetached {
		t.Fatalf("check = %+v", result)
	}
	if result := model.ExecuteClosePlan(ctx, plan.Data.ID); result.Error == nil {
		t.Fatalf("executed stale plan: %+v", result)
	}
}

func TestPreparedQuitFenceRefusesExternalDetach(t *testing.T) {
	ctx := context.Background()
	model := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingLifecycleEmitter{}))
	path := filepath.Join(t.TempDir(), "draft.md")
	if err := os.WriteFile(path, []byte("base"), 0644); err != nil {
		t.Fatal(err)
	}
	state, _ := model.GetState(ctx)
	opened := model.OpenPath(ctx, path, state.Snapshot.TabSetRevision)
	model.SetPendingClose(apperr.PendingClose{ID: "quit", Owner: apperr.PendingCloseOwnerFrontend})
	state, _ = model.GetState(ctx)
	plan := model.PrepareClose(ctx, apperr.ClosePlanQuit, nil, state.Snapshot.TabSetRevision)
	if result := model.ExecuteClosePlan(ctx, plan.Data.ID); result.Error != nil {
		t.Fatal(result.Error)
	}
	if refusal := model.ClaimPreparedQuit("quit"); refusal != nil {
		t.Fatal(refusal)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	model.CheckExternalChanges(ctx, opened.DocumentID)
	state, _ = model.GetState(ctx)
	if state.Snapshot.Documents[opened.DocumentID].Dirty {
		t.Fatal("external check mutated document during prepared quit")
	}
	model.EndShutdownDrain()
	model.ClearPendingClose("quit")
	if result := model.CheckExternalChanges(ctx, opened.DocumentID); result.Status != apperr.ConflictStatusDetached {
		t.Fatalf("check after release = %+v", result)
	}
}

func TestPreparedQuitSavedDocumentUsesPostSaveProof(t *testing.T) {
	for _, detach := range []bool{false, true} {
		t.Run(map[bool]string{false: "saved", true: "detached after save"}[detach], func(t *testing.T) {
			checkPreparedQuitSavedDocument(t, detach)
		})
	}
}

func checkPreparedQuitSavedDocument(t *testing.T, detach bool) {
	t.Helper()
	ctx := context.Background()
	model := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingLifecycleEmitter{}))
	model.SetAutosaveEnabled(false)
	path := filepath.Join(t.TempDir(), "draft.md")
	if err := os.WriteFile(path, []byte("base"), 0644); err != nil {
		t.Fatal(err)
	}
	state, _ := model.GetState(ctx)
	opened := model.OpenPath(ctx, path, state.Snapshot.TabSetRevision)
	if err := model.UpdateBuffer(ctx, opened.DocumentID, "saved text"); err != nil {
		t.Fatal(err)
	}
	model.SetPendingClose(apperr.PendingClose{ID: "quit", Owner: apperr.PendingCloseOwnerFrontend})
	state, _ = model.GetState(ctx)
	plan := model.PrepareClose(ctx, apperr.ClosePlanQuit, nil, state.Snapshot.TabSetRevision)
	resolved := model.ResolveClosePlan(ctx, plan.Data.ID, []apperr.ClosePlanDecision{{DocumentID: opened.DocumentID, Choice: apperr.CloseChoiceSave}})
	if resolved.Error != nil {
		t.Fatal(resolved.Error)
	}
	result := model.ExecuteClosePlan(ctx, plan.Data.ID)
	if result.Error != nil || result.Status != apperr.TabTransitionNoop {
		t.Fatalf("execute = %+v", result)
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "saved text" {
		t.Fatalf("file = %q, %v", data, err)
	}
	if detach {
		if err := os.Remove(path); err != nil {
			t.Fatal(err)
		}
		if result := model.CheckExternalChanges(ctx, opened.DocumentID); result.Status != apperr.ConflictStatusDetached {
			t.Fatalf("check = %+v", result)
		}
	}
	refusal := model.ClaimPreparedQuit("quit")
	if (refusal != nil) != detach {
		t.Fatalf("claim refusal = %+v, detached = %v", refusal, detach)
	}
}
