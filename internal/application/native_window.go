package application

import (
	"context"
	"sync"

	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

const (
	defaultWindowWidth  = 1024
	defaultWindowHeight = 768
	minimumWindowWidth  = 375
	minimumWindowHeight = 480
)

// NativeWindowAPI contains only public Wails operations required to restore
// the ordinary operating-system-managed window.
type NativeWindowAPI interface {
	UsableSize(context.Context) (int, int)
	SetSize(context.Context, int, int)
	Maximise(context.Context)
	Show(context.Context)
}

// NativeWindowService coordinates hidden native restore with the frontend's
// explicit readiness acknowledgement. It owns no browser-visible state.
type NativeWindowService struct {
	mu            sync.Mutex
	model         *appmodel.AppModelService
	native        NativeWindowAPI
	restored      bool
	frontendReady bool
	shown         bool
}

func NewNativeWindowService(model *appmodel.AppModelService, native NativeWindowAPI) *NativeWindowService {
	return &NativeWindowService{model: model, native: native}
}

// Restore loads the valid persisted layout while Wails keeps the window hidden.
func (service *NativeWindowService) Restore(ctx context.Context) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.restored {
		return nil
	}
	if service.model == nil || service.native == nil {
		return nil
	}
	if err := service.model.RestoreUILayout(ctx); err != nil {
		return err
	}
	state, err := service.model.GetState(ctx)
	if err != nil {
		return err
	}
	width, height := defaultWindowWidth, defaultWindowHeight
	if state.Snapshot.UI.WindowWidth != nil {
		width = *state.Snapshot.UI.WindowWidth
	}
	if state.Snapshot.UI.WindowHeight != nil {
		height = *state.Snapshot.UI.WindowHeight
	}
	usableWidth, usableHeight := service.native.UsableSize(ctx)
	if usableWidth >= minimumWindowWidth && width > usableWidth {
		width = usableWidth
	}
	if usableHeight >= minimumWindowHeight && height > usableHeight {
		height = usableHeight
	}
	service.native.SetSize(ctx, width, height)
	if state.Snapshot.UI.WindowMaximized != nil && *state.Snapshot.UI.WindowMaximized {
		service.native.Maximise(ctx)
	}
	service.restored = true
	service.showIfReadyLocked(ctx)
	return nil
}

// FrontendReady records hydration without attempting backend restore. The
// normal shell is shown only after Restore has independently completed.
func (service *NativeWindowService) FrontendReady(ctx context.Context) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.frontendReady = true
	service.showIfReadyLocked(ctx)
}

// ShowWhenFrontendReady retains the established service API while keeping the
// readiness signal independent from backend restore.
func (service *NativeWindowService) ShowWhenFrontendReady(ctx context.Context) error {
	service.FrontendReady(ctx)
	return nil
}

func (service *NativeWindowService) showIfReadyLocked(ctx context.Context) {
	if service.shown || !service.restored || !service.frontendReady || service.native == nil {
		return
	}

	service.native.Show(ctx)
	service.shown = true
}
