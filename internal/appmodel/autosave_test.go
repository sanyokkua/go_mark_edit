package appmodel

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/file"
)

type fakeAutosaveClock struct {
	mu     sync.Mutex
	timers []*fakeAutosaveTimer
}

type fakeAutosaveTimer struct {
	clock    *fakeAutosaveClock
	callback func()
	stopped  bool
	fired    bool
}

func (clock *fakeAutosaveClock) AfterFunc(_ time.Duration, callback func()) AutosaveTimer {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	timer := &fakeAutosaveTimer{clock: clock, callback: callback}
	clock.timers = append(clock.timers, timer)
	return timer
}

func (timer *fakeAutosaveTimer) Stop() bool {
	timer.clock.mu.Lock()
	defer timer.clock.mu.Unlock()
	if timer.stopped || timer.fired {
		return false
	}
	timer.stopped = true
	return true
}

func (clock *fakeAutosaveClock) Pending() int {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	pending := 0
	for _, timer := range clock.timers {
		if !timer.stopped && !timer.fired {
			pending++
		}
	}
	return pending
}

func (clock *fakeAutosaveClock) FireNext() bool {
	clock.mu.Lock()
	var callback func()
	for _, timer := range clock.timers {
		if timer.stopped || timer.fired {
			continue
		}
		timer.fired = true
		callback = timer.callback
		break
	}
	clock.mu.Unlock()
	if callback == nil {
		return false
	}
	callback()
	return true
}

func (clock *fakeAutosaveClock) FireNextAsync() bool {
	clock.mu.Lock()
	var callback func()
	for _, timer := range clock.timers {
		if timer.stopped || timer.fired {
			continue
		}
		timer.fired = true
		callback = timer.callback
		break
	}
	clock.mu.Unlock()
	if callback == nil {
		return false
	}
	go callback()
	return true
}

// Proves: FR-FT-017 (partial — debounce and eligibility; "never show a success
// toast" is proved in the frontend by App.test.tsx, where the toast would be)
func TestAutosaveDebounceAndEligibility(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, clock)
	path, documentID := openAutosaveDocument(t, service, "base\n")

	if err := service.UpdateBuffer(context.Background(), documentID, "first\n"); err != nil {
		t.Fatalf("first edit: %v", err)
	}
	if clock.Pending() != 1 {
		t.Fatalf("pending timers after first edit = %d, want 1", clock.Pending())
	}
	if err := service.UpdateBuffer(context.Background(), documentID, "second\n"); err != nil {
		t.Fatalf("second edit: %v", err)
	}
	if clock.Pending() != 1 {
		t.Fatalf("pending timers after replacement = %d, want 1", clock.Pending())
	}
	if !clock.FireNext() {
		t.Fatal("FireNext returned false, want the current debounce")
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read autosaved file: %v", err)
	}
	if string(disk) != "second\n" {
		t.Fatalf("autosaved bytes = %q, want latest accepted content", disk)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after autosave: %v", err)
	}
	if got := state.Snapshot.Documents[documentID].Status; got != string(SaveStatusAutosaved) {
		t.Fatalf("autosaved status = %q, want %q", got, SaveStatusAutosaved)
	}

	newDocument := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
	if newDocument.Data == nil {
		t.Fatalf("NewDocument outcome = %+v", newDocument)
	}
	if err := service.UpdateBuffer(context.Background(), newDocument.Data.DocumentID, "untitled\n"); err != nil {
		t.Fatalf("untitled edit: %v", err)
	}
	if clock.Pending() != 0 {
		t.Fatalf("untitled edit scheduled %d timers, want none", clock.Pending())
	}

	readOnlyPath, readOnlyID := openAutosaveDocument(t, service, "read-only\n")
	setAutosaveDocumentFlags(service, readOnlyID, false, file.CapabilityUnsafeReadOnly)
	if err := service.UpdateBuffer(context.Background(), readOnlyID, "edited read-only\n"); err != nil {
		t.Fatalf("read-only edit: %v", err)
	}
	if clock.Pending() != 0 {
		t.Fatalf("read-only edit scheduled %d timers, want none", clock.Pending())
	}
	if _, err := os.Stat(readOnlyPath); err != nil {
		t.Fatalf("read-only fixture disappeared: %v", err)
	}

	detachedPath, detachedID := openAutosaveDocument(t, service, "detached\n")
	setAutosaveDocumentFlags(service, detachedID, true, file.CapabilityWritable)
	if err := service.UpdateBuffer(context.Background(), detachedID, "edited detached\n"); err != nil {
		t.Fatalf("detached edit: %v", err)
	}
	if clock.Pending() != 0 {
		t.Fatalf("detached edit scheduled %d timers, want none", clock.Pending())
	}
	if _, err := os.Stat(detachedPath); err != nil {
		t.Fatalf("detached fixture disappeared: %v", err)
	}
}

