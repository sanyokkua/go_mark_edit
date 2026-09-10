package bridge

import (
	"sync"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

const (
	OutcomeRetention = 60 * time.Second
	OutcomeCapacity  = 256
)

type outcomeEntry struct {
	done          chan struct{}
	outcome       any
	completedAt   time.Time
	completed     bool
	completionSeq uint64
}

// OutcomeCache retains completed command outcomes and coordinates duplicate
// in-flight requests. It is safe for concurrent handler calls.
type OutcomeCache struct {
	mu        sync.Mutex
	now       func() time.Time
	entries   map[string]*outcomeEntry
	sequence  uint64
	completed int
}

// NewOutcomeCache creates a process-local cache. The optional clock exists so
// unit tests can advance retention and capacity deterministically.
func NewOutcomeCache(clocks ...any) *OutcomeCache {
	now := time.Now
	if len(clocks) > 0 && clocks[0] != nil {
		switch clock := clocks[0].(type) {
		case func() time.Time:
			now = clock
		case interface{ Now() time.Time }:
			now = clock.Now
		}
	}
	return &OutcomeCache{
		now:     now,
		entries: make(map[string]*outcomeEntry),
	}
}

// Once validates the request, joins an in-flight call, or returns a retained
// completed outcome. The function is executed at most once for a retained ID.
func Once[T any](cache *OutcomeCache, request Request, fn func() T) (outcome T) {
	if !request.IsValid() {
		return setFailureValue(outcome, Fail(
			apperrFailureValidation,
			"request",
			"A request identity is required.",
			remediationNone,
		))
	}
	if cache == nil {
		defer func() { outcome = withRequestID(outcome, request.ID) }()
		defer Guard(&outcome)
		outcome = fn()
		return outcome
	}

	entry, owner := cache.begin(request.ID)
	if !owner {
		<-entry.done
		cache.mu.Lock()
		defer cache.mu.Unlock()
		if cached, ok := entry.outcome.(T); ok {
			return cached
		}
		return outcome
	}

	defer func() { cache.complete(entry, outcome) }()
	defer func() { outcome = withRequestID(outcome, request.ID) }()
	defer Guard(&outcome)
	outcome = withRequestID(fn(), request.ID)
	return outcome
}

func (cache *OutcomeCache) begin(id string) (*outcomeEntry, bool) {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.now == nil {
		cache.now = time.Now
	}
	if cache.entries == nil {
		cache.entries = make(map[string]*outcomeEntry)
	}

	if entry, ok := cache.entries[id]; ok {
		if entry.completed && cache.now().Sub(entry.completedAt) >= OutcomeRetention {
			delete(cache.entries, id)
			cache.completed--
		} else {
			return entry, false
		}
	}

	entry := &outcomeEntry{done: make(chan struct{})}
	cache.entries[id] = entry
	return entry, true
}

func (cache *OutcomeCache) complete(entry *outcomeEntry, outcome any) {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if entry.completed {
		return
	}
	entry.outcome = outcome
	entry.completedAt = cache.now()
	cache.sequence++
	entry.completionSeq = cache.sequence
	entry.completed = true
	cache.completed++
	close(entry.done)
	cache.evictOldest()
}

func (cache *OutcomeCache) evictOldest() {
	for cache.completed > OutcomeCapacity {
		var oldestID string
		var oldest *outcomeEntry
		for id, entry := range cache.entries {
			if !entry.completed || (oldest != nil && entry.completionSeq >= oldest.completionSeq) {
				continue
			}
			oldestID = id
			oldest = entry
		}
		if oldest == nil {
			return
		}
		delete(cache.entries, oldestID)
		cache.completed--
	}
}

// setFailureValue keeps Once generic while still producing the required
// validation envelope for every apperr result type.
func setFailureValue[T any](outcome T, failure apperr.Failure) T {
	setFailure(&outcome, failure)
	return outcome
}

// These aliases keep the generic cache implementation readable while the
// category and remediation vocabularies remain owned by apperr.
const (
	apperrFailureValidation apperr.ClassifiedErrorCategory = apperr.ClassifiedValidation
	remediationNone         apperr.ClassifiedRemediation   = apperr.RemediationNone
)
