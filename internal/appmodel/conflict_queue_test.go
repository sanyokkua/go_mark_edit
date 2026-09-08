package appmodel

import (
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/file"
)

func TestConflictQueueOneModalInTabOrder(t *testing.T) {
	queue := newConflictQueue()
	queue.Enqueue(conflictQueueEntry{DocumentID: "doc-b", ContentRevision: 2, DiskVersion: file.DiskVersion{Exists: true, Size: 2}})
	queue.Enqueue(conflictQueueEntry{DocumentID: "doc-a", ContentRevision: 1, DiskVersion: file.DiskVersion{Exists: true, Size: 1}})

	current, ok := queue.Current([]string{"doc-a", "doc-b"})
	if !ok || current.DocumentID != "doc-a" {
		t.Fatalf("first modal = %+v, ok=%t, want doc-a", current, ok)
	}
	queue.Enqueue(conflictQueueEntry{DocumentID: "doc-c", ContentRevision: 3})
	current, ok = queue.Current([]string{"doc-b", "doc-a", "doc-c"})
	if !ok || current.DocumentID != "doc-a" {
		t.Fatalf("active modal changed while waiting = %+v, ok=%t", current, ok)
	}
	queue.Remove("doc-a")
	current, ok = queue.Current([]string{"doc-b", "doc-c"})
	if !ok || current.DocumentID != "doc-b" {
		t.Fatalf("next modal = %+v, ok=%t, want authoritative doc-b", current, ok)
	}
}