// Proves: FR-FT-018 (partial — cancellation and no catch-up on disk; "existing
// dirty documents MUST stay dirty" is proved as projected state by
// TestAutosaveOffLeavesExistingDirtyDocumentsDirty in autosave_disabled_test.go)
func TestAutosaveOffHasNoCatchUp(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, clock)
	path, documentID := openAutosaveDocument(t, service, "base\n")

	if err := service.UpdateBuffer(context.Background(), documentID, "pending\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	service.SetAutosaveEnabled(false)
	if clock.Pending() != 0 {
		t.Fatalf("pending timers after autosave off = %d, want none", clock.Pending())
	}
	if clock.FireNext() {
		t.Fatal("a cancelled autosave fired after autosave was disabled")
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file after disabling autosave: %v", err)
	}
	if string(disk) != "base\n" {
		t.Fatalf("disk after disabling autosave = %q, want unchanged bytes", disk)
	}

	service.SetAutosaveEnabled(true)
	if clock.Pending() != 0 {
		t.Fatalf("re-enabling autosave scheduled %d catch-up timers, want none", clock.Pending())
	}
	if err := service.UpdateBuffer(context.Background(), documentID, "new edit\n"); err != nil {
		t.Fatalf("edit after re-enabling autosave: %v", err)
	}
	if clock.Pending() != 1 {
		t.Fatalf("new edit after re-enabling autosave scheduled %d timers, want 1", clock.Pending())
	}
	if !clock.FireNext() {
		t.Fatal("new edit debounce did not fire")
	}
	disk, err = os.ReadFile(path)
	if err != nil {
		t.Fatalf("read autosaved file: %v", err)
	}
	if string(disk) != "new edit\n" {
		t.Fatalf("disk after re-enabling autosave = %q, want new edit", disk)
	}
}

func TestAutosaveConflictAndDeletion(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, clock)
	path, documentID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), documentID, "mine\n"); err != nil {
		t.Fatalf("conflict edit: %v", err)
	}
	if err := os.WriteFile(path, []byte("external replacement\n"), 0o640); err != nil {
		t.Fatalf("external replacement: %v", err)
	}
	if !clock.FireNext() {
		t.Fatal("conflict autosave timer did not fire")
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read conflicted file: %v", err)
	}
	if string(disk) != "external replacement\n" {
		t.Fatalf("conflicted autosave changed disk to %q", disk)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after conflict: %v", err)
	}
	metadata := state.Snapshot.Documents[documentID]
	if !metadata.ConflictBlocked || metadata.Status != string(SaveStatusUnsavedChanges) {
		t.Fatalf("conflicted metadata = %+v, want blocked unsaved document", metadata)
	}

	deletionClock := &fakeAutosaveClock{}
	deletionService := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, deletionClock)
	deletedPath, deletedID := openAutosaveDocument(t, deletionService, "base deletion\n")
	if err := deletionService.UpdateBuffer(context.Background(), deletedID, "mine deletion\n"); err != nil {
		t.Fatalf("deletion edit: %v", err)
	}
	if err := os.Remove(deletedPath); err != nil {
		t.Fatalf("delete fixture: %v", err)
	}
	if !deletionClock.FireNext() {
		t.Fatal("deletion autosave timer did not fire")
	}
	deletionState, err := deletionService.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after deletion: %v", err)
	}
	deletedMetadata := deletionState.Snapshot.Documents[deletedID]
	if !deletedMetadata.Detached || !deletedMetadata.Dirty || deletedMetadata.Status != string(SaveStatusUnsavedChanges) {
		t.Fatalf("deleted metadata = %+v, want detached unsaved document", deletedMetadata)
	}
	if _, err := os.Stat(deletedPath); !os.IsNotExist(err) {
		t.Fatalf("deleted path stat error = %v, want file to remain absent", err)
	}
}

func openAutosaveDocument(t *testing.T, service *AppModelService, content string) (string, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "autosave.md")
	if err := os.WriteFile(path, []byte(content), 0o640); err != nil {
		t.Fatalf("write autosave fixture: %v", err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before open: %v", err)
	}
	opened := service.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if opened.Status != OpenStatusOpened || opened.DocumentID == "" {
		t.Fatalf("OpenPath outcome = %+v", opened)
	}
	return path, opened.DocumentID
}

func setAutosaveDocumentFlags(service *AppModelService, documentID string, detached bool, capability file.ReadCapability) {
	service.mu.Lock()
	defer service.mu.Unlock()
	document := service.state.documents[documentID]
	document.detached = detached
	document.metadata.Capability = string(capability)
}

// Proves: FR-FT-011 — the autosave arm of "refuse before disk access without
// matching authorization", specifically that a refused autosave leaves no
// authorization behind. The manual-Save arm is proved in save_test.go.
//
// Autosave calls snapshotForWrite with an empty decision token. On a
// mixed-ending document that never matches, so the unauthorized branch minted a
// fresh single-use authorization into service.normalizations and returned it as
// a needs-normalization result that autosave then discarded. Nothing consumed it
// and nothing cancelled it, so every debounce that fired leaked one more token
// for the lifetime of the process. CancelNormalization existed for exactly this
// and had no caller at all.
func TestRefusedAutosaveLeavesNoNormalizationAuthorizationBehind(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, clock)
	_, documentID := writeMixedDocument(t, service, "first\r\nsecond\nthird\n")

	for attempt := 1; attempt <= 3; attempt++ {
		content := strings.Repeat("edited\n", attempt)
		if err := service.UpdateBuffer(context.Background(), documentID, content); err != nil {
			t.Fatalf("edit %d: %v", attempt, err)
		}
		if !clock.FireNext() {
			t.Fatalf("no debounce pending for edit %d", attempt)
		}
		if leaked := normalizationTokenCount(service); leaked != 0 {
			t.Fatalf("normalization authorizations after %d refused autosave(s) = %d, want 0", attempt, leaked)
		}
	}
}
