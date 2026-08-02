package appmodel

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/db"
)

// deterministicClock gives layout persistence tests explicit control of change identity time.
type deterministicClock struct {
	mu  sync.Mutex
	now time.Time
}

// Retain the shared fixtures as explicit test-only API: later layout tests use
// them without having to duplicate timing, writer, or failed-write mechanics.
var (
	_ = newDeterministicClock
	_ = (*deterministicClock).Now
	_ = (*deterministicClock).Advance
	_ = (*testWriterIdentity).Next
	_ = failedLayoutWrite{}.Err
)

func newDeterministicClock(at time.Time) *deterministicClock {
	return &deterministicClock{now: at}
}

func (clock *deterministicClock) Now() time.Time {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	return clock.now
}

func (clock *deterministicClock) Advance(duration time.Duration) {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	clock.now = clock.now.Add(duration)
}

// deterministicTimer records debounce scheduling without depending on wall-clock sleeps.
type deterministicTimer struct {
	mu       sync.Mutex
	pending  func()
	duration time.Duration
}

func (timer *deterministicTimer) AfterFunc(duration time.Duration, callback func()) {
	timer.mu.Lock()
	defer timer.mu.Unlock()
	timer.duration = duration
	timer.pending = callback
}

func (timer *deterministicTimer) Fire() {
	timer.mu.Lock()
	callback := timer.pending
	timer.pending = nil
	timer.mu.Unlock()
	if callback != nil {
		callback()
	}
}

func (timer *deterministicTimer) Duration() time.Duration {
	timer.mu.Lock()
	defer timer.mu.Unlock()
	return timer.duration
}

// testWriterIdentity creates stable, process-local identities for arbitration tests.
type testWriterIdentity struct {
	id       string
	sequence uint64
}

func (writer *testWriterIdentity) Next() (string, uint64) {
	writer.sequence++
	return writer.id, writer.sequence
}

// failedLayoutWrite supplies a deterministic repository failure without unsafe error text.
type failedLayoutWrite struct{ err error }

func (failure failedLayoutWrite) Err() error {
	if failure.err == nil {
		return errors.New("layout write rejected")
	}
	return failure.err
}

// openTwoLayoutDatabases opens independent SQLite handles for multi-process arbitration cases.
func openTwoLayoutDatabases(t *testing.T) (*db.Database, *db.Database) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "layout.db")
	first, err := db.Open(context.Background(), path)
	if err != nil {
		t.Fatalf("open first layout database: %v", err)
	}
	second, err := db.Open(context.Background(), path)
	if err != nil {
		_ = first.Close()
		t.Fatalf("open second layout database: %v", err)
	}
	t.Cleanup(func() {
		if err := second.Close(); err != nil {
			t.Errorf("close second layout database: %v", err)
		}
		if err := first.Close(); err != nil {
			t.Errorf("close first layout database: %v", err)
		}
	})
	return first, second
}
