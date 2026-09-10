package appmodel

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// drainBeforeCloseWithin runs the shutdown drain with a real deadline. Every
// assertion in this file goes through it on purpose: flushAutosaveMode has spun
// forever once already, on a scheduled document that runAutosave declined and
// left in place, and a drain that never returns is a window the user cannot
// close. A hung drain must fail this suite in seconds rather than wait for the
// package test timeout.
func drainBeforeCloseWithin(t *testing.T, service *AppModelService, limit time.Duration) *apperr.ClassifiedError {
	t.Helper()
	drained := make(chan *apperr.ClassifiedError, 1)
	go func() { drained <- service.DrainBeforeClose() }()
	select {
	case classified := <-drained:
		return classified
	case <-time.After(limit):
		t.Fatalf("DrainBeforeClose did not return within %s", limit)
		return nil
	}
}

// Proves: FR-FT-027 (partial — the accepted-autosave half of "drain accepted
// layout, editor, and autosave work before creating a one-use close permit".
// The in-flight-write half is proved by TestDrainBeforeCloseWaitsForAWriteInFlight
// and the layout half by TestDrainFailureCreatesNoPermit in internal/application.)
func TestDrainBeforeCloseRunsAcceptedAutosaveWork(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithAutosaveTimer(clock))
	path, documentID := openAutosaveDocument(t, service, "base\n")

	if err := service.UpdateBuffer(context.Background(), documentID, "accepted before quit\n"); err != nil {
		t.Fatalf("accepted edit: %v", err)
	}
	if clock.Pending() != 1 {
		t.Fatalf("pending debounces after the accepted edit = %d, want 1", clock.Pending())
	}

	if classified := drainBeforeCloseWithin(t, service, 5*time.Second); classified != nil {
		t.Fatalf("DrainBeforeClose error = %+v, want none", classified)
	}

	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read drained file: %v", err)
	}
	if string(disk) != "accepted before quit\n" {
		t.Fatalf("bytes on disk after the drain = %q, want the last accepted revision", disk)
	}
	if clock.Pending() != 0 {
		t.Fatalf("pending debounces after the drain = %d, want none left armed", clock.Pending())
	}
}

