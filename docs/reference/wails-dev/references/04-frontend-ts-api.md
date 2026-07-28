# Frontend TypeScript/JavaScript API

## Import

```typescript
import {
    EventsOn, EventsOff, EventsOffAll, EventsOnce, EventsOnMultiple, EventsEmit,
    WindowSetTitle, WindowMaximise, WindowUnmaximise, WindowMinimise, WindowUnminimise,
    WindowToggleMaximise, WindowFullscreen, WindowUnfullscreen,
    WindowSetSize, WindowGetSize, WindowSetPosition, WindowGetPosition,
    WindowCenter, WindowSetAlwaysOnTop,
    WindowShow, WindowHide,
    WindowSetSystemDefaultTheme, WindowSetLightTheme, WindowSetDarkTheme,
    WindowReload, WindowReloadApp,
    WindowIsMaximised, WindowIsMinimised, WindowIsFullscreen, WindowIsNormal,
    WindowPrint,
    Quit, Hide, Show, BrowserOpenURL, Environment,
    ClipboardGetText, ClipboardSetText,
    ScreenGetAll,
    LogDebug, LogInfo, LogWarning, LogError, LogFatal, LogTrace, LogPrint,
} from '@wailsapp/runtime'
```

---

## Events

```typescript
// Listen for an event. Returns a cancel function — call it to stop listening.
EventsOn(eventName: string, callback: (...data: any[]) => void): () => void

// One-shot listener (auto-removed after first call).
EventsOnce(eventName: string, callback: (...data: any[]) => void): () => void

// Listen at most N times.
EventsOnMultiple(eventName: string, callback: (...data: any[]) => void, maxCallbacks: number): () => void

// Unregister listener(s) by name.
EventsOff(eventName: string, ...additionalEventNames: string[]): void

// Unregister all listeners.
EventsOffAll(): void

// Emit an event (with optional data). Goes to Go listeners AND other frontend listeners.
EventsEmit(eventName: string, ...data: any[]): void
```

Always clean up listeners in React components:
```typescript
useEffect(() => {
    const cancel = EventsOn("data:updated", (payload) => {
        // handle update
    })
    return cancel  // called on unmount
}, [])
```

---

## Window

```typescript
// Title
WindowSetTitle(title: string): void

// Size & position
WindowSetSize(width: number, height: number): void
WindowGetSize(): Promise<[number, number]>
WindowSetPosition(x: number, y: number): void
WindowGetPosition(): Promise<[number, number]>
WindowCenter(): void

// State
WindowMaximise(): void
WindowUnmaximise(): void
WindowToggleMaximise(): void
WindowMinimise(): void
WindowUnminimise(): void
WindowFullscreen(): void
WindowUnfullscreen(): void

// Queries — return Promise<boolean>
WindowIsMaximised(): Promise<boolean>
WindowIsMinimised(): Promise<boolean>
WindowIsFullscreen(): Promise<boolean>
WindowIsNormal(): Promise<boolean>

// Visibility
WindowShow(): void
WindowHide(): void

// Z-order
WindowSetAlwaysOnTop(b: boolean): void

// Theme
WindowSetSystemDefaultTheme(): void
WindowSetLightTheme(): void
WindowSetDarkTheme(): void

// Reload
WindowReload(): void
WindowReloadApp(): void

// Print
WindowPrint(): void
```

---

## App

```typescript
// Quit the application
Quit(): void

// Hide/Show the application (macOS: hides entire app)
Hide(): void
Show(): void

// Get environment info
interface EnvironmentInfo {
    buildType: string  // "dev" | "debug" | "production"
    platform:  string  // "darwin" | "windows" | "linux"
    arch:      string  // "amd64" | "arm64" | ...
}
Environment(): Promise<EnvironmentInfo>

// Open URL in system default browser
BrowserOpenURL(url: string): void
```

---

## Clipboard

```typescript
ClipboardGetText(): Promise<string>
ClipboardSetText(text: string): Promise<boolean>
```

---

## Screen

```typescript
interface Screen {
    isCurrent: boolean
    isPrimary: boolean
    width:     number
    height:    number
    // additional platform-specific fields
}
ScreenGetAll(): Promise<Screen[]>
```

---

## Logging

All log calls route through the Go logger — they appear in the terminal output during `wails dev`. Useful for unified backend+frontend logging.

```typescript
LogPrint(message: string): void
LogTrace(message: string): void
LogDebug(message: string): void
LogInfo(message: string): void
LogWarning(message: string): void
LogError(message: string): void
LogFatal(message: string): void
```

---

## Notes

- All window functions that return values return `Promise<T>` — `await` them.
- `EventsEmit` from the frontend can reach both Go listeners (`runtime.EventsOn`) and other frontend listeners (`EventsOn`).
- Functions that only mutate state (title, size, theme) are fire-and-forget (`void`).
- The `@wailsapp/runtime` package is provided by Wails — do not install it via npm. It is injected by the Wails dev server and bundled by the Wails build.
