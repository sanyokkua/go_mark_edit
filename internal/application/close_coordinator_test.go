package application

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

func TestNativeCloseCoordinator(t *testing.T) {
	var (
		mu        sync.Mutex
		emissions int
		quits     int
	)
	coordinator := NewCloseCoordinator(
		func(context.Context) {
			mu.Lock()
			emissions++
			mu.Unlock()
		},
		func(context.Context) {
			mu.Lock()
			quits++
			mu.Unlock()
		},
	)

	if !coordinator.BeforeClose(context.Background()) {
		t.Fatal("first native close was not vetoed")
	}
	if !coordinator.BeforeClose(context.Background()) {
		t.Fatal("repeated native close was not vetoed")
	}
	mu.Lock()
	if emissions != 1 || quits != 0 {
		t.Fatalf("request emissions = %d and quits = %d, want one request and no quit", emissions, quits)
	}
	mu.Unlock()

	coordinator.Cancel()
	if !coordinator.BeforeClose(context.Background()) {
		t.Fatal("native close after cancellation was not vetoed")
	}
	mu.Lock()
	if emissions != 2 {
		t.Fatalf("request emissions after cancellation = %d, want two", emissions)
	}
	mu.Unlock()
}

func TestOnBeforeCloseVetoAndOneShotPermit(t *testing.T) {
	quitCalls := 0
	coordinator := NewCloseCoordinator(nil, func(context.Context) { quitCalls++ })

	if !coordinator.BeforeClose(context.Background()) {
		t.Fatal("native close was not vetoed")
	}
	if err := coordinator.Authorize(context.Background()); err != nil {
		t.Fatalf("authorize native close: %v", err)
	}
	if quitCalls != 1 {
		t.Fatalf("quit calls = %d, want one", quitCalls)
	}
	if coordinator.BeforeClose(context.Background()) {
		t.Fatal("one-shot permit did not allow the authorized close")
	}
	if !coordinator.BeforeClose(context.Background()) {
		t.Fatal("second native close was not vetoed after permit consumption")
	}
	if quitCalls != 1 {
		t.Fatalf("repeated close caused %d quit calls, want one", quitCalls)
	}
}

// Proves: FR-FT-027
func TestDrainFailureCreatesNoPermit(t *testing.T) {
	repository := &closeTestLayoutRepository{err: errors.New("layout write failed")}
	model := appmodel.NewAppModelServiceWithLayoutRepositoryAndTimer(
		discardingCloseStatePatchEmitter{},
		repository,
		closeTestLayoutTimer{},
	)
	holder := NewApplicationContextHolder(nil, nil)
	holder.AppModelService = model
	quitCalls := 0
	holder.SetCloseCoordinator(NewCloseCoordinator(nil, func(context.Context) { quitCalls++ }))
	width := 1200
	if err := model.SetUILayout(context.Background(), apperr.UILayout{WindowWidth: &width}); err != nil {
		t.Fatalf("queue layout: %v", err)
	}
	if !holder.BeforeClose(context.Background()) {
		t.Fatal("native close was not vetoed")
	}
	refusal := holder.AuthorizeQuit(context.Background())
	if refusal == nil {
		t.Fatal("AuthorizeQuit succeeded after a failed layout drain")
	}
	// FR-FT-027 names the shape, not just the fact of a failure: a classified
	// io-failure carrying Retry. Until T134 this crossed the bridge as an
	// untyped WireError inside a VoidResult, so the window that stayed open
	// offered the user no way to try again.
	if refusal.Category != apperr.ClassifiedIOFailure {
		t.Fatalf("failed drain category = %q, want %q", refusal.Category, apperr.ClassifiedIOFailure)
	}
	if refusal.Remediation() != apperr.RemediationRetry {
		t.Fatalf("failed drain remediation = %q, want %q", refusal.Remediation(), apperr.RemediationRetry)
	}
	if err := refusal.Validate(); err != nil {
		t.Fatalf("failed drain is not a valid classified error: %v", err)
	}
	if quitCalls != 0 {
		t.Fatalf("failed drain invoked Quit %d times", quitCalls)
	}
	if !holder.BeforeClose(context.Background()) {
		t.Fatal("failed drain accidentally created a permit")
	}

	repository.err = nil
	if retried := holder.AuthorizeQuit(context.Background()); retried != nil {
		t.Fatalf("retry AuthorizeQuit: %+v", retried)
	}
	if quitCalls != 1 || holder.BeforeClose(context.Background()) {
		t.Fatalf("successful retry quit calls = %d or permit was not consumed", quitCalls)
	}
}