// Proves: FR-FT-027 (partial — "drain accepted ... editor ... work": an explicit
// Save already inside atomic replacement is waited for, never cancelled, because
// AtomicReplace has no safe interruption point.)
func TestDrainBeforeCloseWaitsForAWriteInFlight(t *testing.T) {
	clock := &fakeAutosaveClock{}
	var executor WriteExecutor
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithAutosaveTimer(clock), WithWriteExecutor(func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		return executor(snapshot)
	}))
	// Autosave off isolates the explicit-write wait from the debounce flush the
	// previous test covers; with both armed a blocked executor would stall the
	// autosave flush instead and the assertion would not say which wait held.
	service.SetAutosaveEnabled(false)

	entered := make(chan struct{})
	release := make(chan struct{})
	var once sync.Once
	executor = func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		once.Do(func() { close(entered) })
		<-release
		if err := os.WriteFile(snapshot.TargetPath, snapshot.EncodedData, 0o640); err != nil {
			return file.DiskVersion{}, err
		}
		return file.CurrentDiskVersion(snapshot.TargetPath)
	}

	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "committed by the blocked write\n"); err != nil {
		t.Fatalf("edit before the explicit save: %v", err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before the explicit save: %v", err)
	}
	revision := state.Snapshot.Documents[documentID].ContentRevision

	saved := make(chan apperr.WriteResult, 1)
	go func() { saved <- service.Save(context.Background(), documentID, revision, "") }()
	<-entered

	drained := make(chan *apperr.ClassifiedError, 1)
	go func() { drained <- service.DrainBeforeClose() }()
	select {
	case classified := <-drained:
		t.Fatalf("DrainBeforeClose returned %+v while a write was still in flight", classified)
	case <-time.After(250 * time.Millisecond):
	}

	close(release)
	select {
	case classified := <-drained:
		if classified != nil {
			t.Fatalf("DrainBeforeClose error after the write finished = %+v, want none", classified)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("DrainBeforeClose did not return within five seconds of the write finishing")
	}

	result := <-saved
	if result.Status != apperr.WriteStatusCommitted {
		t.Fatalf("explicit save status = %q, want committed", result.Status)
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read the drained file: %v", err)
	}
	if string(disk) != "committed by the blocked write\n" {
		t.Fatalf("bytes on disk after the drain = %q, want the committed write", disk)
	}
}

// Proves: FR-FT-027 — the "cancel scheduled work that can no longer run" clause:
// work that was scheduled but has since become ineligible is cancelled rather
// than waited for, and the drain still returns.
//
// The clause read "cancel in-flight long operations" until the 2026-08-17
// amendment, and this anchor named that wording while the body proved the
// debounce behaviour below — an anchor asserting a claim its body does not make,
// which converts a coverage gap into a false record of coverage. Nothing in this
// backend implements the stronger reading and nothing here ever proved it:
// AtomicReplace has no cancellation point by design, ReadClassifiedStable takes
// no context, and the write coordinator serializes rather than interrupts. The
// requirement and the anchor now say the same thing.
//
// This is also the regression guard for the live-lock this area has already had.
// runAutosave declines a document that has become autosave-ineligible and leaves
// its entry in place; a drain that loops until the entry disappears never
// returns, which is a window that cannot be closed rather than a completed drain.
func TestDrainBeforeCloseCancelsWorkThatCanNoLongerRun(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithAutosaveTimer(clock))
	path, documentID := openAutosaveDocument(t, service, "base\n")

	if err := service.UpdateBuffer(context.Background(), documentID, "never reaches disk\n"); err != nil {
		t.Fatalf("accepted edit: %v", err)
	}
	if clock.Pending() != 1 {
		t.Fatalf("pending debounces after the accepted edit = %d, want 1", clock.Pending())
	}
	setAutosaveDocumentFlags(service, documentID, true, file.CapabilityWritable)

	if classified := drainBeforeCloseWithin(t, service, 5*time.Second); classified != nil {
		t.Fatalf("DrainBeforeClose error = %+v, want none", classified)
	}
	if clock.Pending() != 0 {
		t.Fatalf("pending debounces after the drain = %d, want the unrunnable one cancelled", clock.Pending())
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read the detached file: %v", err)
	}
	if string(disk) != "base\n" {
		t.Fatalf("detached document wrote %q, want the file untouched", disk)
	}
}

// Proves: FR-FT-027 (partial — "A ... drain failure MUST ... provide a classified
// io-failure error with Retry". That the same failure creates no permit is proved
// by TestDrainFailureCreatesNoPermit in internal/application.)
func TestDrainBeforeCloseClassifiesALayoutFailure(t *testing.T) {
	repository := &failingDrainLayoutRepository{}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithLayoutRepository(repository), WithClock(noopDrainLayoutTimer{}))
	width := 1200
	if err := service.SetUILayout(context.Background(), apperr.UILayout{WindowWidth: &width}); err != nil {
		t.Fatalf("queue layout intent: %v", err)
	}

	classified := drainBeforeCloseWithin(t, service, 5*time.Second)
	if classified == nil {
		t.Fatal("DrainBeforeClose succeeded despite a failing layout repository")
	}
	if classified.Category != apperr.ClassifiedIOFailure {
		t.Fatalf("drain failure category = %q, want %q", classified.Category, apperr.ClassifiedIOFailure)
	}
	if classified.Remediation() != apperr.RemediationRetry {
		t.Fatalf("drain failure remediation = %q, want %q", classified.Remediation(), apperr.RemediationRetry)
	}
}

type noopDrainLayoutTimer struct{}

func (noopDrainLayoutTimer) AfterFunc(time.Duration, func()) {}

type failingDrainLayoutRepository struct{}

func (*failingDrainLayoutRepository) Read(context.Context, string) (VersionedLayoutValue, bool, error) {
	return VersionedLayoutValue{}, false, nil
}

func (*failingDrainLayoutRepository) Write(context.Context, string, VersionedLayoutValue) (LayoutWriteResult, error) {
	return LayoutWriteResult{}, os.ErrPermission
}
