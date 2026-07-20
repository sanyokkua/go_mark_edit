package main

import (
	"embed"
	"fmt"
	"os"

	"github.com/sanyokkua/go_mark_edit/internal/application"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	applicationContext := application.NewApplicationContextHolder()
	if err := wails.Run(newAppOptions(applicationContext)); err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
}

func newAppOptions(applicationContext *application.ApplicationContextHolder) *options.App {
	return &options.App{
		Title:  "GoMarkEdit",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup: applicationContext.SetContext,
	}
}
