# Platform-Specific Options

---

## macOS

```go
import "github.com/wailsapp/wails/v2/pkg/options/mac"

Mac: &mac.Options{
    TitleBar:             mac.TitleBarHidden(),  // see presets below
    Appearance:           mac.NSAppearanceNameAqua,
    WebviewIsTransparent: false,
    WindowIsTranslucent:  false,
    ContentProtection:    false,  // prevent screen capture
    DisableZoom:          false,
    About: &mac.AboutInfo{
        Title:   "My App",
        Message: "v1.0.0 © 2024",
        Icon:    iconBytes,  // PNG as []byte
    },
    OnFileOpen: func(filePath string) { /* handle file open */ },
    OnUrlOpen:  func(url string)      { /* handle URL scheme */ },
    DisableEscapeExitsFullscreen: false,
}
```

### TitleBar Presets

```go
// Default OS title bar
mac.TitleBarDefault()

// Hidden title bar, traffic lights remain, content extends under title bar
mac.TitleBarHidden()

// Like TitleBarHidden but with slightly more inset traffic lights (uses toolbar)
mac.TitleBarHiddenInset()

// Custom
&mac.TitleBar{
    TitlebarAppearsTransparent: true,
    HideTitle:                  true,
    HideTitleBar:               false,
    FullSizeContent:            true,   // content extends under title bar
    UseToolbar:                 false,
    HideToolbarSeparator:       false,
}
```

### AppearanceType Constants

```go
mac.DefaultAppearance                              // follows system
mac.NSAppearanceNameAqua                           // standard light
mac.NSAppearanceNameDarkAqua                       // standard dark
mac.NSAppearanceNameVibrantLight
mac.NSAppearanceNameAccessibilityHighContrastAqua
mac.NSAppearanceNameAccessibilityHighContrastDarkAqua
mac.NSAppearanceNameAccessibilityHighContrastVibrantLight
mac.NSAppearanceNameAccessibilityHighContrastVibrantDark
```

---

## Windows

```go
import "github.com/wailsapp/wails/v2/pkg/options/windows"

Windows: &windows.Options{
    WebviewIsTransparent:              false,
    WindowIsTranslucent:               false,
    DisableWindowIcon:                 false,
    BackdropType:                      windows.Mica,
    Theme:                             windows.SystemDefault,
    CustomTheme: &windows.ThemeSettings{
        DarkModeTitleBar:    windows.RGB(20, 20, 20),
        LightModeTitleBar:   windows.RGB(240, 240, 240),
        DarkModeTitleText:   windows.RGB(255, 255, 255),
        LightModeTitleText:  windows.RGB(0, 0, 0),
        // ... other BBGGRR colour fields
    },
    ZoomFactor:                        1.0,
    IsZoomControlEnabled:              false,
    DisablePinchZoom:                  false,
    DisableFramelessWindowDecorations: false,  // removes shadow + rounded corners in frameless
    ContentProtection:                 false,
    WebviewGpuIsDisabled:              false,
    EnableSwipeGestures:               false,
    WebviewUserDataPath:               "",  // default: %APPDATA%\<BinaryName>
}
```

### BackdropType Constants

```go
windows.Auto    = 0  // system decides
windows.None    = 1  // standard solid background
windows.Mica    = 2  // Windows 11 Mica (requires 22000+)
windows.Acrylic = 3  // Windows 10+ acrylic blur
windows.Tabbed  = 4  // Windows 11 tabbed style
```

### Theme Constants

```go
windows.SystemDefault = 0  // follows OS dark/light setting
windows.Dark          = 1
windows.Light         = 2
```

### ThemeSettings (Custom Title Bar Colours)

Colours are `int32` in `0x00BBGGRR` format. Use the `windows.RGB(r, g, b)` helper:

```go
windows.RGB(20, 20, 20)  // returns int32 in the correct format
```

Fields: `DarkModeTitleBar`, `DarkModeTitleBarInactive`, `DarkModeTitleText`, `DarkModeTitleTextInactive`, `DarkModeBorder`, `DarkModeBorderInactive`, and corresponding `LightMode*` variants.

---

## Linux

```go
import "github.com/wailsapp/wails/v2/pkg/options/linux"

Linux: &linux.Options{
    Icon:                iconBytes,  // PNG as []byte; shown when window is minimized
    WindowIsTranslucent: false,
    WebviewGpuPolicy:    linux.WebviewGpuPolicyOnDemand,
    ProgramName:         "myapp",   // GTK g_set_prgname(); used for window grouping
}
```

### WebviewGpuPolicy Constants

```go
linux.WebviewGpuPolicyOnDemand = 0  // hardware accel when needed (default)
linux.WebviewGpuPolicyAlways   = 1  // always use GPU
linux.WebviewGpuPolicyNever    = 2  // always software rendering
```

> **Note:** If `options.Linux` is `nil`, Wails defaults `WebviewGpuPolicy` to `WebviewGpuPolicyNever`. Pass an explicit `&linux.Options{}` to override this default.

### ProgramName

Set `ProgramName` when your `.desktop` file's `Name` differs from the binary name. This ensures correct window grouping and taskbar icon association on GNOME/KDE.
