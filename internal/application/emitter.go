package application

import (
	"context"
	"errors"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
	"github.com/sanyokkua/go_mark_edit/internal/bridge"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// RuntimeEmitter sends application-model events through the Wails runtime.
// The appmodel package receives this as an interface and therefore remains
// independent of Wails.
type RuntimeEmitter struct{}

// EmitStatePatch implements appmodel.StatePatchEmitter.
func (RuntimeEmitter) EmitStatePatch(ctx context.Context, patch apperr.AppStatePatch) error {
	if ctx == nil {
		return errors.New("wails lifecycle context is required")
	}
	runtime.EventsEmit(ctx, bridge.EventStatePatch, patch)
	return nil
}

// EmitAsyncError publishes a safe asynchronous failure without changing the
// acknowledged application-model projection.
func (RuntimeEmitter) EmitAsyncError(ctx context.Context, wire apperr.WireError) error {
	if ctx == nil {
		return errors.New("wails lifecycle context is required")
	}
	runtime.EventsEmit(ctx, bridge.EventStateError, wire)
	return nil
}

var _ appmodel.StatePatchEmitter = RuntimeEmitter{}
var _ appmodel.AsyncErrorEmitter = RuntimeEmitter{}
