# App Setup: options.App & Lifecycle Hooks

## options.App Fields

```go
import "github.com/wailsapp/wails/v2/pkg/options"
```

| Field | Type | Description |
|---|---|---|
| `Title` | `string` | Window title bar text |
| `Width` | `int` | Initial width (default 1024) |
| `Height` | `int` | Initial height (default 768) |
| `MinWidth` | `int` | Minimum window width |
| `MinHeight` | `int` | Minimum window height |
| `MaxWidth` | `int` | Maximum window width (0 = unlimited) |
| `MaxHeight` | `int` | Maximum window height (0 = unlimited) |
| `DisableResize` | `bool` | Prevent window resizing |
| `Fullscreen` | `bool` | Start in fullscreen |
| `Frameless` | `bool` | Remove OS window frame/chrome |
| `StartHidden` | `bool` | Launch without showing window |
| `HideWindowOnClose` | `bool` | Hide instead of quit on close |
| `AlwaysOnTop` | `bool` | Keep window above all others |
| `BackgroundColour` | `*RGBA` | Window background colour |
| `AssetServer` | `*assetserver.Options` | Static asset embedding config |
| `Menu` | `*menu.Menu` | Application menu bar |
| `Logger` | `logger.Logger` | Custom logger implementation |
| `LogLevel` | `logger.LogLevel` | Log level for dev/debug builds |
| `LogLevelProduction` | `logger.LogLevel` | Log level for production builds |
| `OnStartup` | `func(ctx context.Context)` | Called when frontend connects |
| `OnDomReady` | `func(ctx context.Context)` | Called when DOM is ready |
| `OnShutdown` | `func(ctx context.Context)` | Called before app exits |
| `OnBeforeClose` | `func(ctx context.Context) bool` | Return `true` to **cancel** close |
| `Bind` | `[]interface{}` | Pointers to structs to expose to JS |
| `EnumBind` | `[]interface{}` | Go const groups to expose as TS enums |
| `WindowStartState` | `WindowStartState` | Initial window state |
| `CSSDragProperty` | `string` | CSS property name for drag regions (default `--wails-draggable`) |
| `CSSDragValue` | `string` | CSS value that marks an element draggable (default `drag`) |
| `EnableDefaultContextMenu` | `bool` | Enable browser context menu in production |
| `SingleInstanceLock` | `*SingleInstanceLock` | Enforce single instance |
| `DragAndDrop` | `*DragAndDrop` | File drop configuration |
| `Windows` | `*windows.Options` | Windows-specific options |
| `Mac` | `*mac.Options` | macOS-specific options |
| `Linux` | `*linux.Options` | Linux-specific options |
| `DisablePanicRecovery` | `bool` | Disable panic recovery in message processing |

## WindowStartState Constants

```go
options.Normal     = 0  // Default window state
options.Maximised  = 1  // Start maximized
options.Minimised  = 2  // Start minimized
options.Fullscreen = 3  // Start fullscreen
```

## RGBA Colour

```go
type RGBA struct {
    R, G, B, A uint8
}

// Helpers
options.NewRGBA(r, g, b, a uint8) *RGBA  // with alpha
options.NewRGB(r, g, b uint8) *RGBA      // alpha = 255

// Example: dark navy background
BackgroundColour: options.NewRGBA(27, 38, 54, 255)
```

## Lifecycle Hooks

All four hooks receive the same `ctx context.Context`. This context is the **only** valid context for `runtime.*` calls.

### OnStartup
```go
OnStartup func(ctx context.Context)
```
Called when the frontend connects to the backend. **Store `ctx` here.** Safe to call runtime functions, initialize services, load data.

### OnDomReady
```go
OnDomReady func(ctx context.Context)
```
Called after the frontend's DOM is fully loaded and ready. Safe to manipulate window state, emit events to the frontend.

### OnShutdown
```go
OnShutdown func(ctx context.Context)
```
Called just before the application exits. Use for cleanup: close files, flush logs, release resources.

### OnBeforeClose
```go
OnBeforeClose func(ctx context.Context) (prevent bool)
```
Called when the user tries to close the window. Return `true` to **cancel the close** (e.g., show "unsaved changes" dialog). Return `false` (or omit) to allow close.

> **Non-obvious:** The return value semantics are inverted from what you might expect. `true` means "prevent", not "allow".

## Critical: Context Storage Pattern

```go
type App struct {
    ctx context.Context
    // other fields...
}

func (a *App) startup(ctx context.Context) {
    a.ctx = ctx
    // do other initialization...
}
```

Wire it in `options.App`:
```go
app := &App{}
wails.Run(&options.App{
    OnStartup: app.startup,
    Bind:      []interface{}{app},
})
```

Never call `runtime.*` functions before `OnStartup` fires. The context is not available at `options.App` initialization time — only inside the lifecycle callbacks.

## EnumBind

Exposes Go const groups to the frontend as TypeScript enums.

```go
// Go: define typed constants
type Status int
const (
    StatusPending  Status = 0
    StatusRunning  Status = 1
    StatusComplete Status = 2
)

// Register in options.App
EnumBind: []interface{}{
    []interface{}{"Status", Status(0)},  // package-level enum group
}
```

The generated `wailsjs/go/models.ts` will contain a `Status` enum. See `references/02-binding.md` for usage.
