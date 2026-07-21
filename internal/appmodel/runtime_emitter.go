package appmodel

import (
	"context"
	"errors"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// RuntimeStatePatchEmitter sends package-owned application-model updates to the webview.
type RuntimeStatePatchEmitter struct{}

// EmitStatePatch implements StatePatchEmitter using Wails' event runtime.
func (RuntimeStatePatchEmitter) EmitStatePatch(ctx context.Context, patch apperr.AppStatePatch) error {
	if ctx == nil {
		return errors.New("wails lifecycle context is required")
	}
	runtime.EventsEmit(ctx, "state:patch", patch)
	return nil
}

var _ StatePatchEmitter = RuntimeStatePatchEmitter{}
