package application_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
)

func TestDeadlineUsesRequestContextForConfirmationAndQuit(t *testing.T) {
	type key struct{}
	ctx := context.WithValue(context.Background(), key{}, "runtime")
	clock := &shutdownClock{now: time.Unix(10, 0)}
	confirmed := make(chan any, 1)
	quit := make(chan any, 1)
	emitted := make(chan any, 2)
	owner := application.NewShutdownOwner(&shutdownModel{}, application.ShutdownOption{Clock: clock},
		application.WithCloseRequestedEmitter(func(ctx context.Context, _ string) { emitted <- ctx.Value(key{}) }),
		application.WithNativeConfirmation(func(ctx context.Context, _ []string, _ bool) (bool, error) {
			confirmed <- ctx.Value(key{})
			return true, nil
		}),
		application.WithNativeQuit(func(ctx context.Context) { quit <- ctx.Value(key{}) }),
	)
	owner.WindowReady(ctx)
	owner.BeforeClose(ctx)
	clock.fire(11 * time.Second)
	for range 2 {
		select {
		case v := <-emitted:
			if v != "runtime" {
				t.Fatalf("event context = %v", v)
			}
		case <-time.After(time.Second):
			t.Fatal("missing close event")
		}
	}
	select {
	case v := <-confirmed:
		if v != "runtime" {
			t.Fatalf("confirmation context = %v", v)
		}
	case <-time.After(time.Second):
		t.Fatal("missing confirmation")
	}
	select {
	case v := <-quit:
		if v != "runtime" {
			t.Fatalf("quit context = %v", v)
		}
	case <-time.After(time.Second):
		t.Fatal("missing quit")
	}
}

func TestNativeOwnershipAndCancelEmitAfterModelChange(t *testing.T) {
	model := &shutdownModel{}
	clock := &shutdownClock{now: time.Unix(10, 0)}
	type event struct {
		id    string
		owner apperr.PendingCloseOwner
	}
	events := make(chan event, 4)
	owner := application.NewShutdownOwner(model, application.ShutdownOption{Clock: clock},
		application.WithCloseRequestedEmitter(func(_ context.Context, id string) {
			model.mu.Lock()
			defer model.mu.Unlock()
			events <- event{id, model.pendingOwner}
		}),
		application.WithNativeConfirmation(func(context.Context, []string, bool) (bool, error) { return false, nil }),
	)
	owner.WindowReady(context.Background())
	owner.BeforeClose(context.Background())
	first := <-events
	clock.fire(11 * time.Second)
	for _, want := range []apperr.PendingCloseOwner{apperr.PendingCloseOwnerNative, ""} {
		select {
		case got := <-events:
			if got.id != first.id || got.owner != want {
				t.Fatalf("event = %+v, want id %q owner %q", got, first.id, want)
			}
		case <-time.After(time.Second):
			t.Fatal("missing ownership event")
		}
	}
}

func TestCloseBeforeFrontendReadyDrainsAndRequiresNativeConfirmation(t *testing.T) {
	model := &shutdownModel{dirtyDocuments: []string{"Draft.md"}}
	clock := &shutdownClock{now: time.Unix(100, 0)}
	confirmation := &confirmationPort{answer: false, answered: make(chan []string, 1)}
	owner := application.NewShutdownOwner(model,
		application.ShutdownOption{Clock: clock},
		application.WithNativeConfirmation(confirmation.confirm),
	)

	if !owner.BeforeClose(context.Background()) {
		t.Fatal("dirty close before frontend readiness was not vetoed")
	}
	confirmation.wait(t)
	if model.drainCalls != 1 {
		t.Fatalf("drain calls = %d, want one", model.drainCalls)
	}
	if got := confirmation.documents(); len(got) != 1 || got[0] != "Draft.md" {
		t.Fatalf("confirmation documents = %v, want [Draft.md]", got)
	}
	waitForShutdownState(t, owner, application.ShutdownIdle, "cancelled confirmation")
	if owner.Snapshot().FrontendReady {
		t.Fatal("cancelled pre-ready close marked the frontend ready")
	}

	confirmation.answer = true
	if !owner.BeforeClose(context.Background()) {
		t.Fatal("second dirty close before frontend readiness was not vetoed")
	}
	confirmation.wait(t)
	waitForShutdownState(t, owner, application.ShutdownExiting, "confirmed pre-ready")
}

