package appmodel

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestClosePlanCompletenessAndCancel(t *testing.T) {
	clock := &fakeAutosaveClock{}
	emitter := &recordingEmitter{}
	service := NewAppModelServiceWithAutosaveTimer(emitter, clock)
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "edited\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	service.SetAutosaveEnabled(false)
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read before close plan: %v", err)
	}
	state, _ := service.GetState(context.Background())
	plan := service.PrepareClose(context.Background(), apperr.ClosePlanRight, []string{documentID}, state.Snapshot.TabSetRevision)
	if plan.Error != nil || plan.Data == nil || plan.Data.Status != apperr.ClosePlanCollecting || len(plan.Data.DirtyTargetIDs) != 1 {
		t.Fatalf("PrepareClose = %+v, want complete dirty target list", plan)
	}
	missing := service.ResolveClosePlan(context.Background(), plan.Data.ID, nil)
	if missing.Error != nil || missing.Data == nil || missing.Data.Status != apperr.ClosePlanCollecting {
		t.Fatalf("incomplete ResolveClosePlan = %+v, want collecting without side effects", missing)
	}
	cancelled := service.ResolveClosePlan(context.Background(), plan.Data.ID, []apperr.ClosePlanDecision{{Choice: apperr.CloseChoiceCancel}})
	if cancelled.Error != nil || cancelled.Data == nil || cancelled.Data.Status != apperr.ClosePlanCancelled {
		t.Fatalf("cancelled ResolveClosePlan = %+v", cancelled)
	}
	state, _ = service.GetState(context.Background())
	if _, ok := state.Snapshot.Documents[documentID]; !ok {
		t.Fatal("cancelled close removed the document")
	}
	after, _ := os.ReadFile(path)
	if string(after) != string(before) {
		t.Fatalf("cancelled close changed disk from %q to %q", before, after)
	}
}

func TestClosePlanSaveOrderAndFailure(t *testing.T) {
	service := NewAppModelService(&recordingEmitter{})
	firstPath, firstID := openAutosaveDocument(t, service, "first base\n")
	secondPath, secondID := openAutosaveDocument(t, service, "second base\n")
	if err := service.UpdateBuffer(context.Background(), firstID, "first edited\n"); err != nil {
		t.Fatalf("first edit: %v", err)
	}
	if err := service.UpdateBuffer(context.Background(), secondID, "second edited\n"); err != nil {
		t.Fatalf("second edit: %v", err)
	}
	service.SetAutosaveEnabled(false)
	var order []string
	var writes sync.Mutex
	service.SetWriteExecutorForTesting(func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		writes.Lock()
		order = append(order, snapshot.DocumentID)
		writes.Unlock()
		if snapshot.DocumentID == secondID {
			return file.DiskVersion{}, errors.New("second write failed")
		}
		replaced, err := file.AtomicReplace(file.AtomicReplaceRequest{TargetPath: snapshot.TargetPath, Data: snapshot.encodedData, ExpectedVersion: snapshot.ExpectedDiskVersion})
		return replaced.Version, err
	})
	state, _ := service.GetState(context.Background())
	plan := service.PrepareClose(context.Background(), apperr.ClosePlanRight, []string{secondID, firstID}, state.Snapshot.TabSetRevision)
	if plan.Error != nil || plan.Data == nil {
		t.Fatalf("PrepareClose = %+v", plan)
	}
	resolved := service.ResolveClosePlan(context.Background(), plan.Data.ID, []apperr.ClosePlanDecision{{Choice: apperr.CloseChoiceSaveAll}})
	if resolved.Error != nil || resolved.Data == nil || resolved.Data.Status != apperr.ClosePlanReady {
		t.Fatalf("ResolveClosePlan = %+v", resolved)
	}
	failed := service.ExecuteClosePlan(context.Background(), plan.Data.ID)
	if failed.Error == nil || failed.Error.Category != apperr.ClassifiedIOFailure {
		t.Fatalf("ExecuteClosePlan = %+v, want first failure", failed)
	}
	writes.Lock()
	gotOrder := append([]string(nil), order...)
	writes.Unlock()
	if len(gotOrder) != 2 || gotOrder[0] != firstID || gotOrder[1] != secondID {
		t.Fatalf("save order = %v, want [%s %s]", gotOrder, firstID, secondID)
	}
	state, _ = service.GetState(context.Background())
	if _, firstOpen := state.Snapshot.Documents[firstID]; !firstOpen {
		t.Fatal("first document was removed after a later save failure")
	}
	if _, secondOpen := state.Snapshot.Documents[secondID]; !secondOpen {
		t.Fatal("second document was removed after its save failure")
	}
	if state.Snapshot.Documents[firstID].Dirty {
		t.Fatal("earlier successful save remained dirty")
	}
	if !state.Snapshot.Documents[secondID].Dirty {
		t.Fatal("failed save became clean")
	}
	if disk, err := os.ReadFile(firstPath); err != nil || string(disk) != "first edited\n" {
		t.Fatalf("first disk after partial batch = %q, err=%v", disk, err)
	}
	if disk, err := os.ReadFile(secondPath); err != nil || string(disk) != "second base\n" {
		t.Fatalf("second disk after failed batch = %q, err=%v", disk, err)
	}
}

