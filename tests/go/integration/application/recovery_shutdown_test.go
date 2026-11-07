package application_test

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

type failingCloseLayout struct{}

func (failingCloseLayout) Read(context.Context, string) (appmodel.VersionedLayoutValue, bool, error) {
	return appmodel.VersionedLayoutValue{}, false, nil
}
func (failingCloseLayout) Write(context.Context, string, appmodel.VersionedLayoutValue) (appmodel.LayoutWriteResult, error) {
	return appmodel.LayoutWriteResult{}, os.ErrPermission
}

type stalledCloseLayoutTimer struct{}

func (stalledCloseLayoutTimer) AfterFunc(time.Duration, func()) {}

func TestShutdownAuthorizationsAllowLayoutFailure(t *testing.T) {
	for _, discard := range []bool{false, true} {
		t.Run(map[bool]string{false: "normal", true: "discard"}[discard], func(t *testing.T) {
			checkShutdownAuthorizationLayoutFailure(t, discard)
		})
	}
}

func checkShutdownAuthorizationLayoutFailure(t *testing.T, discard bool) {
	t.Helper()
	var logs bytes.Buffer
	model := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingLifecycleEmitter{}), appmodel.WithLogger(zerolog.New(&logs)), appmodel.AppModelOption{LayoutRepository: failingCloseLayout{}, Clock: stalledCloseLayoutTimer{}})
	width := 1200
	if err := model.SetUILayout(context.Background(), apperr.UILayout{WindowWidth: &width}); err != nil {
		t.Fatal(err)
	}
	quit := 0
	owner := application.NewShutdownOwner(model, application.WithNativeQuit(func(context.Context) { quit++ }))
	owner.WindowReady(context.Background())
	if !owner.BeforeClose(context.Background()) {
		t.Fatal("ready close should await authorization")
	}
	id := owner.Snapshot().Request.ID
	var refusal *apperr.ClassifiedError
	if discard {
		refusal = owner.DiscardAndAuthorizeQuit(context.Background(), id)
	} else {
		state, _ := model.GetState(context.Background())
		plan := model.PrepareClose(context.Background(), apperr.ClosePlanQuit, nil, state.Snapshot.TabSetRevision)
		if plan.Error != nil || plan.Data == nil {
			t.Fatalf("prepare = %+v", plan)
		}
		if result := model.ExecuteClosePlan(context.Background(), plan.Data.ID); result.Error != nil {
			t.Fatalf("execute = %+v", result)
		}
		refusal = owner.AuthorizeQuit(context.Background(), id)
	}
	if refusal != nil || quit != 1 {
		t.Fatalf("refusal = %+v, quits = %d", refusal, quit)
	}
	if !bytes.Contains(logs.Bytes(), []byte("layout persistence failed during close")) {
		t.Fatalf("missing close log: %s", logs.String())
	}
}

type recoveryAutosaveClock struct {
	mu     sync.Mutex
	timers []*recoveryAutosaveTimer
}
type recoveryAutosaveTimer struct {
	clock    *recoveryAutosaveClock
	callback func()
	stopped  bool
}

func (c *recoveryAutosaveClock) AfterFunc(_ time.Duration, callback func()) appmodel.AutosaveTimer {
	c.mu.Lock()
	defer c.mu.Unlock()
	timer := &recoveryAutosaveTimer{clock: c, callback: callback}
	c.timers = append(c.timers, timer)
	return timer
}
func (t *recoveryAutosaveTimer) Stop() bool {
	t.clock.mu.Lock()
	defer t.clock.mu.Unlock()
	if t.stopped {
		return false
	}
	t.stopped = true
	return true
}
func (c *recoveryAutosaveClock) fire() bool {
	c.mu.Lock()
	var callback func()
	for _, timer := range c.timers {
		if !timer.stopped {
			timer.stopped = true
			callback = timer.callback
			break
		}
	}
	c.mu.Unlock()
	if callback == nil {
		return false
	}
	callback()
	return true
}

