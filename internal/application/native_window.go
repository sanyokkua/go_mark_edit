package application

import (
	"context"
	"os"
	"sync"

	"github.com/sanyokkua/go_mark_edit/internal/appmodel"
)

const e2eHeadlessEnvironment = "GOMARKEDIT_E2E_HEADLESS"

// E2EHeadlessEnabled reports whether a child process is running the real-backend
// E2E harness without a native presentation surface.
func E2EHeadlessEnabled() bool {
	return os.Getenv(e2eHeadlessEnvironment) == "1"
}

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
	Print(context.Context)
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
	headless      bool
}

func NewNativeWindowService(model *appmodel.AppModelService, native NativeWindowAPI) *NativeWindowService {
	return &NativeWindowService{model: model, native: native, headless: E2EHeadlessEnabled()}
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

// Print opens the operating system's print dialog for the window. It does
// nothing without a native window or in headless E2E mode.
func (service *NativeWindowService) Print(ctx context.Context) {
	service.mu.Lock()
	native, headless := service.native, service.headless
	service.mu.Unlock()
	if native == nil || headless {
		return
	}
	native.Print(ctx)
}

func (service *NativeWindowService) showIfReadyLocked(ctx context.Context) {
	if service.shown || !service.restored || !service.frontendReady || service.native == nil {
		return
	}

	if service.headless {
		service.shown = true
		return
	}
	service.native.Show(ctx)
	service.shown = true
}
