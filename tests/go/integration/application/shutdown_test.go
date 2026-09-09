package application_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
)

func TestCloseBeforeFrontendReadyDrainsAndRequiresNativeConfirmation(t *testing.T) {
	model := &shutdownModel{dirtyDocuments: []string{"Draft.md"}}
	clock := &shutdownClock{now: time.Unix(100, 0)}
	confirmation := &confirmationPort{answer: false, answered: make(chan []string, 1)}
	owner := application.NewShutdownOwner(model,
		application.WithShutdownClock(clock),
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
	if owner.Snapshot().State != application.ShutdownIdle {
		t.Fatalf("cancelled confirmation state = %q, want idle", owner.Snapshot().State)
	}
	if owner.Snapshot().FrontendReady {
		t.Fatal("cancelled pre-ready close marked the frontend ready")
	}

	confirmation.answer = true
	if !owner.BeforeClose(context.Background()) {
		t.Fatal("second dirty close before frontend readiness was not vetoed")
	}
	confirmation.wait(t)
	if owner.Snapshot().State != application.ShutdownExiting {
		t.Fatalf("confirmed pre-ready state = %q, want exiting", owner.Snapshot().State)
	}
}

func TestCloseAfterReadyReemitsTheSameRequestAndDiscoversPendingState(t *testing.T) {
	model := &shutdownModel{}
	clock := &shutdownClock{now: time.Unix(200, 0)}
	var events []string
	var mu sync.Mutex
	owner := application.NewShutdownOwner(model,
		application.WithShutdownClock(clock),
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
		application.WithShutdownClock(clock),
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
		application.WithShutdownClock(clock),
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
	if owner.Snapshot().State != application.ShutdownIdle {
		t.Fatalf("cancelled timeout confirmation state = %q, want idle", owner.Snapshot().State)
	}

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

type shutdownModel struct {
	mu                             sync.Mutex
	dirtyDocuments                 []string
	pendingWrite                   bool
	pendingCloseID                 string
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

func (model *shutdownModel) BeginShutdownDrain() {
	model.mu.Lock()
	model.draining = true
	model.drainCalls++
	model.drainStartedBeforeConfirmation = true
	model.mu.Unlock()
}

func (model *shutdownModel) EndShutdownDrain() {
	model.mu.Lock()
	model.draining = false
	model.mu.Unlock()
}

func (model *shutdownModel) DrainBeforeClose() *apperr.ClassifiedError {
	model.mu.Lock()
	model.mu.Unlock()
	return nil
}

func (model *shutdownModel) SetPendingClose(id string) {
	model.mu.Lock()
	model.pendingCloseID = id
	model.mu.Unlock()
}

func (model *shutdownModel) ClearPendingClose(id string) {
	model.mu.Lock()
	if model.pendingCloseID == id {
		model.pendingCloseID = ""
	}
	model.mu.Unlock()
}

type confirmationPort struct {
	mu                 sync.Mutex
	answer             bool
	answered           chan []string
	confirmedDocuments []string
	confirmCalls       int
}

func (port *confirmationPort) confirm(_ context.Context, documents []string) (bool, error) {
	port.mu.Lock()
	answer := port.answer
	port.confirmedDocuments = append([]string(nil), documents...)
	port.confirmCalls++
	port.mu.Unlock()
	port.answered <- append([]string(nil), documents...)
	return answer, nil
}

func (port *confirmationPort) documents() []string {
	port.mu.Lock()
	defer port.mu.Unlock()
	return append([]string(nil), port.confirmedDocuments...)
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
