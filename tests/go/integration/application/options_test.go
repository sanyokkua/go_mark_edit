package application_test

import (
	"context"
	"io/fs"
	"net/http"
	"testing"
	"testing/fstest"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
	. "github.com/sanyokkua/go_mark_edit/internal/application"
)

func TestNewOptionsBuildsAHiddenFramedWindowWithTheEmbeddedFrontend(t *testing.T) {
	assets := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte(`<div id="root"></div>`)},
	}
	startup := func(context.Context) {}
	shutdown := func(context.Context) {}
	beforeClose := func(context.Context) bool { return false }
	preview := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	configured := NewOptions(Options{
		Assets:         assets,
		PreviewHandler: preview,
		Menu:           NativeMenuForPlatform("darwin"),
		OnStartup:      startup,
		OnShutdown:     shutdown,
		OnBeforeClose:  beforeClose,
		Bind:           []interface{}{"app-model", "settings", "application"},
		EnumBind:       []interface{}{apperr.AllErrorCodes},
	})
	if configured.Title != "GoMarkEdit" || configured.Width != 1024 || configured.Height != 768 {
		t.Fatalf("window options = %+v, want product defaults", configured)
	}
	if configured.MinWidth != 375 || configured.MinHeight != 480 || configured.Frameless || configured.DisableResize || !configured.StartHidden {
		t.Fatalf("window constraints = %+v, want hidden resizable native frame", configured)
	}
	if configured.SingleInstanceLock != nil || configured.Mac == nil || configured.Mac.DisableZoom {
		t.Fatalf("native ownership options = %+v, want independent macOS zoomable window", configured)
	}
	if configured.AssetServer == nil || configured.AssetServer.Assets == nil || configured.AssetServer.Handler == nil {
		t.Fatal("NewOptions did not wire both the embedded assets and preview handler")
	}
	index, err := fs.ReadFile(configured.AssetServer.Assets, "index.html")
	if err != nil || string(index) != `<div id="root"></div>` {
		t.Fatalf("embedded index = %q, error=%v; want the supplied frontend root", index, err)
	}
	if configured.OnStartup == nil || configured.OnShutdown == nil || configured.OnBeforeClose == nil || len(configured.Bind) != 3 || len(configured.EnumBind) != 1 {
		t.Fatal("NewOptions did not preserve lifecycle callbacks and bindings")
	}
}

func TestNativeMenuKeepsOnlyTheMacOSApplicationAndEditRoles(t *testing.T) {
	macMenu := NativeMenuForPlatform("darwin")
	if macMenu == nil || len(macMenu.Items) != 2 {
		t.Fatalf("macOS native menu = %#v, want App and Edit roles", macMenu)
	}
	if NativeMenuForPlatform("linux") != nil || NativeMenuForPlatform("windows") != nil {
		t.Fatal("non-macOS platforms received an application menu")
	}
}
