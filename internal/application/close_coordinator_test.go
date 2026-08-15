package application

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
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
	if err := holder.AuthorizeQuit(context.Background()); err == nil {
		t.Fatal("AuthorizeQuit succeeded after a failed layout drain")
	} else {
		wire := apperr.ToWire(zerolog.Nop(), err)
		if wire.Code != apperr.CodeIO || !wire.Retryable {
			t.Fatalf("failed drain wire error = %+v, want retryable io", wire)
		}
	}
	if quitCalls != 0 {
		t.Fatalf("failed drain invoked Quit %d times", quitCalls)
	}
	if !holder.BeforeClose(context.Background()) {
		t.Fatal("failed drain accidentally created a permit")
	}

	repository.err = nil
	if err := holder.AuthorizeQuit(context.Background()); err != nil {
		t.Fatalf("retry AuthorizeQuit: %v", err)
	}
	if quitCalls != 1 || holder.BeforeClose(context.Background()) {
		t.Fatalf("successful retry quit calls = %d or permit was not consumed", quitCalls)
	}
}

func TestRecoveryQuitStillDrainsAndPermits(t *testing.T) {
	recovery := appmodel.NewProjectionRecovery(
		func() error { return errors.New("projection unavailable") },
		immediateRecoveryTimer{},
	)
	recovery.Start()
	if prompt := recovery.RequestQuitAndDiscard([]string{"Report.md"}); prompt.Authorized {
		t.Fatal("first recovery quit request was already authorized")
	}
	if recovery.QuitAndDiscardAuthorized() {
		t.Fatal("first recovery quit request bypassed confirmation")
	}
	if err := recovery.ConfirmQuitAndDiscard(); err != nil {
		t.Fatalf("confirm recovery quit: %v", err)
	}
	if !recovery.QuitAndDiscardAuthorized() {
		t.Fatal("second recovery confirmation did not authorize discard quit")
	}

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
	if err := holder.AuthorizeQuit(context.Background()); err != nil {
		t.Fatalf("recovery AuthorizeQuit: %v", err)
	}
	if repository.writes == 0 || quitCalls != 1 {
		t.Fatalf("recovery close writes = %d and quit calls = %d, want drain then one quit", repository.writes, quitCalls)
	}
	if holder.BeforeClose(context.Background()) {
		t.Fatal("recovery close permit was not consumed")
	}
}

type closeTestLayoutTimer struct{}

func (closeTestLayoutTimer) AfterFunc(_ time.Duration, _ func()) {}

type immediateRecoveryTimer struct{}

func (immediateRecoveryTimer) AfterFunc(_ time.Duration, callback func()) { callback() }

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
