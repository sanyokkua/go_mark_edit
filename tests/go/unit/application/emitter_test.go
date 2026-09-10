package application_test

import (
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
)

// Proves: FR-055
func TestRuntimeEmitterRejectsNilContext(t *testing.T) {
	emitter := application.RuntimeEmitter{}

	if err := emitter.EmitStatePatch(nil, apperr.AppStatePatch{Revision: 1}); err == nil {
		t.Fatal("EmitStatePatch accepted a nil context")
	}
	if err := emitter.EmitAsyncError(nil, apperr.WireError{}); err == nil {
		t.Fatal("EmitAsyncError accepted a nil context")
	}
}
