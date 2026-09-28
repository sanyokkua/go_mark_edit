package appmodel

import (
	"sync"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/file"
)

// conflictQueueEntry is intentionally immutable after insertion. Keeping the
// compared revision and disk version here prevents a later edit from silently
// resolving a different comparison.
type conflictQueueEntry struct {
	DocumentID      string
	ContentRevision uint64
	DiskVersion     file.DiskVersion
	Preview         apperr.ConflictPreview
}

// conflictQueue serializes decisions without deciding tab order itself. The
// authoritative order is supplied by the appmodel on each Current call.
type conflictQueue struct {
	mu      sync.Mutex
	pending map[string]conflictQueueEntry
	active  string
}

func newConflictQueue() *conflictQueue {
	return &conflictQueue{pending: make(map[string]conflictQueueEntry)}
}

func (queue *conflictQueue) Enqueue(entry conflictQueueEntry) {
	queue.mu.Lock()
	defer queue.mu.Unlock()
	queue.pending[entry.DocumentID] = entry
}

func (queue *conflictQueue) Remove(documentID string) {
	queue.mu.Lock()
	defer queue.mu.Unlock()
	delete(queue.pending, documentID)
	if queue.active == documentID {
		queue.active = ""
	}
}

func (queue *conflictQueue) Contains(documentID string) bool {
	queue.mu.Lock()
	defer queue.mu.Unlock()
	_, ok := queue.pending[documentID]
	return ok
}

func (queue *conflictQueue) current(order []string) (conflictQueueEntry, bool) {
	queue.mu.Lock()
	defer queue.mu.Unlock()
	if queue.active != "" {
		entry, ok := queue.pending[queue.active]
		if ok {
			return entry, true
		}
		queue.active = ""
	}
	for _, documentID := range order {
		if entry, ok := queue.pending[documentID]; ok {
			queue.active = documentID
			return entry, true
		}
	}
	return conflictQueueEntry{}, false
}

func (queue *conflictQueue) blockedDocumentIDs() []string {
	queue.mu.Lock()
	defer queue.mu.Unlock()
	ids := make([]string, 0, len(queue.pending))
	for documentID := range queue.pending {
		ids = append(ids, documentID)
	}
	return ids
}

func (queue *conflictQueue) len() int {
	queue.mu.Lock()
	defer queue.mu.Unlock()
	return len(queue.pending)
}
