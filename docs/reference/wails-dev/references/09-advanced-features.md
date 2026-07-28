# Advanced Features

---

## Single Instance Lock

Prevents multiple instances of the app from running simultaneously. When a second instance is launched, the first instance receives a callback with the second instance's args.

```go
import "github.com/wailsapp/wails/v2/pkg/options"

SingleInstanceLock: &options.SingleInstanceLock{
    UniqueId: "com.example.myapp-550e8400-e29b-41d4-a716-446655440000",
    OnSecondInstanceLaunch: func(data options.SecondInstanceData) {
        // Bring first instance to front
        runtime.WindowShow(a.ctx)
        runtime.WindowUnminimise(a.ctx)
        // Pass args to the running instance
        runtime.EventsEmit(a.ctx, "app:second-instance", data.Args)
    },
},
```

### SecondInstanceData

```go
type SecondInstanceData struct {
    Args             []string  // command-line args of the second instance
    WorkingDirectory string    // working directory of the second instance
}
```

**UniqueId** must be a stable UUID — use a fixed string, not `uuid.New()` at runtime, so it's consistent across launches.

---

## Drag and Drop (File Drop)

Enables users to drag files from the OS file manager into the application window.

### Step 1 — Enable in options.App

```go
DragAndDrop: &options.DragAndDrop{
    EnableFileDrop:     true,   // enable file drop handling
    DisableWebViewDrop: false,  // keep default webview drop behavior
    CSSDropProperty:    "--wails-drop-target",  // default
    CSSDropValue:       "drop",                 // default
},
```

### Step 2 — Register handler in OnStartup

```go
func (a *App) startup(ctx context.Context) {
    a.ctx = ctx
    runtime.OnFileDrop(ctx, func(x, y int, paths []string) {
        // x, y = drop position in window coordinates
        // paths = absolute paths of dropped files
        for _, path := range paths {
            a.handleDroppedFile(path)
        }
    })
}
```

### Step 3 — Mark drop zones with CSS

The CSS custom property name must **exactly match** `CSSDropProperty` (default: `--wails-drop-target`):

```css
.drop-zone {
    --wails-drop-target: drop;  /* value must match CSSDropValue */
}
```

```typescript
<div className="drop-zone">Drop files here</div>
```

To unregister: `runtime.OnFileDropOff(ctx)`.

---

## Frameless Window Dragging

For frameless windows (`Frameless: true`), the OS doesn't provide a title bar drag region. You must designate drag regions via CSS.

### Step 1 — Set in options.App (defaults are fine)

```go
// These are already the defaults — override only if needed
CSSDragProperty: "--wails-draggable",
CSSDragValue:    "drag",
```

### Step 2 — Apply to your title bar element

```css
.titlebar {
    --wails-draggable: drag;
    -webkit-app-region: drag;  /* also add this for WebKit */
}
```

```typescript
<div className="titlebar">My App</div>
```

Elements inside the drag region that need to be clickable should override:
```css
.titlebar button {
    --wails-draggable: no-drag;
    -webkit-app-region: no-drag;
}
```

---

## Context Menus

### Default browser context menu

Enable in production (it's always available in dev/debug):

```go
EnableDefaultContextMenu: true
```

### Per-element control via CSS

Override the default context menu policy on specific elements using the CSS custom property `--default-contextmenu`:

```css
/* Force show the browser context menu on this element */
.always-right-clickable {
    --default-contextmenu: show;
}

/* Suppress the context menu on this element */
.no-context-menu {
    --default-contextmenu: hide;
}

/* Inherit the application's default policy */
.inherit-policy {
    --default-contextmenu: default;
}
```

This allows fine-grained control: e.g., disable context menus everywhere except text input fields.
