package appmodel

import (
	"context"
	"os"
	"testing"
)

// TestAutosaveDisabledWritesNothingToDisk is the assertion the coverage never
// made. The 2026-08-14 walkthrough found the Autosave switch reporting a state
// the application did not honour: with autosave off, an edit still reached the
// disk. Every check that existed asserted the *label*
// (`current-host-walkthrough.md:16` recorded the toggle as working because the
// status bar text round-tripped), so the behaviour and the projection were free
// to disagree.
//
// This asserts the file itself: with autosave disabled, no timer is scheduled
// and the bytes, size and modification time on disk are all untouched.
func TestAutosaveDisabledWritesNothingToDisk(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, clock)
	path, documentID := openAutosaveDocument(t, service, "base\n")

	before, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat before edit: %v", err)
	}

	service.SetAutosaveEnabled(false)
	if service.AutosaveEnabled() {
		t.Fatal("AutosaveEnabled() = true after SetAutosaveEnabled(false)")
	}

	if err := service.UpdateBuffer(context.Background(), documentID, "edited while autosave is off\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}

	// Past the debounce: nothing may be waiting to fire, and nothing may fire.
	if pending := clock.Pending(); pending != 0 {
		t.Fatalf("pending autosave timers = %d, want 0 while autosave is disabled", pending)
	}
	if clock.FireNext() {
		t.Fatal("FireNext fired a timer while autosave is disabled")
	}

	after, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat after edit: %v", err)
	}
	if after.Size() != before.Size() {
		t.Fatalf("size on disk = %d, want %d unchanged", after.Size(), before.Size())
	}
	if !after.ModTime().Equal(before.ModTime()) {
		t.Fatalf("mtime on disk = %v, want %v unchanged", after.ModTime(), before.ModTime())
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	if string(disk) != "base\n" {
		t.Fatalf("bytes on disk = %q, want the untouched original", disk)
	}
}

// TestAutosaveReEnabledResumesWriting guards the other direction, so the fix
// cannot be "never autosave".
func TestAutosaveReEnabledResumesWriting(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, clock)
	path, documentID := openAutosaveDocument(t, service, "base\n")

	service.SetAutosaveEnabled(false)
	if err := service.UpdateBuffer(context.Background(), documentID, "while off\n"); err != nil {
		t.Fatalf("edit while off: %v", err)
	}
	if clock.Pending() != 0 {
		t.Fatalf("pending timers while off = %d, want 0", clock.Pending())
	}

	service.SetAutosaveEnabled(true)
	if !service.AutosaveEnabled() {
		t.Fatal("AutosaveEnabled() = false after SetAutosaveEnabled(true)")
	}
	if err := service.UpdateBuffer(context.Background(), documentID, "while on\n"); err != nil {
		t.Fatalf("edit while on: %v", err)
	}
	if clock.Pending() != 1 {
		t.Fatalf("pending timers after re-enabling = %d, want 1", clock.Pending())
	}
	if !clock.FireNext() {
		t.Fatal("FireNext returned false after re-enabling autosave")
	}

	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	if string(disk) != "while on\n" {
		t.Fatalf("bytes on disk = %q, want the content written after re-enabling", disk)
	}
}
