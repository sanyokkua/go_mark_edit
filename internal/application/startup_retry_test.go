package application

import (
	"context"
	"reflect"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// Proves: FR-WS-013
func TestApplicationHandlerExposesTypedRecoveringRetryStartup(t *testing.T) {
	handlerType := reflect.TypeOf((*ApplicationHandler)(nil))
	method, ok := handlerType.MethodByName("RetryStartup")
	if !ok {
		t.Fatal("ApplicationHandler has no RetryStartup typed command")
	}
	if method.Type.NumIn() != 1 || method.Type.NumOut() != 1 || method.Type.Out(0) != reflect.TypeOf(apperr.VoidResult{}) {
		t.Fatalf("RetryStartup signature = %s, want zero arguments and one apperr.VoidResult", method.Type)
	}
	contextType := reflect.TypeOf((*context.Context)(nil)).Elem()
	for index := 1; index < method.Type.NumIn(); index++ {
		if method.Type.In(index) == contextType {
			t.Fatalf("RetryStartup accepts context.Context at argument %d", index)
		}
	}
}
