package application

import (
	"context"
	"io/fs"
	"net/http"

	wailslogger "github.com/wailsapp/wails/v2/pkg/logger"
	"github.com/wailsapp/wails/v2/pkg/menu"
	wailsoptions "github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

// Options describes the host-owned pieces of the Wails composition root.
// NewOptions applies the product's stable window, asset and binding policy in
// one place while leaving lifecycle callbacks and handlers injectable by main.
type Options struct {
	Assets         fs.FS
	PreviewHandler http.Handler
	Menu           *menu.Menu
	Logger         wailslogger.Logger
	OnStartup      func(context.Context)
	OnShutdown     func(context.Context)
	OnBeforeClose  func(context.Context) bool
	Bind           []interface{}
	EnumBind       []interface{}
}

// NewOptions builds the single Wails options value used by the executable.
func NewOptions(config Options) *wailsoptions.App {
	return &wailsoptions.App{
		Title:         "GoMarkEdit",
		Width:         defaultWindowWidth,
		Height:        defaultWindowHeight,
		MinWidth:      minimumWindowWidth,
		MinHeight:     minimumWindowHeight,
		Frameless:     false,
		DisableResize: false,
		StartHidden:   true,
		Mac:           &mac.Options{DisableZoom: false},
		Menu:          config.Menu,
		AssetServer: &assetserver.Options{
			Assets:  config.Assets,
			Handler: config.PreviewHandler,
		},
		OnStartup:     config.OnStartup,
		OnShutdown:    config.OnShutdown,
		OnBeforeClose: config.OnBeforeClose,
		Bind:          append([]interface{}(nil), config.Bind...),
		EnumBind:      append([]interface{}(nil), config.EnumBind...),
		Logger:        config.Logger,
	}
}