func TestClosePlanSaveAsResolvesBeforeBatchWrite(t *testing.T) {
	service := NewEmptyAppModelService(&recordingEmitter{})
	target := filepath.Join(t.TempDir(), "planned-untitled")
	dialog := &saveDialogFixture{path: target, confirm: true}
	service.SetDocumentSaveDialog(dialog)
	documentID := newSaveDocument(t, service, "planned\n")
	var writes atomic.Int32
	service.SetWriteExecutorForTesting(func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		writes.Add(1)
		replaced, err := file.AtomicReplace(file.AtomicReplaceRequest{TargetPath: snapshot.TargetPath, Data: snapshot.encodedData, ExpectedVersion: snapshot.ExpectedDiskVersion})
		return replaced.Version, err
	})
	state, _ := service.GetState(context.Background())
	plan := service.PrepareClose(context.Background(), apperr.ClosePlanSingle, []string{documentID}, state.Snapshot.TabSetRevision)
	if plan.Error != nil || plan.Data == nil {
		t.Fatalf("PrepareClose = %+v", plan)
	}
	resolved := service.ResolveClosePlan(context.Background(), plan.Data.ID, []apperr.ClosePlanDecision{{DocumentID: documentID, Choice: apperr.CloseChoiceSave}})
	if resolved.Error != nil || resolved.Data == nil || resolved.Data.Status != apperr.ClosePlanReady || resolved.Data.Targets[0].SavePath == "" {
		t.Fatalf("ResolveClosePlan = %+v, want selected Save As target", resolved)
	}
	if writes.Load() != 0 {
		t.Fatalf("writes during Save As resolution = %d, want zero", writes.Load())
	}
	if _, err := os.Stat(resolved.Data.Targets[0].SavePath); !os.IsNotExist(err) {
		t.Fatalf("Save As resolution created target: %v", err)
	}
	closed := service.ExecuteClosePlan(context.Background(), plan.Data.ID)
	if closed.Error != nil || closed.Status != apperr.TabTransitionClosed || writes.Load() != 1 {
		t.Fatalf("ExecuteClosePlan = %+v, writes=%d", closed, writes.Load())
	}
	bytes, err := os.ReadFile(resolved.Data.Targets[0].SavePath)
	if err != nil || string(bytes) != "planned\n" {
		t.Fatalf("planned Save As bytes = %q, err=%v", bytes, err)
	}
}

func TestClosePlanSaveAsCancellationIsZeroEffect(t *testing.T) {
	service := NewEmptyAppModelService(&recordingEmitter{})
	service.SetDocumentSaveDialog(&saveDialogFixture{path: "", confirm: true})
	documentID := newSaveDocument(t, service, "cancelled\n")
	state, _ := service.GetState(context.Background())
	plan := service.PrepareClose(context.Background(), apperr.ClosePlanSingle, []string{documentID}, state.Snapshot.TabSetRevision)
	if plan.Error != nil || plan.Data == nil {
		t.Fatalf("PrepareClose = %+v", plan)
	}
	resolved := service.ResolveClosePlan(context.Background(), plan.Data.ID, []apperr.ClosePlanDecision{{DocumentID: documentID, Choice: apperr.CloseChoiceSave}})
	if resolved.Error != nil || resolved.Data == nil || resolved.Data.Status != apperr.ClosePlanCancelled {
		t.Fatalf("cancelled Save As resolution = %+v", resolved)
	}
	state, _ = service.GetState(context.Background())
	if _, ok := state.Snapshot.Documents[documentID]; !ok || !state.Snapshot.Documents[documentID].Dirty {
		t.Fatalf("cancelled Save As changed document state: %+v", state.Snapshot)
	}
}

