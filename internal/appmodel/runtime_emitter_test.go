package appmodel

import (
	"context"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// Proves: STORY-011-AC-3
// The runtime emitter rejects a missing Wails lifecycle context before attempting a publication.
func TestRuntimeStatePatchEmitterRejectsNilContext(t *testing.T) {
	err := (RuntimeStatePatchEmitter{}).EmitStatePatch(missingWailsContext(), apperr.AppStatePatch{Revision: 1})
	if err == nil {
		t.Fatal("nil runtime context publication succeeded, want an error")
	}
}

func missingWailsContext() context.Context {
	return nil
}