func TestCloseAfterReadyReemitsTheSameRequestAndDiscoversPendingState(t *testing.T) {
	model := &shutdownModel{}
	clock := &shutdownClock{now: time.Unix(200, 0)}
	var events []string
	var mu sync.Mutex
	owner := application.NewShutdownOwner(model,
		application.ShutdownOption{Clock: clock},
		application.WithCloseRequestedEmitter(func(_ context.Context, id string) {
			mu.Lock()
			events = append(events, id)
			mu.Unlock()
		}),
	)

	owner.WindowReady(context.Background())
	if !owner.BeforeClose(context.Background()) {
		t.Fatal("ready close was not vetoed")
	}
	snapshot := owner.Snapshot()
	if snapshot.State != application.ShutdownAwaiting || snapshot.Request == nil {
		t.Fatalf("ready close snapshot = %+v, want awaiting request", snapshot)
	}
	if model.pendingCloseID != snapshot.Request.ID {
		t.Fatalf("pending close id = %q, want %q", model.pendingCloseID, snapshot.Request.ID)
	}
	if !owner.BeforeClose(context.Background()) {
		t.Fatal("repeated ready close was not vetoed")
	}
	mu.Lock()
	defer mu.Unlock()
	if len(events) != 2 || events[0] == "" || events[0] != events[1] {
		t.Fatalf("close events = %v, want the same non-empty id twice", events)
	}
}

func TestCloseBeforeReadyIsDiscoveredIfTheFrontendBecomesReadyDuringStatusCheck(t *testing.T) {
	model := &shutdownModel{
		statusEntered: make(chan struct{}),
		statusRelease: make(chan struct{}),
	}
	clock := &shutdownClock{now: time.Unix(250, 0)}
	events := make(chan string, 1)
	owner := application.NewShutdownOwner(model,
		application.ShutdownOption{Clock: clock},
		application.WithCloseRequestedEmitter(func(_ context.Context, id string) { events <- id }),
	)

	result := make(chan bool, 1)
	go func() { result <- owner.BeforeClose(context.Background()) }()
	select {
	case <-model.statusEntered:
	case <-time.After(time.Second):
		t.Fatal("close did not reach the status check")
	}
	owner.WindowReady(context.Background())
	close(model.statusRelease)
	if !<-result {
		t.Fatal("close was not vetoed after the frontend became ready")
	}

	select {
	case id := <-events:
		if id == "" {
			t.Fatal("close event had an empty id")
		}
	case <-time.After(time.Second):
		t.Fatal("ready frontend did not receive the discovered close request")
	}
	snapshot := owner.Snapshot()
	if snapshot.State != application.ShutdownAwaiting || snapshot.Request == nil || snapshot.Request.ID == "" {
		t.Fatalf("discovered close snapshot = %+v, want awaiting request", snapshot)
	}
}

func TestCloseAnswersRejectStaleIdentifiersWithoutChangingState(t *testing.T) {
	model := &shutdownModel{}
	owner := application.NewShutdownOwner(model)
	owner.WindowReady(context.Background())
	if !owner.BeforeClose(context.Background()) {
		t.Fatal("ready close was not vetoed")
	}
	want := owner.Snapshot()

	if refusal := owner.AuthorizeQuit(context.Background(), "stale"); refusal == nil || refusal.Category != apperr.ClassifiedValidation {
		t.Fatalf("stale authorize refusal = %+v, want validation", refusal)
	}
	if refusal := owner.CancelQuit(context.Background(), "stale"); refusal == nil || refusal.Category != apperr.ClassifiedValidation {
		t.Fatalf("stale cancel refusal = %+v, want validation", refusal)
	}
	got := owner.Snapshot()
	if got.State != want.State || got.Request == nil || got.Request.ID != want.Request.ID {
		t.Fatalf("state after stale answers = %+v, want unchanged %+v", got, want)
	}
}

