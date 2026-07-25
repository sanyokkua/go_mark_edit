**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `02_Architecture/01_SYSTEM_ARCHITECTURE.md`, `02_Architecture/02_BACKEND_GO.md`, `01_Product/08_FILE_ASSOCIATIONS.md`, `01_Product/09_ASSETS_AND_SECURITY.md`, `02_Architecture/01_MODULE_INVENTORY.md`, `08_Decisions/ADR-0001`, `08_Decisions/ADR-0006`

# Wails Integration

The Wails v2 seam between Go and the webview: how the UI is embedded, how handlers and the error enum
are bound, the app lifecycle, native dialogs, OS file associations, the guarded asset server, and
binding regeneration. Wails v2 (stable) is mandated over v3 (alpha) (DD-02; ADR-0001).

## Table of Contents

1. Embed
2. Bind-EnumBind
3. Lifecycle
4. Dialogs runtime
5. File associations
6. File drop
7. AssetServer handler
8. Generate bindings

## Embed

The compiled frontend is embedded into the Go binary so a single artifact ships with no external asset
directory:

```go
//go:embed all:frontend/dist
var assets embed.FS
```

`all:` includes dotfiles and nested directories (KaTeX fonts, Mermaid, highlight themes, Monaco
workers) so the offline invariant holds with no runtime fetch (DD-32). `frontend:build` in `wails.json`
produces `frontend/dist`; the embed fails the build if that directory is missing, which keeps CI honest.

## Bind-EnumBind

Handlers are registered via `Bind`; `ErrorCode` is exported to TypeScript via `EnumBind` so the bridge
produces a real TS enum in `models.ts`:

```go
Bind: []any{
    app,                    // ApplicationContextHolder (app-level utilities)
    app.AppModelHandler,    // authoritative application model: GetState + commands (DD-62)
    app.DocsHandler,
    app.WorkspaceHandler,
    app.SettingsHandler,
    app.RecentHandler,
    app.ExportHandler,
},
EnumBind: []any{ allErrorCodes }, // []struct{ Value apperr.ErrorCode; TSName string }
```

`allErrorCodes` lists every `apperr.ErrorCode` constant with its TS name. Only handlers are bound —
services and repositories stay internal. Every bound method obeys
the envelope contract (`02_BACKEND_GO.md` `#error-envelope`): a concrete `apperr.*Result`, no
`context.Context` parameter (Wails strips it), and `defer/recover` → `CodeInternal`.

`AppModelHandler` is the query/command surface of the backend-owned application model
(DD-62/DD-63; `02_BACKEND_GO.md` `#application-model`): `GetState` returns the snapshot the frontend
hydrates its projection from, and commands (`OpenDoc`, `CloseTab`, `UpdateBuffer`, `SetUILayout`, …)
mutate the model. Every mutation is then emitted as a **`state:patch`** event via `runtime.EventsEmit`,
which the adapter applies to the Redux projection (`03_FRONTEND_REACT.md` `#state-ownership`).

## Lifecycle

```go
wails.Run(&options.App{
    Title: "GoMarkEdit",
    AssetServer: &assetserver.Options{
        Assets:  assets,
        Handler: app.AssetHandler, // guarded local-file handler (see #assetserver-handler)
    },
    OnStartup: func(ctx context.Context) {
        app.SetContext(ctx)
        if err := app.Init(ctx); err != nil {         // two-phase DI: open DB, wire repos,
                                                      // restoreWindowState (DD-60)
            runtime.MessageDialog(ctx, runtime.MessageDialogOptions{Type: runtime.ErrorDialog, /* ... */})
            os.Exit(1)
        }
        app.DispatchStartupOpenTarget(ctx)            // route an OS-provided path, if any, into an
                                                      // appmodel OpenDoc command (DD-26, DD-62)
    },
    OnShutdown: func(ctx context.Context) { app.Close() }, // close DB + logger
    Mac: &mac.Options{ OnFileOpen: func(path string) { app.EnqueueOpen(path) } },
})
```

`OnStartup` captures the single runtime context and runs phase-2 wiring, including
`restoreWindowState` — the persisted window/UI layout is applied **before** the window is shown
(DD-60; `05_STATE_AND_PERSISTENCE.md` `#window-state`). Once the frontend loads it hydrates its
projection with one `GetState` query and stays in sync via `state:patch` events (`#bind-enumbind`).
`OnShutdown` releases the DB and logger. There is **no single-instance guard** — a second launch
simply starts another process (DD-08; ADR-0006).

## Dialogs runtime

Native file/folder pickers are Wails runtime calls made from a service with the stored context:
`runtime.OpenFileDialog`, `runtime.SaveFileDialog`, `runtime.OpenDirectoryDialog`. Filters restrict to
the declared extensions (`*.md;*.markdown;*.mdown;*.txt`). A user cancel returns empty data, not an
error (`02_BACKEND_GO.md` `#dialogs`). These functions require a live frontend, so services hold them
behind swappable package-level function variables for unit tests.

## File associations

GoMarkEdit declares the Markdown/text extensions and a custom document icon, and routes OS-initiated
opens (DD-07, DD-25, DD-26). Declared associations live in `wails.json` `info.fileAssociations`:

```json
{
  "info": {
    "fileAssociations": [
      { "ext": "md",       "name": "Markdown Document", "role": "Editor", "iconName": "gomarkedit-doc" },
      { "ext": "markdown", "name": "Markdown Document", "role": "Editor", "iconName": "gomarkedit-doc" },
      { "ext": "mdown",    "name": "Markdown Document", "role": "Editor", "iconName": "gomarkedit-doc" },
      { "ext": "txt",      "name": "Text Document",     "role": "Editor", "iconName": "gomarkedit-doc" }
    ]
  }
}
```

Wails packages these into the per-OS manifests: macOS `Info.plist` `CFBundleDocumentTypes` (delivering
opens through **`Mac.OnFileOpen`**), and Windows/Linux installers registering the extensions (delivering
the path as the **first CLI argument**). `internal/fileassoc` normalizes either source into an open
request:

```go
func ResolveOpenTarget(source OpenSource, raw string) (OpenTarget, error) // pure; unit-testable
func OpenPathArgs(goos, path string) (name string, args []string, err error) // "open"/"explorer"/"xdg-open"
```

The normalized open request is dispatched as an `internal/appmodel` **`OpenDoc`** command — the model
opens the document, updates the tab set, and emits `state:patch`; the frontend renders the result and
never handles the raw path itself (DD-62). Such an open starts in the configured **default open
mode** — Reading (Viewer) or Editor, default Editor (DD-27). The app registers
and may prompt to be set as default but never silently seizes the default on Windows/macOS (DD-25).
Multiple instances mean a second OS open may route to a new window/process (DD-08); routing rules are in
`01_Product/08_FILE_ASSOCIATIONS.md` `#multi-instance-routing`.

## File drop

Drag-and-drop of files/folders onto the window (DD-56–DD-59, `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open`)
uses **Wails' native file-drop**, which yields **absolute filesystem paths** — the app is path-based (Go
reads the file), so browser HTML5 DnD is **not** used (a webview's `DataTransfer.files` do not expose real
paths).

Enable it in `options.App`:

```go
DragAndDrop: &options.DragAndDrop{
    EnableFileDrop:     true,          // deliver dropped files'/folders' absolute paths
    DisableWebViewDrop: true,          // suppress the webview's default drop (prevents Linux/WebKitGTK
                                       // navigating the page to the dropped file) — DD-59
    CSSDropProperty:    "--wails-drop-target",
    CSSDropValue:       "drop",        // element carrying this token is the drop zone (overlay)
},
```

Register the handler in `OnStartup` and route each path through the same open-target resolution used for
OS opens (`internal/fileassoc`):

```go
runtime.OnFileDrop(ctx, func(x, y int, paths []string) {
    // classify each path (os.Stat → file vs folder), then dispatch:
    //   file   → appmodel OpenDoc command (new tab, or current if empty) in default open mode
    //   folder → workspace open; if a workspace is open, prompt replace-vs-new-window (DD-57)
    app.OpenDropped(paths)
})
```

Frontend responsibilities: render the **drop-target overlay** on drag-over and `preventDefault` on
`dragover`/`drop` so the webview never handles the drop itself; the actual paths arrive via the Wails
`OnFileDrop` event (not from the browser drop event). The overlay element carries the `CSSDropProperty`
token so Wails toggles its active state.

**Per-OS caveats (must be tested, verified per platform):**

- **Linux / WebKitGTK** — without suppressing the default drop, the webview replaces the UI with the
  dropped file's contents. `DisableWebViewDrop: true` + frontend `preventDefault` are mandatory (EC-DND-8).
- **Windows / WebView2** — dropping a **non-file** object (text, a browser tab) could panic older Wails
  builds; ignore non-file drops and pin a Wails version where this is fixed (EC-DND-7).
- **macOS / WKWebView** — native drop works; verify folder paths arrive as a single directory path.

Non-file drops are ignored safely; drag-and-drop adds **no network** and needs only the read permission
any open needs.

## AssetServer handler

Local images referenced by a document resolve relative to the current file (GitHub/GitLab semantics)
and are served through a **custom `AssetServer.Handler`** with a directory **allowlist** (DD-21):

```go
func NewAssetHandler(allow AllowlistProvider) http.Handler
// allowlist = document's folder + workspace root + user-configured roots
// path-traversal ("..", symlink escape, absolute outside allowlist) → 403; not on the list → 404
```

The handler cleans and resolves each request path, verifies the real path stays inside an allowlisted
root, and rejects traversal. It serves only from disk — it never proxies a network URL, preserving the
offline invariant (DD-32). Remote document assets (http/https images/CSS) are governed separately by the
content policy (Ask / Always allow / Always block) and an in-preview banner (DD-22;
`01_Product/09_ASSETS_AND_SECURITY.md`, `03_NonFunctional/03_SECURITY_AND_PRIVACY.md`).

## Generate bindings

After any change to a bound handler signature, regenerate the TypeScript bindings:

```bash
wails generate module   # → frontend/wailsjs/  (just gen)
```

CI runs `wails generate module` and fails on any diff in `frontend/wailsjs/`, so bindings can never
drift from the Go signatures. The frontend imports these bindings **only**
through `logic/adapter/` (`03_FRONTEND_REACT.md` `#adapter-layer`); the bridge mock shadows the same
module paths for `just dev-ui` (`#bridge-mock`).