func TestCloseWaitsForFlushAndAutosave(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, clock)
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "latest\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	state, _ := service.GetState(context.Background())
	plan := service.PrepareClose(context.Background(), apperr.ClosePlanSingle, []string{documentID}, state.Snapshot.TabSetRevision)
	if plan.Error != nil || plan.Data == nil || plan.Data.Status != apperr.ClosePlanReady {
		t.Fatalf("PrepareClose = %+v, want autosave-drained clean plan", plan)
	}
	if clock.Pending() != 0 {
		t.Fatalf("pending autosave timers = %d after close preparation", clock.Pending())
	}
	disk, err := os.ReadFile(path)
	if err != nil || string(disk) != "latest\n" {
		t.Fatalf("flushed autosave disk = %q, err=%v", disk, err)
	}
	resolved := service.ResolveClosePlan(context.Background(), plan.Data.ID, nil)
	if resolved.Error != nil || resolved.Data == nil || resolved.Data.Status != apperr.ClosePlanReady {
		t.Fatalf("ResolveClosePlan = %+v", resolved)
	}
	closed := service.ExecuteClosePlan(context.Background(), plan.Data.ID)
	if closed.Error != nil || closed.Status != apperr.TabTransitionClosed {
		t.Fatalf("ExecuteClosePlan = %+v", closed)
	}
}

func TestCloseReevaluatesRevisionAfterAutosaveDrain(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, clock)
	_, documentID := openAutosaveDocument(t, service, "base\n")
	started := make(chan struct{})
	release := make(chan struct{})
	service.SetWriteExecutorForTesting(func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		close(started)
		<-release
		return file.DiskVersion{Exists: true, Size: int64(len(snapshot.encodedData))}, nil
	})
	if err := service.UpdateBuffer(context.Background(), documentID, "first\n"); err != nil {
		t.Fatalf("first edit: %v", err)
	}
	if !clock.FireNextAsync() {
		t.Fatal("autosave timer did not start")
	}
	<-started
	if err := service.UpdateBuffer(context.Background(), documentID, "newer\n"); err != nil {
		t.Fatalf("newer edit: %v", err)
	}
	state, _ := service.GetState(context.Background())
	prepared := make(chan apperr.ClosePlanResult, 1)
	go func() {
		prepared <- service.PrepareClose(context.Background(), apperr.ClosePlanSingle, []string{documentID}, state.Snapshot.TabSetRevision)
	}()
	select {
	case result := <-prepared:
		t.Fatalf("PrepareClose returned before autosave drain: %+v", result)
	default:
	}
	close(release)
	plan := <-prepared
	if plan.Error != nil || plan.Data == nil || plan.Data.Status != apperr.ClosePlanCollecting || len(plan.Data.DirtyTargetIDs) != 1 {
		t.Fatalf("PrepareClose after newer edit = %+v, want explicit dirty choice", plan)
	}
}