func TestCloseDeadlineDrainsPendingWriteBeforeConfirmationAndNeverDiscardsAlone(t *testing.T) {
	model := &shutdownModel{dirtyDocuments: []string{"Unsaved.md"}, pendingWrite: true}
	clock := &shutdownClock{now: time.Unix(300, 0)}
	confirmation := &confirmationPort{answer: false, answered: make(chan []string, 1)}
	quitCalls := 0
	owner := application.NewShutdownOwner(model,
		application.ShutdownOption{Clock: clock},
		application.WithNativeConfirmation(confirmation.confirm),
		application.WithNativeQuit(func(context.Context) { quitCalls++ }),
	)

	owner.WindowReady(context.Background())
	if !owner.BeforeClose(context.Background()) {
		t.Fatal("ready close was not vetoed")
	}
	clock.fire(time.Second * 10)
	confirmation.wait(t)
	if model.drainCalls != 1 || !model.drainStartedBeforeConfirmation {
		t.Fatalf("drain calls/order = %d/%t, want one drain before confirmation", model.drainCalls, model.drainStartedBeforeConfirmation)
	}
	if quitCalls != 0 {
		t.Fatalf("timeout invoked quit %d times without confirmation", quitCalls)
	}
	waitForShutdownState(t, owner, application.ShutdownIdle, "cancelled timeout confirmation")

	if !owner.BeforeClose(context.Background()) {
		t.Fatal("retry after cancelled confirmation was not vetoed")
	}
	request := owner.Snapshot().Request
	if request == nil {
		t.Fatal("retry did not create a close request")
	}
	if refusal := owner.AuthorizeQuit(context.Background(), request.ID); refusal != nil {
		t.Fatalf("retry authorize refusal = %+v", refusal)
	}
	if quitCalls != 1 || owner.Snapshot().State != application.ShutdownExiting {
		t.Fatalf("confirmed retry quit/state = %d/%q, want 1/exiting", quitCalls, owner.Snapshot().State)
	}
}

func TestReadyCloseDeadlineConfirmsEvenWhenBackendIsClean(t *testing.T) {
	model := &shutdownModel{}
	clock := &shutdownClock{now: time.Unix(400, 0)}
	confirmation := &confirmationPort{answer: false, answered: make(chan []string, 1)}
	quit := make(chan struct{}, 1)
	owner := application.NewShutdownOwner(model, application.ShutdownOption{Clock: clock},
		application.WithNativeConfirmation(confirmation.confirm),
		application.WithNativeQuit(func(context.Context) { quit <- struct{}{} }))
	owner.WindowReady(context.Background())
	if !owner.BeforeClose(context.Background()) {
		t.Fatal("ready close was not vetoed")
	}
	clock.fire(10 * time.Second)
	confirmation.wait(t)
	select {
	case <-quit:
		t.Fatal("deadline quit without explicit confirmation")
	default:
	}
	waitForShutdownState(t, owner, application.ShutdownIdle, "cancelled clean fallback")
	confirmation.mu.Lock()
	possible := confirmation.possibleUndelivered
	confirmation.mu.Unlock()
	if !possible {
		t.Fatal("fallback did not identify possible undelivered frontend changes")
	}
}

func TestRecoveryAcknowledgmentKeepsDecisionPastDeadline(t *testing.T) {
	model := &shutdownModel{}
	clock := &shutdownClock{now: time.Unix(500, 0)}
	confirmation := &confirmationPort{answered: make(chan []string, 1)}
	owner := application.NewShutdownOwner(model, application.ShutdownOption{Clock: clock}, application.WithNativeConfirmation(confirmation.confirm))
	owner.WindowReady(context.Background())
	owner.BeforeClose(context.Background())
	id := owner.Snapshot().Request.ID
	if refusal := owner.AcknowledgeRecoveryClose(context.Background(), id); refusal != nil {
		t.Fatal(refusal)
	}
	if refusal := owner.AcknowledgeRecoveryClose(context.Background(), id); refusal != nil {
		t.Fatal(refusal)
	}
	clock.fire(20 * time.Second)
	if got := owner.Snapshot(); got.State != application.ShutdownRecoveryDecision || got.Request.ID != id {
		t.Fatalf("snapshot = %+v", got)
	}
	if !owner.BeforeClose(context.Background()) {
		t.Fatal("repeated close did not veto")
	}
	model.mu.Lock()
	if model.pendingOwner != apperr.PendingCloseOwnerFrontend || model.discardCalls != 0 {
		t.Fatalf("owner/calls = %q/%d", model.pendingOwner, model.discardCalls)
	}
	model.mu.Unlock()
	if refusal := owner.CancelQuit(context.Background(), id); refusal != nil {
		t.Fatal(refusal)
	}
	owner.BeforeClose(context.Background())
	if owner.Snapshot().Request.ID == id {
		t.Fatal("cancelled request reused its ID")
	}
}

