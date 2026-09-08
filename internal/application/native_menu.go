package application

import "github.com/wailsapp/wails/v2/pkg/menu"

// NativeMenuForPlatform keeps only the operating-system application and
// editing roles required on macOS. The in-app shell remains the sole owner of
// the GoMarkEdit About action, and Windows/Linux receive no native app menu.
func NativeMenuForPlatform(platform string) *menu.Menu {
	if platform != "darwin" {
		return nil
	}

	return menu.NewMenuFromItems(menu.AppMenu(), menu.EditMenu())
}