func TestQueuedNormalizationsResolveInTabOrder(t *testing.T) {
	service := NewAppModelService(&recordingEmitter{})
	firstPath, firstID := writeMixedDocument(t, service, "first\r\nsecond\n")
	secondPath, secondID := writeMixedDocument(t, service, "third\n fourth\r\n")
	if err := service.UpdateBuffer(context.Background(), firstID, "first changed\nsecond\n"); err != nil {
		t.Fatalf("first edit: %v", err)
	}
	if err := service.UpdateBuffer(context.Background(), secondID, "third changed\nfourth\n"); err != nil {
		t.Fatalf("second edit: %v", err)
	}
	service.SetAutosaveEnabled(false)
	state, _ := service.GetState(context.Background())
	plan := service.PrepareClose(context.Background(), apperr.ClosePlanRight, []string{secondID, firstID}, state.Snapshot.TabSetRevision)
	if plan.Error != nil || plan.Data == nil {
		t.Fatalf("PrepareClose = %+v", plan)
	}
	firstRequirement := service.ResolveClosePlan(context.Background(), plan.Data.ID, []apperr.ClosePlanDecision{{Choice: apperr.CloseChoiceSaveAll}})
	if firstRequirement.Error != nil || firstRequirement.Data == nil || firstRequirement.Data.Targets[0].NormalizationToken == "" || firstRequirement.Data.Targets[1].NormalizationToken != "" {
		t.Fatalf("first normalization requirement = %+v", firstRequirement)
	}
	firstToken := firstRequirement.Data.Targets[0].NormalizationToken
	secondRequirement := service.ResolveClosePlan(context.Background(), plan.Data.ID, []apperr.ClosePlanDecision{
		{DocumentID: firstID, Choice: apperr.CloseChoiceSave, DecisionToken: firstToken},
		{DocumentID: secondID, Choice: apperr.CloseChoiceSave},
	})
	if secondRequirement.Error != nil || secondRequirement.Data == nil || secondRequirement.Data.Targets[1].NormalizationToken == "" {
		t.Fatalf("second normalization requirement = %+v", secondRequirement)
	}
	secondToken := secondRequirement.Data.Targets[1].NormalizationToken
	ready := service.ResolveClosePlan(context.Background(), plan.Data.ID, []apperr.ClosePlanDecision{
		{DocumentID: firstID, Choice: apperr.CloseChoiceSave, DecisionToken: firstToken},
		{DocumentID: secondID, Choice: apperr.CloseChoiceSave, DecisionToken: secondToken},
	})
	if ready.Error != nil || ready.Data == nil || ready.Data.Status != apperr.ClosePlanReady {
		t.Fatalf("resolved normalization plan = %+v", ready)
	}
	closed := service.ExecuteClosePlan(context.Background(), plan.Data.ID)
	if closed.Error != nil || closed.Status != apperr.TabTransitionClosed {
		t.Fatalf("ExecuteClosePlan after normalization = %+v", closed)
	}
	if _, err := os.Stat(firstPath); err != nil {
		t.Fatalf("first mixed document disappeared after close: %v", err)
	}
	if _, err := os.Stat(secondPath); err != nil {
		t.Fatalf("second mixed document disappeared after close: %v", err)
	}
}

func TestCloseAdjacentAndFinalZeroState(t *testing.T) {
	service := NewAppModelService(&recordingEmitter{})
	state, _ := service.GetState(context.Background())
	for range 2 {
		created := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
		if created.Error != nil {
			t.Fatalf("NewDocument = %+v", created)
		}
		state, _ = service.GetState(context.Background())
	}
	order := append([]string(nil), state.Snapshot.OrderedDocumentIDs...)
	for index := len(order) - 1; index >= 0; index-- {
		state, _ = service.GetState(context.Background())
		plan := service.PrepareClose(context.Background(), apperr.ClosePlanSingle, []string{order[index]}, state.Snapshot.TabSetRevision)
		if plan.Error != nil || plan.Data == nil || plan.Data.Status != apperr.ClosePlanReady {
			t.Fatalf("PrepareClose[%d] = %+v", index, plan)
		}
		resolved := service.ResolveClosePlan(context.Background(), plan.Data.ID, nil)
		if resolved.Error != nil {
			t.Fatalf("ResolveClosePlan[%d] = %+v", index, resolved)
		}
		closed := service.ExecuteClosePlan(context.Background(), plan.Data.ID)
		if closed.Error != nil {
			t.Fatalf("ExecuteClosePlan[%d] = %+v", index, closed)
		}
		if index > 0 && closed.ActiveDocumentID != order[index-1] {
			t.Fatalf("active after closing %s = %q, want %q", order[index], closed.ActiveDocumentID, order[index-1])
		}
	}
	state, _ = service.GetState(context.Background())
	if state.Snapshot.ActiveDocumentID != "" || state.ActiveBuffer != nil || len(state.Snapshot.OrderedDocumentIDs) != 0 {
		t.Fatalf("final close state = %+v, want zero tabs and buffer", state)
	}
}

func writeMixedDocument(t *testing.T, service *AppModelService, content string) (string, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "mixed.md")
	if err := os.WriteFile(path, []byte(content), 0o640); err != nil {
		t.Fatalf("write mixed fixture: %v", err)
	}
	state, _ := service.GetState(context.Background())
	opened := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if opened.Status != OpenStatusOpened || opened.DocumentID == "" {
		t.Fatalf("OpenPath mixed = %+v", opened)
	}
	return path, opened.DocumentID
}