func TestRecoveryDiscardRejectsStaleAndUsesDiscardDrain(t *testing.T) {
	model := &shutdownModel{}
	quit := make(chan struct{}, 1)
	owner := application.NewShutdownOwner(model, application.WithNativeQuit(func(context.Context) { quit <- struct{}{} }))
	owner.WindowReady(context.Background())
	owner.BeforeClose(context.Background())
	id := owner.Snapshot().Request.ID
	if owner.AcknowledgeRecoveryClose(context.Background(), "stale") == nil || owner.DiscardAndAuthorizeQuit(context.Background(), "stale") == nil {
		t.Fatal("stale close accepted")
	}
	model.mu.Lock()
	staleCalls := model.discardCalls
	model.mu.Unlock()
	if staleCalls != 0 {
		t.Fatalf("stale request began %d discard drains", staleCalls)
	}
	if refusal := owner.AcknowledgeRecoveryClose(context.Background(), id); refusal != nil {
		t.Fatal(refusal)
	}
	if refusal := owner.DiscardAndAuthorizeQuit(context.Background(), id); refusal != nil {
		t.Fatal(refusal)
	}
	if owner.DiscardAndAuthorizeQuit(context.Background(), id) == nil {
		t.Fatal("duplicate discard accepted")
	}
	model.mu.Lock()
	calls, drains := model.discardCalls, model.discardDrainCalls
	model.mu.Unlock()
	if calls != 1 || drains != 1 {
		t.Fatalf("discard calls/drains = %d/%d", calls, drains)
	}
	select {
	case <-quit:
	default:
		t.Fatal("authorized quit not issued")
	}
}

func TestDeadlineClaimsNativeOwnershipBeforeStatusAndRejectsLateAcknowledgment(t *testing.T) {
	model := &shutdownModel{statusEntered: make(chan struct{}), statusRelease: make(chan struct{})}
	clock := &shutdownClock{now: time.Unix(600, 0)}
	confirmation := &confirmationPort{answered: make(chan []string, 1)}
	owner := application.NewShutdownOwner(model, application.ShutdownOption{Clock: clock}, application.WithNativeConfirmation(confirmation.confirm))
	owner.WindowReady(context.Background())
	owner.BeforeClose(context.Background())
	id := owner.Snapshot().Request.ID
	clock.fire(10 * time.Second)
	select {
	case <-model.statusEntered:
	case <-time.After(time.Second):
		t.Fatal("fallback did not inspect status")
	}
	model.mu.Lock()
	ownership := model.pendingOwner
	begins := model.discardCalls
	model.mu.Unlock()
	if ownership != apperr.PendingCloseOwnerNative || begins != 1 {
		t.Fatalf("ownership/begins = %q/%d", ownership, begins)
	}
	answer := make(chan *apperr.ClassifiedError, 1)
	go func() { answer <- owner.AcknowledgeRecoveryClose(context.Background(), id) }()
	close(model.statusRelease)
	if refusal := <-answer; refusal == nil {
		t.Fatal("late acknowledgment accepted")
	}
	confirmation.wait(t)
	waitForShutdownState(t, owner, application.ShutdownIdle, "native fallback cancellation")
}

func TestDirtyCloseBecomingReadyDuringStatusDoesNotStartNativeDrain(t *testing.T) {
	model := &shutdownModel{dirtyDocuments: []string{"draft"}, statusEntered: make(chan struct{}), statusRelease: make(chan struct{})}
	owner := application.NewShutdownOwner(model)
	result := make(chan bool, 1)
	go func() { result <- owner.BeforeClose(context.Background()) }()
	<-model.statusEntered
	owner.WindowReady(context.Background())
	close(model.statusRelease)
	if !<-result {
		t.Fatal("close not vetoed")
	}
	if got := owner.Snapshot().State; got != application.ShutdownAwaiting {
		t.Fatalf("state = %s", got)
	}
	model.mu.Lock()
	calls := model.drainCalls
	model.mu.Unlock()
	if calls != 0 {
		t.Fatalf("pre-ready continuation started %d drains after handoff", calls)
	}
}

