# Menu System

## Imports

```go
import (
    "github.com/wailsapp/wails/v2/pkg/menu"
    "github.com/wailsapp/wails/v2/pkg/menu/keys"
    "github.com/wailsapp/wails/v2/pkg/runtime"
)
```

---

## Constructors

```go
// Create a menu from items directly
menu.NewMenuFromItems(first *MenuItem, rest ...*MenuItem) *Menu

// Create an empty menu, then append
m := menu.NewMenu()
m.Append(item)

// Create a submenu item (returns *MenuItem wrapping a *Menu)
sub := menu.SubMenu("Edit", subMenu)

// Item factory functions
menu.Text(label string, accelerator *keys.Accelerator, click Callback) *MenuItem
menu.Checkbox(label string, checked bool, accelerator *keys.Accelerator, click Callback) *MenuItem
menu.Radio(label string, selected bool, accelerator *keys.Accelerator, click Callback) *MenuItem
menu.Separator() *MenuItem

// Role-based items (platform standard behavior)
menu.AppMenu()    // macOS only: App menu (About, Services, etc.)
menu.EditMenu()   // Standard Edit menu (Undo, Copy, Paste, etc.)
menu.WindowMenu() // Standard Window menu (Minimize, Zoom) — not for frameless windows
```

---

## MenuItem Methods (Chainable)

```go
item.Disable() *MenuItem           // grey out
item.Enable() *MenuItem            // re-enable
item.Hide() *MenuItem              // hide from menu
item.Show() *MenuItem              // show again
item.SetChecked(bool) *MenuItem    // for Checkbox/Radio items
item.OnClick(Callback) *MenuItem   // set or replace click handler
item.SetAccelerator(*keys.Accelerator) *MenuItem
item.SetLabel(string)              // update label in place
```

Callback signature:
```go
type Callback func(data *menu.CallbackData)

// CallbackData has:
data.MenuItem  *menu.MenuItem  // the item that was clicked
```

---

## MenuItem Types

```go
menu.TextType      Type = "Text"
menu.SeparatorType Type = "Separator"
menu.SubmenuType   Type = "Submenu"
menu.CheckboxType  Type = "Checkbox"
menu.RadioType     Type = "Radio"
```

---

## Key Accelerators

```go
keys.CmdOrCtrl("s")          // Cmd+S on Mac, Ctrl+S on Win/Linux
keys.Shift("s")              // Shift+S
keys.OptionOrAlt("s")        // Option+S on Mac, Alt+S on Win/Linux
keys.Control("s")            // Ctrl+S on all platforms
keys.Key("F5")               // bare key, no modifier

// Combo (multiple modifiers)
keys.Combo("s", keys.CmdOrCtrlKey, keys.ShiftKey)
```

---

## Dynamic Menu Updates

> **Important:** You must call **both** functions after any mutation. `MenuSetApplicationMenu` alone won't refresh the UI.

```go
func (a *App) ToggleAutoSave() {
    a.autoSaveItem.SetChecked(!a.autoSaveItem.Checked)
    runtime.MenuSetApplicationMenu(a.ctx, a.appMenu)
    runtime.MenuUpdateApplicationMenu(a.ctx)
}
```

---

## Context Timing

The Wails context (`ctx`) is **not available** at `options.App` initialization. Build menus at startup or use closures:

```go
type App struct {
    ctx          context.Context
    appMenu      *menu.Menu
    autoSaveItem *menu.MenuItem
}

func (a *App) startup(ctx context.Context) {
    a.ctx = ctx
    a.buildMenu()
    runtime.MenuSetApplicationMenu(ctx, a.appMenu)
}

func (a *App) buildMenu() {
    a.autoSaveItem = menu.Checkbox("Auto Save", false, keys.CmdOrCtrl("s"), func(data *menu.CallbackData) {
        a.onAutoSaveToggle(data.MenuItem.Checked)
    })

    a.appMenu = menu.NewMenuFromItems(
        menu.AppMenu(),
        menu.SubMenu("File", menu.NewMenuFromItems(
            menu.Text("New", keys.CmdOrCtrl("n"), a.onNew),
            menu.Text("Open...", keys.CmdOrCtrl("o"), a.onOpen),
            menu.Separator(),
            a.autoSaveItem,
        )),
        menu.EditMenu(),
    )
}
```

Alternatively, pass the menu in `options.App` using a closure that captures the app pointer (the menu items that only need labels and static callbacks can be built before startup):

```go
wails.Run(&options.App{
    Menu: buildStaticMenu(app),  // no ctx needed for static menus
    // ...
})
```

---

## Role Constants

```go
menu.AppMenuRole    = 1  // macOS App menu
menu.EditMenuRole   = 2  // Standard Edit menu
menu.WindowMenuRole = 3  // Standard Window menu
```

Roles map to platform-provided standard menus. On non-macOS, `AppMenuRole` has no effect.
