# Debugging & Tooling

## CLI Commands

```bash
wails dev                  # Start dev mode: hot reload backend + frontend
wails build                # Production build → build/bin/<name>
wails doctor               # Verify all platform dependencies are installed
wails generate module      # Regenerate wailsjs/ bindings after Go changes
```

---

## Common Problems

| Problem | Solution |
|---|---|
| Missing JS bindings after Go change | `wails generate module` then restart `wails dev` |
| `"context is nil"` / runtime panic | Ensure ctx is stored in `OnStartup`; never call `runtime.*` before that hook fires |
| Runtime call crashes with "invalid context" | You're using `context.Background()` or a non-Wails context; must use the ctx from `OnStartup` |
| Hot reload not triggering | Check `wails.json` `frontend:dev:watcher` — should run your Vite/webpack dev command |
| Can't inspect frontend | Right-click window → Inspect (only in dev/debug builds; not in production) |
| Frameless window not draggable | Set `CSSDragProperty`/`CSSDragValue` in `options.App`; apply `--wails-draggable: drag` CSS on drag region |
| Menu not updating | Must call BOTH `runtime.MenuSetApplicationMenu` AND `runtime.MenuUpdateApplicationMenu` |
| Platform build failure | `wails doctor` to verify all system dependencies (Xcode CLT on Mac, WebView2 on Windows) |
| TS types stale after Go struct change | `wails generate module`; restart TS language server in your IDE |
| Backend logs missing | Check the terminal running `wails dev` — stdout/stderr from both frontend and backend appear there |
| Drop zone not receiving files | CSS custom property name must exactly match `DragAndDrop.CSSDropProperty` (default: `--wails-drop-target`) |
| `wails.json` frontend port conflict | Set explicit port in `frontend:dev:serverUrl` instead of `"auto"` |
| `OnBeforeClose` always allowing close | Return value semantics: `true` = prevent (cancel), `false` = allow |
| Menu items using ctx before OnStartup | Build menus in or after `OnStartup`; ctx is unavailable at `options.App` init time |
| Second instance not captured | UniqueId in `SingleInstanceLock` must be a stable UUID, not generated at runtime |
| Linux GPU issues / blank webview | Set `Linux: &linux.Options{WebviewGpuPolicy: linux.WebviewGpuPolicyNever}` |

---

## Log Levels

| Build type | Default level |
|---|---|
| `wails dev` | `logger.DEBUG` |
| `wails build` (debug) | `logger.DEBUG` |
| `wails build` (production) | `logger.WARNING` |

Override in `options.App`:
```go
LogLevel:           logger.DEBUG,    // dev + debug builds
LogLevelProduction: logger.WARNING,  // production builds
```

---

## Inspecting Frontend State

In dev mode, right-click the app window and select **Inspect** to open Chrome DevTools. Works the same as browser DevTools:
- Console for `console.log` / `LogDebug` output
- Network tab to see Wails bridge calls
- Redux DevTools extension (if installed) for Redux state

---

## Wails Bridge Calls

Bound Go methods appear in the browser as calls to `wails://` URLs in the Network panel. Each call shows:
- The method name
- The serialized arguments
- The JSON response or error

---

## Build Info in Runtime

Check if running in dev vs production:

```go
info := runtime.Environment(ctx)
if info.BuildType == "dev" {
    runtime.LogDebug(ctx, "dev mode — enabling verbose logging")
}
```

```typescript
const env = await Environment()
if (env.buildType === "dev") {
    console.log("dev mode")
}
```