func TestDeadlineWaitsForDiscardDrainBeforeNativePrompt(t *testing.T) {
	model := &shutdownModel{discardEntered: make(chan struct{}, 1), discardRelease: make(chan struct{})}
	clock := &shutdownClock{now: time.Unix(800, 0)}
	confirmation := &confirmationPort{answered: make(chan []string, 1)}
	owner := application.NewShutdownOwner(model, application.ShutdownOption{Clock: clock}, application.WithNativeConfirmation(confirmation.confirm))
	owner.WindowReady(context.Background())
	owner.BeforeClose(context.Background())
	clock.fire(10 * time.Second)
	select {
	case <-model.discardEntered:
	case <-time.After(time.Second):
		t.Fatal("discard drain not entered")
	}
	select {
	case <-confirmation.answered:
		t.Fatal("prompt appeared before admitted work completed")
	default:
	}
	close(model.discardRelease)
	confirmation.wait(t)
	waitForShutdownState(t, owner, application.ShutdownIdle, "cancelled prompt")
}

func TestRecoveryDiscardRefusalRestoresDecisionAndAllowsRetry(t *testing.T) {
	model := &shutdownModel{discardRefusal: &apperr.ClassifiedError{Message: "blocked"}}
	owner := application.NewShutdownOwner(model)
	owner.WindowReady(context.Background())
	owner.BeforeClose(context.Background())
	id := owner.Snapshot().Request.ID
	if refusal := owner.AcknowledgeRecoveryClose(context.Background(), id); refusal != nil {
		t.Fatal(refusal)
	}
	if refusal := owner.DiscardAndAuthorizeQuit(context.Background(), id); refusal == nil {
		t.Fatal("failed drain authorized quit")
	}
	if got := owner.Snapshot().State; got != application.ShutdownRecoveryDecision {
		t.Fatalf("state after refusal = %s", got)
	}
	model.mu.Lock()
	ownership, draining := model.pendingOwner, model.draining
	model.discardRefusal = nil
	model.mu.Unlock()
	if ownership != apperr.PendingCloseOwnerFrontend || draining {
		t.Fatalf("owner/draining = %s/%v", ownership, draining)
	}
	if refusal := owner.DiscardAndAuthorizeQuit(context.Background(), id); refusal != nil {
		t.Fatal(refusal)
	}
}

func TestNativeFallbackDrainRefusalReopensAdmissionForFreshRequest(t *testing.T) {
	model := &shutdownModel{discardRefusal: &apperr.ClassifiedError{Message: "document write unavailable"}}
	clock := &shutdownClock{now: time.Unix(850, 0)}
	quit := make(chan struct{}, 1)
	owner := application.NewShutdownOwner(model, application.ShutdownOption{Clock: clock}, application.WithNativeQuit(func(context.Context) { quit <- struct{}{} }))
	owner.WindowReady(context.Background())
	owner.BeforeClose(context.Background())
	id := owner.Snapshot().Request.ID
	clock.fire(10 * time.Second)
	waitForShutdownState(t, owner, application.ShutdownIdle, "refused native drain")
	model.mu.Lock()
	draining, pending := model.draining, model.pendingCloseID
	model.discardRefusal = nil
	model.mu.Unlock()
	if draining || pending != "" {
		t.Fatalf("draining/pending = %v/%q", draining, pending)
	}
	select {
	case <-quit:
		t.Fatal("refused drain granted permit")
	default:
	}
	if !owner.BeforeClose(context.Background()) || owner.Snapshot().Request.ID == id {
		t.Fatal("fresh close did not receive a new request")
	}
}

func TestUnavailableOrFailedNativeConfirmationReopensAdmission(t *testing.T) {
	for _, tc := range []struct {
		name    string
		confirm application.NativeConfirmation
	}{
		{name: "unavailable"},
		{name: "error", confirm: func(context.Context, []string, bool) (bool, error) { return false, errors.New("unavailable") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			model := &shutdownModel{}
			clock := &shutdownClock{now: time.Unix(875, 0)}
			owner := application.NewShutdownOwner(model, application.ShutdownOption{Clock: clock, NativeConfirmation: tc.confirm})
			owner.WindowReady(context.Background())
			owner.BeforeClose(context.Background())
			id := owner.Snapshot().Request.ID
			clock.fire(10 * time.Second)
			waitForShutdownState(t, owner, application.ShutdownIdle, "unavailable confirmation")
			model.mu.Lock()
			draining, pending := model.draining, model.pendingCloseID
			model.mu.Unlock()
			if draining || pending != "" {
				t.Fatalf("draining/pending = %v/%q", draining, pending)
			}
			if !owner.BeforeClose(context.Background()) || owner.Snapshot().Request.ID == id {
				t.Fatal("fresh close request not accepted")
			}
		})
	}
}

