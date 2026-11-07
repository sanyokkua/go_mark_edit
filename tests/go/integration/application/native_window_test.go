package application_test

import (
	"context"
	. "github.com/sanyokkua/go_mark_edit/internal/application"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

type recordingNativeWindow struct {
	usableWidth, usableHeight int
	width, height             int
	maximiseCalls, showCalls  int
	printCalls                int
}

type discardingEmitter struct{}

func (discardingEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error { return nil }

func (window *recordingNativeWindow) UsableSize(context.Context) (int, int) {
	return window.usableWidth, window.usableHeight
}
func (window *recordingNativeWindow) SetSize(_ context.Context, width, height int) {
	window.width, window.height = width, height
}
func (window *recordingNativeWindow) Maximise(context.Context) { window.maximiseCalls++ }
func (window *recordingNativeWindow) Show(context.Context)     { window.showCalls++ }
func (window *recordingNativeWindow) Print(context.Context)    { window.printCalls++ }

// Restore clamps only dimensions to the public usable display, keeps native
// maximization independent, and makes visibility a one-shot readiness action.
func TestNativeWindowRestoresHiddenThenShowsOnce(t *testing.T) {
	model := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingEmitter{}))
	width, height := 2400, 1600
	maximized := true
	if err := model.SetUILayout(context.Background(), apperr.UILayout{
		WindowWidth: &width, WindowHeight: &height, WindowMaximized: &maximized,
	}); err != nil {
		t.Fatalf("set layout: %v", err)
	}
	if err := model.FlushPendingUILayout(); err != nil {
		t.Fatalf("flush layout: %v", err)
	}
	native := &recordingNativeWindow{usableWidth: 1280, usableHeight: 900}
	service := NewNativeWindowService(model, native)
	if err := service.Restore(context.Background()); err != nil {
		t.Fatalf("restore: %v", err)
	}
	if native.width != 1280 || native.height != 900 || native.maximiseCalls != 1 || native.showCalls != 0 {
		t.Fatalf("native restore = %+v, want clamped hidden maximized restore", native)
	}
	service.FrontendReady(context.Background())
	service.FrontendReady(context.Background())
	if native.showCalls != 1 {
		t.Fatalf("show calls = %d, want exactly one", native.showCalls)
	}
}

type nativeWindowClock struct {
	mu     sync.Mutex
	now    time.Time
	timers []*nativeWindowTimer
}
type nativeWindowTimer struct {
	clock    *nativeWindowClock
	deadline time.Time
	callback func()
	stopped  bool
}

func (c *nativeWindowClock) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.now }
func (c *nativeWindowClock) AfterFunc(d time.Duration, f func()) ShutdownTimer {
	c.mu.Lock()
	defer c.mu.Unlock()
	timer := &nativeWindowTimer{clock: c, deadline: c.now.Add(d), callback: f}
	c.timers = append(c.timers, timer)
	return timer
}
func (t *nativeWindowTimer) Stop() bool {
	t.clock.mu.Lock()
	defer t.clock.mu.Unlock()
	active := !t.stopped
	t.stopped = true
	return active
}
func (c *nativeWindowClock) advance(d time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(d)
	var callbacks []func()
	for _, timer := range c.timers {
		if !timer.stopped && !timer.deadline.After(c.now) {
			timer.stopped = true
			callbacks = append(callbacks, timer.callback)
		}
	}
	c.mu.Unlock()
	for _, callback := range callbacks {
		callback()
	}
}
func (c *nativeWindowClock) timerCount() int { c.mu.Lock(); defer c.mu.Unlock(); return len(c.timers) }

type deadlineNativeWindow struct {
	shown                chan struct{}
	clock                *nativeWindowClock
	timersDuringSize     int
	timersDuringMaximise int
}

func (*deadlineNativeWindow) UsableSize(context.Context) (int, int) { return 1280, 900 }
func (w *deadlineNativeWindow) SetSize(context.Context, int, int) {
	w.timersDuringSize = w.clock.timerCount()
}
func (w *deadlineNativeWindow) Maximise(context.Context) {
	w.timersDuringMaximise = w.clock.timerCount()
}
func (w *deadlineNativeWindow) Show(context.Context) { w.shown <- struct{}{} }
func (*deadlineNativeWindow) Print(context.Context)  {}