// Proves: FR-FT-034
// A quit plan with nothing to close must put an empty JSON array on the wire.
//
// `ClosePlanSummary.Targets` is tagged without `omitempty` and the frontend
// declares it `CloseTarget[]`, so a nil slice marshals to `null` and normalising
// it throws. The native close handler caught that throw and cancelled the quit
// while Wails had already vetoed the close, leaving a window that could only be
// killed. Quitting with every tab closed is the ordinary way to reach it.
func TestPrepareCloseWithNoTargetsMarshalsAnEmptyTargetArray(t *testing.T) {
	service := NewAppModelService(&recordingEmitter{})
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}

	// Reach the state a user reaches by closing every tab: the clean Untitled
	// document the service starts with is closed, leaving nothing to target.
	opening := service.PrepareClose(context.Background(), apperr.ClosePlanSingle, state.Snapshot.OrderedDocumentIDs, state.Snapshot.TabSetRevision)
	if opening.Data == nil {
		t.Fatalf("prepare initial close: %+v", opening.Error)
	}
	if resolved := service.ResolveClosePlan(context.Background(), opening.Data.ID, nil); resolved.Error != nil {
		t.Fatalf("resolve initial close: %+v", resolved.Error)
	}
	if closed := service.ExecuteClosePlan(context.Background(), opening.Data.ID); closed.Error != nil {
		t.Fatalf("execute initial close: %+v", closed.Error)
	}
	state, err = service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after closing every tab: %v", err)
	}
	if len(state.Snapshot.OrderedDocumentIDs) != 0 {
		t.Fatalf("documents still open: %v", state.Snapshot.OrderedDocumentIDs)
	}

	plan := service.PrepareClose(context.Background(), apperr.ClosePlanQuit, nil, state.Snapshot.TabSetRevision)

	if plan.Error != nil {
		t.Fatalf("PrepareClose returned an error: %+v", plan.Error)
	}
	if plan.Data == nil {
		t.Fatal("PrepareClose returned no plan")
	}
	if plan.Data.Targets == nil {
		t.Fatal("plan targets are nil; want a non-nil empty slice so the wire carries []")
	}
	encoded, err := json.Marshal(plan.Data)
	if err != nil {
		t.Fatalf("marshal plan: %v", err)
	}
	if !strings.Contains(string(encoded), `"targets":[]`) {
		t.Fatalf("plan JSON = %s; want it to carry \"targets\":[]", encoded)
	}
}

// An abandoned prompt used to leave activeClosePlan set for the life of the
// process, which refused every later close: the window became impossible to
// close. The newest close request now supersedes a plan that is only waiting on
// a human.
func TestPrepareCloseSupersedesAnAbandonedPlan(t *testing.T) {
	service := NewAppModelService(&recordingEmitter{})
	_, firstID := openAutosaveDocument(t, service, "first base\n")
	_, secondID := openAutosaveDocument(t, service, "second base\n")
	if err := service.UpdateBuffer(context.Background(), firstID, "first edited\n"); err != nil {
		t.Fatalf("first edit: %v", err)
	}
	if err := service.UpdateBuffer(context.Background(), secondID, "second edited\n"); err != nil {
		t.Fatalf("second edit: %v", err)
	}
	service.SetAutosaveEnabled(false)

	state, _ := service.GetState(context.Background())
	abandoned := service.PrepareClose(context.Background(), apperr.ClosePlanSingle, []string{firstID}, state.Snapshot.TabSetRevision)
	if abandoned.Error != nil || abandoned.Data == nil || abandoned.Data.Status != apperr.ClosePlanCollecting {
		t.Fatalf("first PrepareClose = %+v, want a collecting plan", abandoned)
	}

	// The user walks away from the prompt: no ResolveClosePlan ever arrives.
	quit := service.PrepareClose(context.Background(), apperr.ClosePlanQuit, []string{firstID, secondID}, state.Snapshot.TabSetRevision)
	if quit.Error != nil || quit.Data == nil {
		t.Fatalf("quit PrepareClose = %+v, want the newest request to win", quit)
	}
	if quit.Data.ID == abandoned.Data.ID {
		t.Fatal("quit PrepareClose reused the abandoned plan instead of superseding it")
	}
	if len(quit.Data.Targets) != 2 {
		t.Fatalf("quit plan targets = %d, want both documents", len(quit.Data.Targets))
	}

	// The superseded plan must be dead, not merely shadowed.
	stale := service.ResolveClosePlan(context.Background(), abandoned.Data.ID, []apperr.ClosePlanDecision{{DocumentID: firstID, Choice: apperr.CloseChoiceDiscard}})
	if stale.Error == nil {
		t.Fatalf("superseded plan is still resolvable: %+v", stale)
	}

	// And quit is reachable again, which is the behaviour the trap denied.
	resolved := service.ResolveClosePlan(context.Background(), quit.Data.ID, []apperr.ClosePlanDecision{{Choice: apperr.CloseChoiceDiscardAll}})
	if resolved.Error != nil || resolved.Data == nil || resolved.Data.Status != apperr.ClosePlanReady {
		t.Fatalf("ResolveClosePlan = %+v", resolved)
	}
	if transition := service.ExecuteClosePlan(context.Background(), quit.Data.ID); transition.Error != nil {
		t.Fatalf("ExecuteClosePlan = %+v", transition)
	}
	state, _ = service.GetState(context.Background())
	if len(state.Snapshot.OrderedDocumentIDs) != 0 {
		t.Fatalf("documents still open after quit: %v", state.Snapshot.OrderedDocumentIDs)
	}
}