func TestNativeCancelFinishesModelSettlementBeforeAcceptingAnotherClose(t *testing.T) {
	model := &shutdownModel{endEntered: make(chan struct{}, 1), endRelease: make(chan struct{})}
	clock := &shutdownClock{now: time.Unix(880, 0)}
	confirmation := &confirmationPort{answered: make(chan []string, 1)}
	owner := application.NewShutdownOwner(model, application.ShutdownOption{Clock: clock}, application.WithNativeConfirmation(confirmation.confirm))
	owner.WindowReady(context.Background())
	owner.BeforeClose(context.Background())
	first := owner.Snapshot().Request.ID
	clock.fire(10 * time.Second)
	confirmation.wait(t)
	select {
	case <-model.endEntered:
	case <-time.After(time.Second):
		t.Fatal("settlement did not start")
	}
	retry := make(chan bool, 1)
	go func() { retry <- owner.BeforeClose(context.Background()) }()
	select {
	case <-retry:
		t.Fatal("new request overtook model settlement")
	default:
	}
	close(model.endRelease)
	if !<-retry {
		t.Fatal("new request did not veto")
	}
	if owner.Snapshot().Request.ID == first {
		t.Fatal("new request reused old ID")
	}
}

type immediateShutdownClock struct{}

func (immediateShutdownClock) Now() time.Time { return time.Unix(1000, 0) }
func (immediateShutdownClock) AfterFunc(_ time.Duration, callback func()) application.ShutdownTimer {
	callback()
	return &shutdownTimer{}
}

func TestSynchronousDeadlineCannotOverwriteNativeOwnerWithFrontend(t *testing.T) {
	model := &shutdownModel{}
	entered, release := make(chan struct{}, 1), make(chan struct{})
	owner := application.NewShutdownOwner(model, application.ShutdownOption{Clock: immediateShutdownClock{}},
		application.WithNativeConfirmation(func(_ context.Context, _ []string, _ bool) (bool, error) {
			entered <- struct{}{}
			<-release
			return false, nil
		}))
	owner.WindowReady(context.Background())
	if !owner.BeforeClose(context.Background()) {
		t.Fatal("close not vetoed")
	}
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("fallback did not start")
	}
	model.mu.Lock()
	history := append([]apperr.PendingCloseOwner(nil), model.ownerHistory...)
	current := model.pendingOwner
	model.mu.Unlock()
	if len(history) != 2 || history[0] != apperr.PendingCloseOwnerFrontend || history[1] != apperr.PendingCloseOwnerNative || current != apperr.PendingCloseOwnerNative {
		t.Fatalf("history/current = %v/%s", history, current)
	}
	close(release)
	waitForShutdownState(t, owner, application.ShutdownIdle, "cancelled synchronous deadline")
}

type shutdownModel struct {
	mu                             sync.Mutex
	dirtyDocuments                 []string
	pendingWrite                   bool
	pendingCloseID                 string
	pendingOwner                   apperr.PendingCloseOwner
	ownerHistory                   []apperr.PendingCloseOwner
	discardCalls                   int
	discardDrainCalls              int
	discardEntered                 chan struct{}
	discardRelease                 chan struct{}
	discardRefusal                 *apperr.ClassifiedError
	endEntered                     chan struct{}
	endRelease                     chan struct{}
	drainCalls                     int
	draining                       bool
	drainStartedBeforeConfirmation bool
	statusEntered                  chan struct{}
	statusRelease                  chan struct{}
	statusOnce                     sync.Once
}

func (model *shutdownModel) CloseStatus() ([]string, bool) {
	if model.statusEntered != nil {
		model.statusOnce.Do(func() { close(model.statusEntered) })
		<-model.statusRelease
	}
	model.mu.Lock()
	defer model.mu.Unlock()
	return append([]string(nil), model.dirtyDocuments...), model.pendingWrite
}

func (model *shutdownModel) ClaimPreparedQuit(id string) *apperr.ClassifiedError {
	model.SetPendingClose(apperr.PendingClose{ID: id, Owner: apperr.PendingCloseOwnerNative})
	model.BeginShutdownDiscard()
	return nil
}

func (model *shutdownModel) BeginShutdownDrain() {
	model.mu.Lock()
	model.draining = true
	model.drainCalls++
	model.drainStartedBeforeConfirmation = true
	model.mu.Unlock()
}

