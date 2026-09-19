package application_test

import (
	"context"
	. "github.com/sanyokkua/go_mark_edit/internal/application"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

type recordingNativeWindow struct {
	usableWidth, usableHeight int
	width, height             int
	maximiseCalls, showCalls  int
}

type discardingEmitter struct{}

func (discardingEmitter) EmitStatePatch(context.Context, apperr.AppStatePatch) error { return nil }

func (window *recordingNativeWindow) UsableSize(context.Context) (int, int) {
	return window.usableWidth, window.usableHeight
}
func (window *recordingNativeWindow) SetSize(_ context.Context, width, height int) {
	window.width, window.height = width, height
}
func (window *recordingNativeWindow) Maximise(context.Context) { window.maximiseCalls++ }
func (window *recordingNativeWindow) Show(context.Context)     { window.showCalls++ }

// Restore clamps only dimensions to the public usable display, keeps native
// maximization independent, and makes visibility a one-shot readiness action.
func TestNativeWindowRestoresHiddenThenShowsOnce(t *testing.T) {
	model := appmodel.NewAppModelServiceForHost(appmodel.WithEmitter(discardingEmitter{}))
	width, height := 2400, 1600
	maximized := true
	if err := model.SetUILayout(context.Background(), apperr.UILayout{
		WindowWidth: &width, WindowHeight: &height, WindowMaximized: &maximized,
	}); err != nil {
		t.Fatalf("set layout: %v", err)
	}
	if err := model.FlushPendingUILayout(); err != nil {
		t.Fatalf("flush layout: %v", err)
	}
	native := &recordingNativeWindow{usableWidth: 1280, usableHeight: 900}
	service := NewNativeWindowService(model, native)
	if err := service.Restore(context.Background()); err != nil {
		t.Fatalf("restore: %v", err)
	}
	if native.width != 1280 || native.height != 900 || native.maximiseCalls != 1 || native.showCalls != 0 {
		t.Fatalf("native restore = %+v, want clamped hidden maximized restore", native)
	}
	service.FrontendReady(context.Background())
	service.FrontendReady(context.Background())
	if native.showCalls != 1 {
		t.Fatalf("show calls = %d, want exactly one", native.showCalls)
	}
}
