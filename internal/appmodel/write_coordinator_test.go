package appmodel

import (
	"errors"
	"sync/atomic"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestWriteCoordinator(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	var active atomic.Int32
	var maxActive atomic.Int32
	writer := func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		if snapshot.CanonicalContent == "first" {
			close(started)
		}
		current := active.Add(1)
		for {
			old := maxActive.Load()
			if current <= old || maxActive.CompareAndSwap(old, current) {
				break
			}
		}
		defer active.Add(-1)
		calls.Add(1)
		if snapshot.CanonicalContent == "first" {
			<-release
		}
		return file.DiskVersion{Exists: true, Size: int64(len(snapshot.CanonicalContent))}, nil
	}
	coordinator := NewDocumentWriteCoordinator(writer)
	firstDone := make(chan CommittedWriteResult, 1)
	firstErr := make(chan error, 1)
	go func() {
		result, err := coordinator.Commit(WriteSnapshot{DocumentID: "doc-1", ContentRevision: 1, CanonicalContent: "first"})
		firstDone <- result
		firstErr <- err
	}()
	<-started

	secondDone := make(chan struct{})
	go func() {
		_, _ = coordinator.Commit(WriteSnapshot{DocumentID: "doc-1", ContentRevision: 2, CanonicalContent: "second"})
		close(secondDone)
	}()
	select {
	case <-secondDone:
		t.Fatal("second write completed while first write was in flight")
	default:
	}
	close(release)
	if err := <-firstErr; err != nil {
		t.Fatalf("first write: %v", err)
	}
	<-firstDone
	<-secondDone
	if calls.Load() != 2 || maxActive.Load() != 1 {
		t.Fatalf("calls=%d maxActive=%d, want two serialized writes", calls.Load(), maxActive.Load())
	}
}

func TestCommittedWriteProjectionFailure(t *testing.T) {
	var writes atomic.Int32
	coordinator := NewDocumentWriteCoordinator(
		func(WriteSnapshot) (file.DiskVersion, error) {
			writes.Add(1)
			return file.DiskVersion{Exists: true, Size: 4}, nil
		},
		func(CommittedWriteResult) error { return errors.New("projection delivery failed") },
	)
	result, err := coordinator.Commit(WriteSnapshot{DocumentID: "doc-1", ContentRevision: 4, CanonicalContent: "disk"})
	if err != nil {
		t.Fatalf("committed write returned error: %v", err)
	}
	if !result.ResyncRequired {
		t.Fatalf("result = %+v, want resyncRequired", result)
	}
	if writes.Load() != 1 {
		t.Fatalf("writes = %d, want exactly one replacement", writes.Load())
	}
}

func TestStaleRevisionWriteDoesNotProjectClean(t *testing.T) {
	doc := statusDocument("newer", "old", "writable", SaveOriginOpen)
	doc.metadata.ContentRevision = 2
	doc.committedRevision = 2
	applyCommittedBaseline(&doc, WriteSnapshot{DocumentID: "doc-1", ContentRevision: 1, CanonicalContent: "old"}, file.DiskVersion{Exists: true, Size: 3}, SaveOriginExplicitSave)
	if doc.baseline != "old" || doc.content != "newer" {
		t.Fatalf("stale commit truth = baseline=%q content=%q", doc.baseline, doc.content)
	}
	if got := saveStatusForDocument(&doc); got != SaveStatusUnsavedChanges {
		t.Fatalf("stale commit status = %q, want %q", got, SaveStatusUnsavedChanges)
	}
}

func TestNewerEditRemainsDirty(t *testing.T) {
	doc := statusDocument("newer", "old", "writable", SaveOriginOpen)
	doc.metadata.ContentRevision = 2
	doc.committedRevision = 1
	applyCommittedBaseline(&doc, WriteSnapshot{DocumentID: "doc-1", ContentRevision: 1, CanonicalContent: "old"}, file.DiskVersion{Exists: true, Size: 3}, SaveOriginAutosave)
	if got := saveStatusForDocument(&doc); got != SaveStatusUnsavedChanges {
		t.Fatalf("newer edit status = %q, want %q", got, SaveStatusUnsavedChanges)
	}
}
