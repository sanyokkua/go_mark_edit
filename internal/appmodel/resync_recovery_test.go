package appmodel

import (
	"errors"
	"strings"
	"testing"
	"time"
)

type recoveryTimerEvent struct {
	delay time.Duration
	fn    func()
}

type recoveryTestTimer struct {
	events []recoveryTimerEvent
}

func (timer *recoveryTestTimer) AfterFunc(delay time.Duration, fn func()) {
	timer.events = append(timer.events, recoveryTimerEvent{delay: delay, fn: fn})
}

func (timer *recoveryTestTimer) fireNext(t *testing.T, want time.Duration) {
	t.Helper()
	if len(timer.events) == 0 {
		t.Fatal("recovery timer has no scheduled attempt")
	}
	event := timer.events[0]
	timer.events = timer.events[1:]
	if event.delay != want {
		t.Fatalf("scheduled delay = %s, want %s", event.delay, want)
	}
	event.fn()
}

func TestResyncRetriesAt250msAndOneSecond(t *testing.T) {
	timer := &recoveryTestTimer{}
	attempts := 0
	recovery := NewProjectionRecovery(func() error {
		attempts++
		return errors.New("projection unavailable")
	}, timer)
	recovery.Start()
	if attempts != 1 {
		t.Fatalf("immediate attempts = %d, want 1", attempts)
	}
	timer.fireNext(t, 250*time.Millisecond)
	timer.fireNext(t, time.Second)
	if attempts != 3 {
		t.Fatalf("bounded attempts = %d, want 3", attempts)
	}
}

func TestResyncExhaustionShowsPersistentRecoverySurface(t *testing.T) {
	timer := &recoveryTestTimer{}
	recovery := NewProjectionRecovery(func() error { return errors.New("projection unavailable") }, timer)
	recovery.Start()
	timer.fireNext(t, 250*time.Millisecond)
	timer.fireNext(t, time.Second)
	surface := recovery.Surface()
	if !surface.Persistent || !surface.SavedOnDisk || !surface.CommandsBlocked || !surface.CloseBlocked {
		t.Fatalf("recovery surface = %+v, want persistent saved-on-disk blocked state", surface)
	}
	if surface.Message == "" || !containsAll(surface.Message, "saved on disk", "recovery failed") {
		t.Fatalf("recovery message = %q, want saved-on-disk recovery wording", surface.Message)
	}
}

func TestResyncRetryRestartsBoundedCycle(t *testing.T) {
	timer := &recoveryTestTimer{}
	attempts := 0
	recovery := NewProjectionRecovery(func() error {
		attempts++
		return errors.New("projection unavailable")
	}, timer)
	recovery.Start()
	timer.fireNext(t, 250*time.Millisecond)
	timer.fireNext(t, time.Second)
	if attempts != 3 {
		t.Fatalf("first cycle attempts = %d, want 3", attempts)
	}

	recovery.Retry()
	if attempts != 4 {
		t.Fatalf("retry immediate attempts = %d, want 4", attempts)
	}
	timer.fireNext(t, 250*time.Millisecond)
	timer.fireNext(t, time.Second)
	if attempts != 6 {
		t.Fatalf("retry cycle attempts = %d, want 6", attempts)
	}
}

func TestQuitAndDiscardRequiresSecondConfirmation(t *testing.T) {
	timer := &recoveryTestTimer{}
	recovery := NewProjectionRecovery(func() error { return errors.New("projection unavailable") }, timer)
	recovery.Start()
	timer.fireNext(t, 250*time.Millisecond)
	timer.fireNext(t, time.Second)
	prompt := recovery.RequestQuitAndDiscard([]string{"Report.md", "Notes.md"})
	if prompt.Authorized || len(prompt.DocumentNames) != 2 || prompt.Message == "" {
		t.Fatalf("first recovery quit result = %+v, want second confirmation", prompt)
	}
	if recovery.QuitAndDiscardAuthorized() {
		t.Fatal("first confirmation authorized recovery quit")
	}
	if err := recovery.ConfirmQuitAndDiscard(); err != nil {
		t.Fatalf("second confirmation: %v", err)
	}
	if !recovery.QuitAndDiscardAuthorized() {
		t.Fatal("second confirmation did not authorize recovery quit")
	}
}

func containsAll(value string, wanted ...string) bool {
	for _, part := range wanted {
		if !strings.Contains(value, part) {
			return false
		}
	}
	return true
}
