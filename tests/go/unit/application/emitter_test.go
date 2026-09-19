package application_test

import (
	"context"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/application"
)

func TestRuntimeEmitterRejectsNilContext(t *testing.T) {
	emitter := application.RuntimeEmitter{}
	var nilContext context.Context

	if err := emitter.EmitStatePatch(nilContext, apperr.AppStatePatch{Revision: 1}); err == nil {
		t.Fatal("EmitStatePatch accepted a nil context")
	}
	if err := emitter.EmitAsyncError(nilContext, apperr.WireError{}); err == nil {
		t.Fatal("EmitAsyncError accepted a nil context")
	}
}
