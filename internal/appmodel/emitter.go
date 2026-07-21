package appmodel

import (
	"context"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// StatePatchEmitter emits the package-owned state-patch event after a command succeeds.
type StatePatchEmitter interface {
	EmitStatePatch(ctx context.Context, patch apperr.AppStatePatch) error
}