func TestReadyTimeoutWithRealModelHoldsAutosaveAndCancelResumesLatest(t *testing.T) {
	ctx := context.Background()
	autosave := &recoveryAutosaveClock{}
	deadline := &shutdownClock{now: time.Unix(700, 0)}
	model := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingLifecycleEmitter{}), appmodel.AppModelOption{AutosaveTimer: autosave})
	path := filepath.Join(t.TempDir(), "draft.md")
	if err := os.WriteFile(path, []byte("base\n"), 0644); err != nil {
		t.Fatal(err)
	}
	state, err := model.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	opened := model.OpenPath(ctx, path, state.Snapshot.TabSetRevision)
	if opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("open: %+v", opened)
	}
	if err := model.UpdateBuffer(ctx, opened.DocumentID, "first\n"); err != nil {
		t.Fatal(err)
	}
	prompt := make(chan struct{}, 1)
	answer := make(chan bool, 1)
	owner := application.NewShutdownOwner(model, application.ShutdownOption{Clock: deadline}, application.WithNativeConfirmation(func(_ context.Context, _ []string, possible bool) (bool, error) {
		if !possible {
			t.Error("missing possible-undelivered flag")
		}
		prompt <- struct{}{}
		return <-answer, nil
	}))
	owner.WindowReady(ctx)
	owner.BeforeClose(ctx)
	deadline.fire(10 * time.Second)
	select {
	case <-prompt:
	case <-time.After(time.Second):
		t.Fatal("native prompt not shown")
	}
	if bytes, err := os.ReadFile(path); err != nil || string(bytes) != "base\n" {
		t.Fatalf("disk while confirming = %q, %v", bytes, err)
	}
	state, err = model.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if state.Snapshot.PendingClose == nil || state.Snapshot.PendingClose.Owner != apperr.PendingCloseOwnerNative {
		t.Fatalf("pending owner: %+v", state.Snapshot.PendingClose)
	}
	if err := model.UpdateBuffer(ctx, opened.DocumentID, "latest\n"); err != nil {
		t.Fatal(err)
	}
	if autosave.fire() {
		t.Fatal("autosave remained armed during confirmation")
	}
	answer <- false
	waitForShutdownState(t, owner, application.ShutdownIdle, "cancelled native prompt")
	if !autosave.fire() {
		t.Fatal("latest autosave not rearmed")
	}
	if bytes, err := os.ReadFile(path); err != nil || string(bytes) != "latest\n" {
		t.Fatalf("disk after cancel = %q, %v", bytes, err)
	}
}

func TestReadyTimeoutRealModelConfirmedDiscardDoesNotWrite(t *testing.T) {
	ctx := context.Background()
	autosave := &recoveryAutosaveClock{}
	deadline := &shutdownClock{now: time.Unix(900, 0)}
	model := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingLifecycleEmitter{}), appmodel.AppModelOption{AutosaveTimer: autosave})
	path := filepath.Join(t.TempDir(), "draft.md")
	if err := os.WriteFile(path, []byte("base\n"), 0644); err != nil {
		t.Fatal(err)
	}
	state, err := model.GetState(ctx)
	if err != nil {
		t.Fatal(err)
	}
	opened := model.OpenPath(ctx, path, state.Snapshot.TabSetRevision)
	if opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("open: %+v", opened)
	}
	if err := model.UpdateBuffer(ctx, opened.DocumentID, "unsaved\n"); err != nil {
		t.Fatal(err)
	}
	quit := make(chan struct{}, 1)
	owner := application.NewShutdownOwner(model, application.ShutdownOption{Clock: deadline},
		application.WithNativeConfirmation(func(_ context.Context, _ []string, possible bool) (bool, error) {
			if !possible {
				t.Error("missing possible-undelivered flag")
			}
			return true, nil
		}), application.WithNativeQuit(func(context.Context) { quit <- struct{}{} }))
	owner.WindowReady(ctx)
	owner.BeforeClose(ctx)
	deadline.fire(10 * time.Second)
	select {
	case <-quit:
	case <-time.After(time.Second):
		t.Fatal("quit not authorized")
	}
	if autosave.fire() {
		t.Fatal("discard rearmed an autosave")
	}
	if bytes, err := os.ReadFile(path); err != nil || string(bytes) != "base\n" {
		t.Fatalf("disk after discard = %q, %v", bytes, err)
	}
	if owner.BeforeClose(ctx) {
		t.Fatal("native close permit not granted")
	}
}
