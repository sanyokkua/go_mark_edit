package application

import (
	"context"
	"errors"
	"sync"

	"github.com/sanyokkua/go_mark_edit/internal/bridge"
)

// NativeCloseRequestEvent is emitted after the native frame asks to close.
// The frontend owns the asynchronous save/discard decision; the native close
// callback remains vetoed until that decision has completed.
const NativeCloseRequestEvent = bridge.EventApplicationCloseRequested

var errNativeCloseNotPending = errors.New("native close request is not pending")

// CloseCoordinator is the small, synchronous half of the native close
// protocol. It deliberately knows nothing about Wails or the editor: those
// dependencies are injected so the permit protocol can be tested in process.
type CloseCoordinator struct {
	mu sync.Mutex

	emitRequest func(context.Context)
	quit        func(context.Context)
	pending     bool
	permit      bool
}

// NewCloseCoordinator creates a native close coordinator with application
// runtime operations supplied by the composition root.
func NewCloseCoordinator(emitRequest func(context.Context), quit func(context.Context)) *CloseCoordinator {
	return &CloseCoordinator{emitRequest: emitRequest, quit: quit}
}

// BeforeClose returns true to veto the native close. The first request emits
// one asynchronous frontend request; repeated native callbacks while that
// request is being resolved are idempotently vetoed.
func (coordinator *CloseCoordinator) BeforeClose(ctx context.Context) bool {
	coordinator.mu.Lock()
	if coordinator.permit {
		coordinator.permit = false
		coordinator.mu.Unlock()
		return false
	}
	if coordinator.pending {
		coordinator.mu.Unlock()
		return true
	}
	coordinator.pending = true
	emitRequest := coordinator.emitRequest
	coordinator.mu.Unlock()

	if emitRequest != nil {
		emitRequest(ctx)
	}
	return true
}

// Cancel clears the in-flight request and any not-yet-consumed permit. It is
// used for every user cancellation and every failed drain so a close cannot
// continue later by accident.
func (coordinator *CloseCoordinator) Cancel() {
	coordinator.mu.Lock()
	coordinator.pending = false
	coordinator.permit = false
	coordinator.mu.Unlock()
}

// Authorize installs exactly one native-close permit and asks the runtime to
// quit. The permit is created immediately before Quit so the next Wails close
// callback consumes it once and only once.
func (coordinator *CloseCoordinator) Authorize(ctx context.Context) error {
	coordinator.mu.Lock()
	if !coordinator.pending {
		coordinator.mu.Unlock()
		return errNativeCloseNotPending
	}
	coordinator.pending = false
	coordinator.permit = true
	quit := coordinator.quit
	coordinator.mu.Unlock()

	if quit != nil {
		quit(ctx)
	}
	return nil
}
