package appmodel

import (
	"context"
	"errors"
	"os"
	"sync/atomic"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
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

func TestExplicitSaveSerializesWithAutosave(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, clock)
	path, documentID := openAutosaveDocument(t, service, "base\n")
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	var active atomic.Int32
	var maxActive atomic.Int32
	var revisions atomic.Int32
	service.SetWriteExecutorForTesting(func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		calls.Add(1)
		current := active.Add(1)
		for {
			old := maxActive.Load()
			if current <= old || maxActive.CompareAndSwap(old, current) {
				break
			}
		}
		defer active.Add(-1)
		revisions.Add(int32(snapshot.ContentRevision))
		if snapshot.ContentRevision == 1 {
			close(started)
			<-release
		}
		replaced, err := file.AtomicReplace(file.AtomicReplaceRequest{
			TargetPath: snapshot.TargetPath, Data: snapshot.encodedData, ExpectedVersion: snapshot.ExpectedDiskVersion,
		})
		return replaced.Version, err
	})

	if err := service.UpdateBuffer(context.Background(), documentID, "first\n"); err != nil {
		t.Fatalf("first edit: %v", err)
	}
	if !clock.FireNextAsync() {
		t.Fatal("autosave timer did not start")
	}
	<-started
	if err := service.UpdateBuffer(context.Background(), documentID, "second\n"); err != nil {
		t.Fatalf("second edit: %v", err)
	}
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before explicit Save: %v", err)
	}
	explicitDone := make(chan apperr.WriteResult, 1)
	go func() {
		explicitDone <- service.Save(context.Background(), documentID, state.Snapshot.Documents[documentID].ContentRevision, "")
	}()
	select {
	case result := <-explicitDone:
		t.Fatalf("explicit Save completed before autosave released: %+v", result)
	default:
	}
	close(release)
	result := <-explicitDone
	if result.Status != apperr.WriteStatusCommitted || result.Data == nil || result.Data.WrittenContentRevision != 2 {
		t.Fatalf("explicit Save result = %+v, want one committed revision-2 write", result)
	}
	if calls.Load() != 2 || maxActive.Load() != 1 || revisions.Load() != 3 {
		t.Fatalf("calls=%d maxActive=%d revision-sum=%d, want serialized revisions 1 and 2", calls.Load(), maxActive.Load(), revisions.Load())
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read final file: %v", err)
	}
	if string(disk) != "second\n" {
		t.Fatalf("final disk bytes = %q, want latest explicit revision", disk)
	}
}

func TestExplicitSaveReusesMatchingAutosaveCommit(t *testing.T) {
	clock := &fakeAutosaveClock{}
	service := NewAppModelServiceWithAutosaveTimer(&recordingEmitter{}, clock)
	path, documentID := openAutosaveDocument(t, service, "base\n")
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	service.SetWriteExecutorForTesting(func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		calls.Add(1)
		if snapshot.ContentRevision == 1 {
			close(started)
			<-release
		}
		replaced, err := file.AtomicReplace(file.AtomicReplaceRequest{
			TargetPath: snapshot.TargetPath, Data: snapshot.encodedData, ExpectedVersion: snapshot.ExpectedDiskVersion,
		})
		return replaced.Version, err
	})

	if err := service.UpdateBuffer(context.Background(), documentID, "same revision\n"); err != nil {
		t.Fatalf("edit: %v", err)
	}
	if !clock.FireNextAsync() {
		t.Fatal("autosave timer did not start")
	}
	<-started
	state, err := service.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before explicit Save: %v", err)
	}
	explicitDone := make(chan apperr.WriteResult, 1)
	go func() {
		explicitDone <- service.Save(context.Background(), documentID, state.Snapshot.Documents[documentID].ContentRevision, "")
	}()
	select {
	case result := <-explicitDone:
		t.Fatalf("explicit Save completed before autosave released: %+v", result)
	default:
	}
	close(release)
	result := <-explicitDone
	if result.Status != apperr.WriteStatusCommitted || result.Data == nil || result.Data.WrittenContentRevision != 1 {
		t.Fatalf("explicit Save result = %+v, want one committed revision-1 write", result)
	}
	if calls.Load() != 1 {
		t.Fatalf("replacement calls = %d, want autosave commit reused by explicit Save", calls.Load())
	}
	disk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read final file: %v", err)
	}
	if string(disk) != "same revision\n" {
		t.Fatalf("final disk bytes = %q, want autosaved content", disk)
	}
}