func (model *shutdownModel) BeginShutdownDiscard() {
	model.mu.Lock()
	model.discardCalls++
	model.drainCalls++
	model.draining = true
	model.drainStartedBeforeConfirmation = true
	model.mu.Unlock()
}

func (model *shutdownModel) DrainDiscardBeforeClose() *apperr.ClassifiedError {
	model.mu.Lock()
	model.discardDrainCalls++
	entered, release, refusal := model.discardEntered, model.discardRelease, model.discardRefusal
	model.mu.Unlock()
	if entered != nil {
		entered <- struct{}{}
	}
	if release != nil {
		<-release
	}
	return refusal
}

func (model *shutdownModel) EndShutdownDrain() {
	model.mu.Lock()
	entered, release := model.endEntered, model.endRelease
	model.mu.Unlock()
	if entered != nil {
		entered <- struct{}{}
	}
	if release != nil {
		<-release
	}
	model.mu.Lock()
	model.draining = false
	model.mu.Unlock()
}

func (model *shutdownModel) DrainBeforeClose() *apperr.ClassifiedError {
	return nil
}

func (model *shutdownModel) SetPendingClose(pending apperr.PendingClose) {
	model.mu.Lock()
	model.pendingCloseID = pending.ID
	model.pendingOwner = pending.Owner
	model.ownerHistory = append(model.ownerHistory, pending.Owner)
	model.mu.Unlock()
}

func (model *shutdownModel) ClearPendingClose(id string) {
	model.mu.Lock()
	if model.pendingCloseID == id {
		model.pendingCloseID = ""
		model.pendingOwner = ""
	}
	model.mu.Unlock()
}

type confirmationPort struct {
	mu                  sync.Mutex
	answer              bool
	answered            chan []string
	confirmedDocuments  []string
	confirmCalls        int
	possibleUndelivered bool
}

func (port *confirmationPort) confirm(_ context.Context, documents []string, possible bool) (bool, error) {
	port.mu.Lock()
	answer := port.answer
	port.confirmedDocuments = append([]string(nil), documents...)
	port.confirmCalls++
	port.possibleUndelivered = possible
	port.mu.Unlock()
	port.answered <- append([]string(nil), documents...)
	return answer, nil
}

func (port *confirmationPort) documents() []string {
	port.mu.Lock()
	defer port.mu.Unlock()
	return append([]string(nil), port.confirmedDocuments...)
}

// waitForShutdownState waits for the owner to settle in want. The confirmation
// port answers before the owner records the outcome, so the state is read
// only after the owner's own goroutine has had the chance to finish.
func waitForShutdownState(t *testing.T, owner *application.ShutdownOwner, want application.ShutdownState, label string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for owner.Snapshot().State != want {
		if time.Now().After(deadline) {
			t.Fatalf("%s state = %q, want %q", label, owner.Snapshot().State, want)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func (port *confirmationPort) wait(t *testing.T) {
	t.Helper()
	select {
	case <-port.answered:
	case <-time.After(time.Second):
		t.Fatal("native confirmation was not requested")
	}
}

type shutdownClock struct {
	mu     sync.Mutex
	now    time.Time
	timers []*shutdownTimer
}

func (clock *shutdownClock) Now() time.Time {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	return clock.now
}

func (clock *shutdownClock) AfterFunc(delay time.Duration, callback func()) application.ShutdownTimer {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	timer := &shutdownTimer{callback: callback, deadline: clock.now.Add(delay)}
	clock.timers = append(clock.timers, timer)
	return timer
}

func (clock *shutdownClock) fire(elapsed time.Duration) {
	clock.mu.Lock()
	clock.now = clock.now.Add(elapsed)
	timers := append([]*shutdownTimer(nil), clock.timers...)
	clock.timers = nil
	clock.mu.Unlock()
	for _, timer := range timers {
		if !timer.isStopped() {
			timer.callback()
		}
	}
}

type shutdownTimer struct {
	mu       sync.Mutex
	deadline time.Time
	stopped  bool
	callback func()
}

func (timer *shutdownTimer) Stop() bool {
	timer.mu.Lock()
	defer timer.mu.Unlock()
	if timer.stopped {
		return false
	}
	timer.stopped = true
	return true
}

func (timer *shutdownTimer) isStopped() bool {
	timer.mu.Lock()
	defer timer.mu.Unlock()
	return timer.stopped
}

var _ application.ShutdownModel = (*shutdownModel)(nil)
var _ application.ShutdownClock = (*shutdownClock)(nil)