func newDeadlineWindow(t *testing.T) (*NativeWindowService, *deadlineNativeWindow, *nativeWindowClock) {
	t.Helper()
	model := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingEmitter{}))
	clock := &nativeWindowClock{}
	native := &deadlineNativeWindow{shown: make(chan struct{}, 2), clock: clock}
	return NewNativeWindowService(model, native, NativeWindowOption{Clock: clock}), native, clock
}
func assertShowCount(t *testing.T, window *deadlineNativeWindow, want int) {
	t.Helper()
	if got := len(window.shown); got != want {
		t.Fatalf("show calls = %d, want %d", got, want)
	}
}
func TestNativeWindowShowsAfterReadinessDeadline(t *testing.T) {
	service, native, clock := newDeadlineWindow(t)
	if err := service.Restore(context.Background()); err != nil {
		t.Fatal(err)
	}
	if native.timersDuringSize != 0 || clock.timerCount() != 1 {
		t.Fatalf("timer order: during size %d, after restore %d", native.timersDuringSize, clock.timerCount())
	}
	clock.advance(11 * time.Second)
	assertShowCount(t, native, 0)
	clock.advance(time.Second)
	assertShowCount(t, native, 1)
	service.FrontendReady(context.Background())
	service.FrontendReady(context.Background())
	assertShowCount(t, native, 1)
}
func TestNativeWindowReadinessCancelsWatchdog(t *testing.T) {
	service, native, clock := newDeadlineWindow(t)
	if err := service.Restore(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := service.Restore(context.Background()); err != nil {
		t.Fatal(err)
	}
	if clock.timerCount() != 1 {
		t.Fatalf("timers = %d, want 1", clock.timerCount())
	}
	service.FrontendReady(context.Background())
	clock.advance(12 * time.Second)
	assertShowCount(t, native, 1)
}
func TestNativeWindowReadyBeforeRestore(t *testing.T) {
	service, native, clock := newDeadlineWindow(t)
	service.FrontendReady(context.Background())
	assertShowCount(t, native, 0)
	if err := service.Restore(context.Background()); err != nil {
		t.Fatal(err)
	}
	clock.advance(12 * time.Second)
	assertShowCount(t, native, 1)
}
func TestNativeWindowHeadlessWatchdog(t *testing.T) {
	t.Setenv("GOMARKEDIT_E2E_HEADLESS", "1")
	service, native, clock := newDeadlineWindow(t)
	if err := service.Restore(context.Background()); err != nil {
		t.Fatal(err)
	}
	clock.advance(12 * time.Second)
	service.FrontendReady(context.Background())
	assertShowCount(t, native, 0)
}
func TestNativeWindowReadinessRacesWatchdog(t *testing.T) {
	service, native, clock := newDeadlineWindow(t)
	if err := service.Restore(context.Background()); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); clock.advance(12 * time.Second) }()
	go func() { defer wg.Done(); service.FrontendReady(context.Background()) }()
	wg.Wait()
	assertShowCount(t, native, 1)
}

func TestNativeWindowWatchdogStartsAfterMaximise(t *testing.T) {
	model := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingEmitter{}))
	maximized := true
	if err := model.SetUILayout(context.Background(), apperr.UILayout{WindowMaximized: &maximized}); err != nil {
		t.Fatal(err)
	}
	if err := model.FlushPendingUILayout(); err != nil {
		t.Fatal(err)
	}
	clock := &nativeWindowClock{}
	native := &deadlineNativeWindow{shown: make(chan struct{}, 2), clock: clock, timersDuringMaximise: -1}
	service := NewNativeWindowService(model, native, NativeWindowOption{Clock: clock})
	if err := service.Restore(context.Background()); err != nil {
		t.Fatal(err)
	}
	if native.timersDuringMaximise != 0 || clock.timerCount() != 1 {
		t.Fatalf("timer order: during maximise %d, after restore %d", native.timersDuringMaximise, clock.timerCount())
	}
}