// Superseding must not throw away choices the user already answered, so an
// identical repeat of the same request returns the plan already collecting.
func TestPrepareCloseRepeatedIdenticallyKeepsTheCollectingPlan(t *testing.T) {
	service := NewAppModelService(&recordingEmitter{})
	_, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "edited\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	service.SetAutosaveEnabled(false)

	state, _ := service.GetState(context.Background())
	first := service.PrepareClose(context.Background(), apperr.ClosePlanSingle, []string{documentID}, state.Snapshot.TabSetRevision)
	if first.Error != nil || first.Data == nil || first.Data.Status != apperr.ClosePlanCollecting {
		t.Fatalf("first PrepareClose = %+v", first)
	}
	second := service.PrepareClose(context.Background(), apperr.ClosePlanSingle, []string{documentID}, state.Snapshot.TabSetRevision)
	if second.Error != nil || second.Data == nil {
		t.Fatalf("repeated PrepareClose = %+v", second)
	}
	if second.Data.ID != first.Data.ID {
		t.Fatalf("repeated PrepareClose minted %s, want the collecting plan %s", second.Data.ID, first.Data.ID)
	}
}

// ExecuteClosePlan runs its saves with the mutex released, so a plan that is
// already writing is the one plan a newer request must not supersede.
func TestPrepareCloseRefusesWhileAnotherPlanIsSaving(t *testing.T) {
	service := NewAppModelService(&recordingEmitter{})
	_, firstID := openAutosaveDocument(t, service, "first base\n")
	_, secondID := openAutosaveDocument(t, service, "second base\n")
	if err := service.UpdateBuffer(context.Background(), firstID, "first edited\n"); err != nil {
		t.Fatalf("first edit: %v", err)
	}
	if err := service.UpdateBuffer(context.Background(), secondID, "second edited\n"); err != nil {
		t.Fatalf("second edit: %v", err)
	}
	service.SetAutosaveEnabled(false)

	writing := make(chan struct{})
	release := make(chan struct{})
	var once sync.Once
	service.SetWriteExecutorForTesting(func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		once.Do(func() { close(writing) })
		<-release
		replaced, err := file.AtomicReplace(file.AtomicReplaceRequest{TargetPath: snapshot.TargetPath, Data: snapshot.encodedData, ExpectedVersion: snapshot.ExpectedDiskVersion})
		return replaced.Version, err
	})

	state, _ := service.GetState(context.Background())
	revision := state.Snapshot.TabSetRevision
	plan := service.PrepareClose(context.Background(), apperr.ClosePlanSingle, []string{firstID}, revision)
	if plan.Error != nil || plan.Data == nil {
		t.Fatalf("PrepareClose = %+v", plan)
	}
	resolved := service.ResolveClosePlan(context.Background(), plan.Data.ID, []apperr.ClosePlanDecision{{DocumentID: firstID, Choice: apperr.CloseChoiceSave}})
	if resolved.Error != nil || resolved.Data == nil || resolved.Data.Status != apperr.ClosePlanReady {
		t.Fatalf("ResolveClosePlan = %+v", resolved)
	}

	executed := make(chan apperr.TabTransitionResult, 1)
	go func() { executed <- service.ExecuteClosePlan(context.Background(), plan.Data.ID) }()
	<-writing

	refused := service.PrepareClose(context.Background(), apperr.ClosePlanSingle, []string{secondID}, revision)
	if refused.Error == nil {
		t.Fatalf("PrepareClose during a save = %+v, want a refusal that protects the write", refused)
	}
	if refused.Error.Category != apperr.ClassifiedConflict {
		t.Fatalf("refusal category = %s, want %s", refused.Error.Category, apperr.ClassifiedConflict)
	}

	close(release)
	if transition := <-executed; transition.Error != nil {
		t.Fatalf("ExecuteClosePlan = %+v", transition)
	}
}