// Proves: FR-FT-027 (partial — "During FR-FT-016 recovery, only the
// twice-confirmed Quit and discard newer unsaved changes path may bypass
// successful rehydration; it MUST still satisfy this cancellation, drain, and
// permit sequence". The two confirmations themselves are user-facing and are
// proved in frontend/src/App.test.tsx; this proves the backend half — the
// recovery route takes the same drain and the same one-use permit as an
// ordinary quit, with no bypass.)
//
// T124 removed this test's first half. It drove appmodel.ProjectionRecovery,
// a module with no non-test importer that never ran in production, so its
// assertions recorded a second confirmation that no user could reach. The
// reachable second confirmation lives in the close path the frontend drives,
// and is tested there.
func TestRecoveryQuitStillDrainsAndPermits(t *testing.T) {
	repository := &closeTestLayoutRepository{}
	model := appmodel.NewAppModelServiceWithLayoutRepositoryAndTimer(
		discardingCloseStatePatchEmitter{},
		repository,
		closeTestLayoutTimer{},
	)
	holder := NewApplicationContextHolder(nil, nil)
	holder.AppModelService = model
	quitCalls := 0
	holder.SetCloseCoordinator(NewCloseCoordinator(nil, func(context.Context) { quitCalls++ }))
	model.SetStartupError(errors.New("startup recovery is visible"))
	width := 1200
	if err := model.SetUILayout(context.Background(), apperr.UILayout{WindowWidth: &width}); err != nil {
		t.Fatalf("queue recovery layout: %v", err)
	}
	if !holder.BeforeClose(context.Background()) {
		t.Fatal("recovery close was not vetoed")
	}
	if refusal := holder.AuthorizeQuit(context.Background()); refusal != nil {
		t.Fatalf("recovery AuthorizeQuit: %+v", refusal)
	}
	if repository.writes == 0 || quitCalls != 1 {
		t.Fatalf("recovery close writes = %d and quit calls = %d, want drain then one quit", repository.writes, quitCalls)
	}
	if holder.BeforeClose(context.Background()) {
		t.Fatal("recovery close permit was not consumed")
	}
}

// Proves: FR-FT-027 (partial — "shutdown MUST ... drain accepted ... autosave
// work before creating a one-use close permit or invoking native Quit", from the
// composition root rather than from the model. The classified-refusal half is
// proved by TestDrainFailureCreatesNoPermit above.)
//
// The assertion reads the file from inside the Quit callback because that is the
// only point that is unambiguously after the permit was armed: if the accepted
// revision is on disk by then, the drain cannot have been skipped or deferred.
func TestAuthorizeQuitDrainsAcceptedAutosaveBeforeQuitting(t *testing.T) {
	model := appmodel.NewAppModelServiceWithAutosaveTimer(
		discardingCloseStatePatchEmitter{},
		&countingAutosaveClock{},
	)
	path := filepath.Join(t.TempDir(), "quit-drain.md")
	if err := os.WriteFile(path, []byte("base\n"), 0o640); err != nil {
		t.Fatalf("write quit-drain fixture: %v", err)
	}
	state, err := model.GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState before open: %v", err)
	}
	opened := model.OpenPath(context.Background(), path, state.Snapshot.TabSetRevision)
	if opened.Status != apperr.OpenStatusOpened {
		t.Fatalf("OpenPath outcome = %+v", opened)
	}
	if err := model.UpdateBuffer(context.Background(), opened.DocumentID, "accepted before quit\n"); err != nil {
		t.Fatalf("accepted edit: %v", err)
	}

	holder := NewApplicationContextHolder(nil, nil)
	holder.AppModelService = model
	var (
		quitCalls  int
		diskAtQuit []byte
	)
	holder.SetCloseCoordinator(NewCloseCoordinator(nil, func(context.Context) {
		quitCalls++
		diskAtQuit, _ = os.ReadFile(path)
	}))

	if !holder.BeforeClose(context.Background()) {
		t.Fatal("native close was not vetoed")
	}
	if refusal := holder.AuthorizeQuit(context.Background()); refusal != nil {
		t.Fatalf("AuthorizeQuit: %+v", refusal)
	}
	if quitCalls != 1 {
		t.Fatalf("quit calls = %d, want one", quitCalls)
	}
	if string(diskAtQuit) != "accepted before quit\n" {
		t.Fatalf("bytes on disk when native Quit ran = %q, want the last accepted revision", diskAtQuit)
	}
}

// countingAutosaveClock never fires. The drain must run the scheduled write
// itself; a clock that fires would let a test pass on the debounce elapsing.
type countingAutosaveClock struct{}

func (countingAutosaveClock) AfterFunc(time.Duration, func()) appmodel.AutosaveTimer {
	return stoppedAutosaveTimer{}
}

type stoppedAutosaveTimer struct{}

func (stoppedAutosaveTimer) Stop() bool { return true }

type closeTestLayoutTimer struct{}

func (closeTestLayoutTimer) AfterFunc(_ time.Duration, _ func()) {}

type discardingCloseStatePatchEmitter struct{}

func (discardingCloseStatePatchEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error {
	return nil
}

type closeTestLayoutRepository struct {
	err    error
	writes int
}

func (repository *closeTestLayoutRepository) Read(context.Context, string) (appmodel.VersionedLayoutValue, bool, error) {
	return appmodel.VersionedLayoutValue{}, false, nil
}

func (repository *closeTestLayoutRepository) Write(_ context.Context, _ string, value appmodel.VersionedLayoutValue) (appmodel.LayoutWriteResult, error) {
	if repository.err != nil {
		return appmodel.LayoutWriteResult{}, repository.err
	}
	repository.writes++
	return appmodel.LayoutWriteResult{Applied: true, Value: value}, nil
}
