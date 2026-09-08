# Go Runtime API

All functions require `ctx context.Context` (the context stored from `OnStartup`).

```go
import "github.com/wailsapp/wails/v2/pkg/runtime"
```

---

## Events

```go
// Register a listener. Returns a cancel function — call it to unsubscribe.
runtime.EventsOn(ctx, "eventName", func(data ...interface{}) {}) func()

// Register a one-shot listener (auto-removed after first call).
runtime.EventsOnce(ctx, "eventName", func(data ...interface{}) {}) func()

// Register a listener that fires at most N times.
runtime.EventsOnMultiple(ctx, "eventName", func(data ...interface{}) {}, counter int) func()

// Unregister listeners by name (variadic: can remove multiple at once).
runtime.EventsOff(ctx, "eventName", additionalNames ...string)

// Unregister all listeners.
runtime.EventsOffAll(ctx)

// Emit an event (with optional data payloads). Safe to call from goroutines.
runtime.EventsEmit(ctx, "eventName", optionalData ...interface{})
```

---

## Window

```go
// Title
runtime.WindowSetTitle(ctx, title string)

// Size & position
runtime.WindowSetSize(ctx, width, height int)
runtime.WindowGetSize(ctx) (int, int)
runtime.WindowSetMinSize(ctx, width, height int)
runtime.WindowSetMaxSize(ctx, width, height int)
runtime.WindowSetPosition(ctx, x, y int)
runtime.WindowGetPosition(ctx) (int, int)
runtime.WindowCenter(ctx)

// State
runtime.WindowMaximise(ctx)
runtime.WindowUnmaximise(ctx)
runtime.WindowToggleMaximise(ctx)
runtime.WindowMinimise(ctx)
runtime.WindowUnminimise(ctx)
runtime.WindowFullscreen(ctx)
runtime.WindowUnfullscreen(ctx)

// State queries
runtime.WindowIsMaximised(ctx) bool
runtime.WindowIsMinimised(ctx) bool
runtime.WindowIsFullscreen(ctx) bool
runtime.WindowIsNormal(ctx) bool

// Visibility
runtime.WindowShow(ctx)   // shows window if hidden
runtime.WindowHide(ctx)   // hides window (not the whole app)

// Appearance
runtime.WindowSetBackgroundColour(ctx, R, G, B, A uint8)
runtime.WindowSetSystemDefaultTheme(ctx)
runtime.WindowSetLightTheme(ctx)
runtime.WindowSetDarkTheme(ctx)

// Always on top
runtime.WindowSetAlwaysOnTop(ctx, b bool)

// Reload
runtime.WindowReload(ctx)     // reload frontend assets
runtime.WindowReloadApp(ctx)  // reload the entire application

// Print (system print dialog)
runtime.WindowPrint(ctx)

// Execute JavaScript in the webview
runtime.WindowExecJS(ctx, js string)
```

---

## App

```go
// Quit the application
runtime.Quit(ctx)

// Hide/Show the application (macOS: hides entire app, not just window)
runtime.Hide(ctx)
runtime.Show(ctx)

// Get environment info
type EnvironmentInfo struct {
    BuildType string  // "dev", "debug", or "production"
    Platform  string  // "darwin", "windows", "linux"
    Arch      string  // "amd64", "arm64", etc.
}
runtime.Environment(ctx) EnvironmentInfo
```

---

## Dialogs

```go
// Open a single file
runtime.OpenFileDialog(ctx, OpenDialogOptions) (string, error)

// Open a directory
runtime.OpenDirectoryDialog(ctx, OpenDialogOptions) (string, error)

// Open multiple files
runtime.OpenMultipleFilesDialog(ctx, OpenDialogOptions) ([]string, error)

// Save file dialog
runtime.SaveFileDialog(ctx, SaveDialogOptions) (string, error)

// Message dialog (info, warning, error, question)
runtime.MessageDialog(ctx, MessageDialogOptions) (string, error)
```

### OpenDialogOptions

