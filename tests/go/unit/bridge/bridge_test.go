package bridge_test

import (
	"encoding/json"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
)

type cacheOutcome struct {
	Value int
}

// A request carries its identity under the bridge's id field, and an empty
// identity is refused before the command body runs.
func TestRequestIdentityAndEmptyIDValidation(t *testing.T) {
	encoded, err := json.Marshal(bridge.Request{ID: "request-1"})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	if string(encoded) != `{"id":"request-1"}` {
		t.Fatalf("request JSON = %s, want an id field", encoded)
	}

	cache := bridge.NewOutcomeCache()
	calls := 0
	result := bridge.Once(cache, bridge.Request{}, func() apperr.VoidResult {
		calls++
		return apperr.VoidResult{}
	})
	if calls != 0 {
		t.Fatalf("empty request id executed the command %d times, want 0", calls)
	}
	if result.Category != apperr.ClassifiedValidation {
		t.Fatalf("empty request failure category = %q, want validation", result.Category)
	}
}

// The shared guard converts a panic into one safe internal failure on the
// result envelope and does not let the panic escape the handler boundary.
func TestGuardTurnsPanicIntoInternalFailure(t *testing.T) {
	result := func() (result apperr.VoidResult) {
		defer bridge.Guard(&result)
		panic("private implementation detail")
	}()

	if result.Category != apperr.ClassifiedInternal {
		t.Fatalf("panic failure category = %q, want internal", result.Category)
	}
	if result.Message == "private implementation detail" {
		t.Fatal("panic value leaked into the bridge failure message")
	}
}

// Every result envelope embeds the same Failure shape used by Guard and Fail.
func TestResultEnvelopesEmbedOneFailure(t *testing.T) {
	resultTypes := []reflect.Type{
		reflect.TypeFor[apperr.VoidResult](),
		reflect.TypeFor[apperr.ClassifiedVoidResult](),
		reflect.TypeFor[apperr.StringResult](),
		reflect.TypeFor[apperr.SettingsResult](),
		reflect.TypeFor[apperr.DocumentTransitionResult](),
		reflect.TypeFor[apperr.TabTransitionResult](),
		reflect.TypeFor[apperr.ClosePlanResult](),
		reflect.TypeFor[apperr.PathCommandResult](),
		reflect.TypeFor[apperr.CommittedWriteResult](),
		reflect.TypeFor[apperr.WriteResult](),
		reflect.TypeFor[apperr.ConflictResult](),
		reflect.TypeFor[apperr.OpenResult](),
		reflect.TypeFor[apperr.StateResult](),
	}
	for _, resultType := range resultTypes {
		field, ok := resultType.FieldByName("Failure")
		if !ok || field.Type != reflect.TypeFor[apperr.Failure]() {
			t.Errorf("%s does not embed exactly one apperr.Failure", resultType)
		}
	}
}

// A retry with the same request id receives the original completed outcome
// without executing the command body again.
func TestOutcomeCacheReturnsOriginalOutcomeForRetry(t *testing.T) {
	cache := bridge.NewOutcomeCache()
	calls := 0
	request := bridge.Request{ID: "same-request"}
	first := bridge.Once(cache, request, func() cacheOutcome {
		calls++
		return cacheOutcome{Value: 7}
	})
	second := bridge.Once(cache, request, func() cacheOutcome {
		calls++
		return cacheOutcome{Value: 99}
	})

	if calls != 1 {
		t.Fatalf("cached request executed %d times, want 1", calls)
	}
	if second != first || second.Value != 7 {
		t.Fatalf("retry outcome = %+v, want original %+v", second, first)
	}
}

// A panic in a command becomes a stable internal result before the cache marks
// the request complete, so a retry cannot receive a zero-value envelope.
func TestOutcomeCacheStoresInternalFailureWhenCommandPanics(t *testing.T) {
	cache := bridge.NewOutcomeCache()
	request := bridge.Request{ID: "panic-request"}
	calls := 0
	first := bridge.Once(cache, request, func() apperr.VoidResult {
		calls++
		panic("private implementation detail")
	})
	second := bridge.Once(cache, request, func() apperr.VoidResult {
		calls++
		return apperr.VoidResult{}
	})

	if calls != 1 {
		t.Fatalf("panicking request executed %d times, want 1", calls)
	}
	if first != second || second.Category != apperr.ClassifiedInternal || second.ID != request.ID {
		t.Fatalf("cached panic outcome = %+v, want one internal result with id %q", second, request.ID)
	}
}

// A classified failure uses a safe subject and the request identity is added
// only after the command result is built.
func TestFailureSubjectAndRequestIdentityAreSafe(t *testing.T) {
	cache := bridge.NewOutcomeCache()
	request := bridge.Request{ID: "safe-request"}
	result := bridge.Once(cache, request, func() apperr.VoidResult {
		return apperr.VoidResult{Failure: bridge.Fail("io-failure", "/private/user/notes.md", "The file could not be read.", apperr.RemediationRetry)}
	})

	if result.Subject != "notes.md" || result.ID != request.ID || result.Remediation != apperr.RemediationRetry {
		t.Fatalf("failure = %+v, want safe subject, request id and retry remediation", result.Failure)
	}
}

