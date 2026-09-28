package appmodel_test

import (
	"errors"
	"reflect"
	"sync/atomic"
	"testing"

	. "github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestDocumentWriteCoordinatorSerializesConcurrentCommits(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	writer := func(snapshot WriteSnapshot) (file.DiskVersion, error) {
		calls.Add(1)
		if snapshot.CanonicalContent == "first" {
			close(started)
			<-release
		}
		return file.DiskVersion{Exists: true, Size: int64(len(snapshot.EncodedData))}, nil
	}
	coordinator := NewDocumentWriteCoordinator(writer)
	firstDone := make(chan error, 1)
	go func() {
		_, err := coordinator.Commit(WriteSnapshot{DocumentID: "doc", ContentRevision: 1, CanonicalContent: "first"})
		firstDone <- err
	}()
	<-started
	secondDone := make(chan struct{})
	go func() {
		_, _ = coordinator.Commit(WriteSnapshot{DocumentID: "doc", ContentRevision: 2, CanonicalContent: "second"})
		close(secondDone)
	}()
	select {
	case <-secondDone:
		t.Fatal("second write completed before the first write released")
	default:
	}
	close(release)
	if err := <-firstDone; err != nil {
		t.Fatalf("first commit: %v", err)
	}
	<-secondDone
	if calls.Load() != 2 {
		t.Fatalf("writer calls = %d, want two serialized commits", calls.Load())
	}
}

func TestDocumentWriteCoordinatorReusesACommittedSnapshotAfterPublicationFailure(t *testing.T) {
	var writes atomic.Int32
	requested := WriteSnapshot{
		DocumentID:       "doc-42",
		ContentRevision:  7,
		CanonicalContent: "exact bytes",
		TargetPath:       "/documents/notes.md",
		EncodedData:      []byte("encoded bytes"),
	}
	version := file.DiskVersion{Exists: true, Size: 12, ModifiedUnixNano: 7, Mode: 0o640}
	coordinator := NewDocumentWriteCoordinator(
		func(snapshot WriteSnapshot) (file.DiskVersion, error) {
			writes.Add(1)
			if !reflect.DeepEqual(snapshot, requested) {
				t.Fatalf("writer snapshot = %+v, want %+v", snapshot, requested)
			}
			return version, nil
		},
		func(CommittedWriteResult) error { return errors.New("state publication failed") },
	)
	first, err := coordinator.Commit(requested)
	if err != nil {
		t.Fatalf("first commit: %v", err)
	}
	if !first.ResyncRequired || !reflect.DeepEqual(first.Snapshot, requested) || !first.DiskVersion.Equal(version) {
		t.Fatalf("first committed record = %+v, want exact resync record", first)
	}
	second, err := coordinator.Commit(requested)
	if err != nil {
		t.Fatalf("replayed commit: %v", err)
	}
	if writes.Load() != 1 || !reflect.DeepEqual(second, first) {
		t.Fatalf("replayed record = %+v, writes=%d; want original record and no replacement", second, writes.Load())
	}
}