```go
type OpenDialogOptions struct {
    DefaultDirectory           string
    DefaultFilename            string
    Title                      string
    Filters                    []FileFilter
    ShowHiddenFiles            bool
    CanCreateDirectories       bool
    ResolvesAliases            bool
    TreatPackagesAsDirectories bool
}
```

### SaveDialogOptions

```go
type SaveDialogOptions struct {
    DefaultDirectory           string
    DefaultFilename            string
    Title                      string
    Filters                    []FileFilter
    ShowHiddenFiles            bool
    CanCreateDirectories       bool
    TreatPackagesAsDirectories bool
}
```

### FileFilter

```go
type FileFilter struct {
    DisplayName string  // e.g., "Text Files (*.txt)"
    Pattern     string  // e.g., "*.txt;*.md"
}
```

### MessageDialogOptions

```go
type MessageDialogOptions struct {
    Type          DialogType   // InfoDialog, WarningDialog, ErrorDialog, QuestionDialog
    Title         string
    Message       string
    Buttons       []string  // button labels; first is default
    DefaultButton string
    CancelButton  string
    Icon          []byte    // optional icon (PNG bytes)
}
```

### Dialog type constants

```go
runtime.InfoDialog     // = frontend.InfoDialog
runtime.WarningDialog  // = frontend.WarningDialog
runtime.ErrorDialog    // = frontend.ErrorDialog
runtime.QuestionDialog // = frontend.QuestionDialog
```

---

## Clipboard

```go
runtime.ClipboardGetText(ctx) (string, error)
runtime.ClipboardSetText(ctx, text string) error
```

---

## Browser

```go
// Open URL in the system default browser
runtime.BrowserOpenURL(ctx, url string)
```

---

## Logging

```go
// Plain message
runtime.LogPrint(ctx, message string)
runtime.LogTrace(ctx, message string)
runtime.LogDebug(ctx, message string)
runtime.LogInfo(ctx, message string)
runtime.LogWarning(ctx, message string)
runtime.LogError(ctx, message string)
runtime.LogFatal(ctx, message string)

// Formatted (Printf-style)
runtime.LogPrintf(ctx, format string, args ...interface{})
runtime.LogTracef(ctx, format string, args ...interface{})
runtime.LogDebugf(ctx, format string, args ...interface{})
runtime.LogInfof(ctx, format string, args ...interface{})
runtime.LogWarningf(ctx, format string, args ...interface{})
runtime.LogErrorf(ctx, format string, args ...interface{})
runtime.LogFatalf(ctx, format string, args ...interface{})

// Set level
runtime.LogSetLogLevel(ctx, level logger.LogLevel)
```

Logger levels (from `github.com/wailsapp/wails/v2/pkg/logger`):
```go
logger.TRACE, logger.DEBUG, logger.INFO, logger.WARNING, logger.ERROR
```

---

## Menu

```go
// Replace the entire application menu
runtime.MenuSetApplicationMenu(ctx, menu *menu.Menu)

// Refresh the displayed menu after in-place mutations
runtime.MenuUpdateApplicationMenu(ctx)
```

To update a menu dynamically: mutate the `*menu.Menu` / `*menu.MenuItem`, then call **both** functions. See `references/06-menu-system.md`.

---

## Drag & Drop

```go
// Register a file-drop handler
runtime.OnFileDrop(ctx, func(x, y int, paths []string) {})

// Unregister the file-drop handler
runtime.OnFileDropOff(ctx)
```

Requires `DragAndDrop: &options.DragAndDrop{EnableFileDrop: true}` in `options.App`.

---

## Screen

```go
type Screen struct {
    IsCurrent bool
    IsPrimary bool
    Width     int
    Height    int
    // ...
}
runtime.ScreenGetAll(ctx) ([]Screen, error)
```

---

## Notifications

```go
runtime.InitializeNotifications(ctx) error           // call once in OnStartup
runtime.CleanupNotifications(ctx)                    // call in OnShutdown
runtime.IsNotificationAvailable(ctx) bool
runtime.RequestNotificationAuthorization(ctx) (bool, error)
runtime.CheckNotificationAuthorization(ctx) (bool, error)
```
