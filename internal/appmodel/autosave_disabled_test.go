package appmodel

import (
	"context"
	"os"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/file"
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
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithAutosaveTimer(clock))
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

// Proves: FR-FT-018 — "Existing dirty documents MUST stay dirty", and its
// companion clause that disabling autosave "MUST never affect untitled or
// read-only documents because they were never eligible".
//
// Its sibling above proves the disk is untouched, and TestAutosaveOffHasNoCatchUp
// proves no timer survives. Neither looks at the projection, and that is the
// half a user sees: the cheapest way to make "no catch-up save" true is to drop
// the pending revision, which would silently clear the dirty dot and project
// the document as saved while the edit exists only in the buffer.
func TestAutosaveOffLeavesExistingDirtyDocumentsDirty(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithAutosaveTimer(clock))

	_, dirtyID := openAutosaveDocument(t, service, "base\n")
	if err := service.UpdateBuffer(context.Background(), dirtyID, "pending when autosave goes off\n"); err != nil {
		t.Fatalf("edit the eligible document: %v", err)
	}

	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before New: %v", err)
	}
	untitled := service.NewDocument(context.Background(), state.Snapshot.TabSetRevision)
	if untitled.Data == nil {
		t.Fatalf("NewDocument = %+v", untitled)
	}
	untitledID := untitled.Data.DocumentID
	if err := service.UpdateBuffer(context.Background(), untitledID, "never eligible\n"); err != nil {
		t.Fatalf("edit the untitled document: %v", err)
	}

	_, readOnlyID := openAutosaveDocument(t, service, "read-only base\n")
	setAutosaveDocumentFlags(service, readOnlyID, false, file.CapabilityUnsafeReadOnly)
	if err := service.UpdateBuffer(context.Background(), readOnlyID, "edited read-only\n"); err != nil {
		t.Fatalf("edit the read-only document: %v", err)
	}

	before, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before disabling autosave: %v", err)
	}
	for _, documentID := range []string{dirtyID, untitledID} {
		if !before.Snapshot.Documents[documentID].Dirty {
			t.Fatalf("document %q was not dirty before autosave was disabled: %+v", documentID, before.Snapshot.Documents[documentID])
		}
	}
	// The read-only document is deliberately *not* expected to be dirty:
	// FR-FT-014 gives read-only capability precedence over every other save
	// status (`service.go:487-489`), so its projection is `read-only` whatever
	// its buffer holds. "Never affected" is therefore asserted as an unchanged
	// projection rather than as an unchanged dirty flag.
	if got := before.Snapshot.Documents[readOnlyID].Status; got != string(SaveStatusReadOnly) {
		t.Fatalf("read-only document status before = %q, want %q", got, SaveStatusReadOnly)
	}

	service.SetAutosaveEnabled(false)

	after, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState after disabling autosave: %v", err)
	}
	for _, documentID := range []string{dirtyID, untitledID} {
		document := after.Snapshot.Documents[documentID]
		if !document.Dirty {
			t.Fatalf("document %q stopped being dirty when autosave was switched off: %+v", documentID, document)
		}
		if document.ContentRevision != before.Snapshot.Documents[documentID].ContentRevision {
			t.Fatalf("document %q lost its accepted revision: %d, want %d", documentID, document.ContentRevision, before.Snapshot.Documents[documentID].ContentRevision)
		}
		if got := document.Status; got != string(SaveStatusUnsavedChanges) {
			t.Fatalf("document %q status = %q, want %q", documentID, got, SaveStatusUnsavedChanges)
		}
	}
	for _, documentID := range []string{untitledID, readOnlyID} {
		if after.Snapshot.Documents[documentID] != before.Snapshot.Documents[documentID] {
			t.Fatalf("switching autosave off changed the never-eligible document %q:\n before = %+v\n after  = %+v", documentID, before.Snapshot.Documents[documentID], after.Snapshot.Documents[documentID])
		}
	}
}

// TestAutosaveReEnabledResumesWriting guards the other direction, so the fix
// cannot be "never autosave".
func TestAutosaveReEnabledResumesWriting(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelService(WithEmitter(&recordingEmitter{}), WithAutosaveTimer(clock))
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