// A legacy classified error projected into a result also populates the shared
// envelope, including the document identity used for retry deduplication.
func TestClassifiedProjectionPopulatesFailureEnvelope(t *testing.T) {
	classified := bridge.ClassifiedWithID(
		apperr.ClassifiedConflict,
		"notes.md",
		"The file changed on disk.",
		apperr.RemediationRetry,
		"document-1",
	)
	result := bridge.FromClassified[apperr.WriteResult](classified, apperr.WriteStatusRefused)

	if result.Category != apperr.ClassifiedConflict || result.Subject != "notes.md" || result.ID != "document-1" || result.Error == nil {
		t.Fatalf("projected result = %+v, want shared failure and legacy error", result)
	}
}

// A second caller with an in-flight identity waits for and joins the first
// execution instead of starting a duplicate command.
func TestOutcomeCacheJoinsInFlightRequest(t *testing.T) {
	cache := bridge.NewOutcomeCache()
	request := bridge.Request{ID: "in-flight"}
	started := make(chan struct{})
	release := make(chan struct{})
	var calls int
	var callsMu sync.Mutex
	firstDone := make(chan cacheOutcome, 1)
	go func() {
		firstDone <- bridge.Once(cache, request, func() cacheOutcome {
			callsMu.Lock()
			calls++
			callsMu.Unlock()
			close(started)
			<-release
			return cacheOutcome{Value: 11}
		})
	}()
	<-started

	secondDone := make(chan cacheOutcome, 1)
	go func() {
		secondDone <- bridge.Once(cache, request, func() cacheOutcome {
			callsMu.Lock()
			calls++
			callsMu.Unlock()
			return cacheOutcome{Value: 22}
		})
	}()
	select {
	case got := <-secondDone:
		t.Fatalf("in-flight caller returned early with %+v", got)
	case <-time.After(25 * time.Millisecond):
	}

	close(release)
	first := <-firstDone
	second := <-secondDone
	callsMu.Lock()
	gotCalls := calls
	callsMu.Unlock()
	if gotCalls != 1 {
		t.Fatalf("in-flight request executed %d times, want 1", gotCalls)
	}
	if first != second {
		t.Fatalf("joined outcome = %+v, want first outcome %+v", second, first)
	}
}

// Completed outcomes expire after sixty seconds and a cache retains only the
// 256 newest completed identities, evicting the oldest first.
func TestOutcomeCacheExpiresAndEvictsWithFakeClock(t *testing.T) {
	now := time.Unix(100, 0)
	cache := bridge.NewOutcomeCache(func() time.Time { return now })
	request := bridge.Request{ID: "expires"}
	calls := 0
	bridge.Once(cache, request, func() cacheOutcome {
		calls++
		return cacheOutcome{Value: calls}
	})
	now = now.Add(60*time.Second + time.Nanosecond)
	got := bridge.Once(cache, request, func() cacheOutcome {
		calls++
		return cacheOutcome{Value: calls}
	})
	if got.Value != 2 || calls != 2 {
		t.Fatalf("expired outcome = %+v with %d calls, want fresh value 2 and two calls", got, calls)
	}

	now = time.Unix(200, 0)
	capacityCache := bridge.NewOutcomeCache(func() time.Time { return now })
	for index := 0; index < 256; index++ {
		id := "capacity-" + string(rune(index+1))
		bridge.Once(capacityCache, bridge.Request{ID: id}, func() cacheOutcome {
			return cacheOutcome{Value: index}
		})
	}
	bridge.Once(capacityCache, bridge.Request{ID: "capacity-257"}, func() cacheOutcome {
		return cacheOutcome{Value: 257}
	})
	freshCalls := 0
	oldest := bridge.Request{ID: "capacity-\x01"}
	bridge.Once(capacityCache, oldest, func() cacheOutcome {
		freshCalls++
		return cacheOutcome{Value: 256}
	})
	if freshCalls != 1 {
		t.Fatalf("oldest outcome was not evicted after the 257th completion")
	}
}

// The event names are defined once in the bridge package and retain the wire
// spelling used by the frontend event contract.
func TestBridgeEventNames(t *testing.T) {
	want := map[string]string{
		"state patch":                 "state:patch",
		"state error":                 "state:error",
		"application close requested": "application:close-requested",
	}
	got := map[string]string{
		"state patch":                 bridge.EventStatePatch,
		"state error":                 bridge.EventStateError,
		"application close requested": bridge.EventApplicationCloseRequested,
	}
	for name, expected := range want {
		if got[name] != expected {
			t.Errorf("%s event = %q, want %q", name, got[name], expected)
		}
	}
}
