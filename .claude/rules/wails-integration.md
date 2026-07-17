---
paths:
  - "main.go"
  - "wails.json"
  - "build/**"
---

# Wails v2 integration

**Authority:** `specification/00_Foundation/04_DESIGN_DECISIONS.md` (DD-01, DD-02, DD-07, DD-08,
DD-21, DD-25, DD-26, DD-62, ADR-0001, ADR-0014), `01_MODULE_INVENTORY.md` (composition root: `main.go`,
`internal/application/`, `internal/assets/`, `internal/fileassoc/`). The composition root is `main.go`;
platform options and file associations are declared in `wails.json`.

Target **Wails v2** (stable, not v3), one codebase, native webview per OS (DD-01/02). `main.go` is the
composition root and the only place `wails.Run` is called.

## DO

- Embed the built frontend and serve it, plus the guarded local-asset handler:

  ```go
  //go:embed all:frontend/dist
  var assets embed.FS

  err = wails.Run(&options.App{
      Title: "GoMarkEdit",
      AssetServer: &assetserver.Options{
          Assets:  assets,
          Handler: app.AssetHandler, // internal/assets: relative-to-doc + allowlist, traversal rejected (DD-21)
      },
      Logger: appLogger,
      OnStartup:  func(ctx context.Context) { app.SetContext(ctx); if err := app.Init(ctx); err != nil { /* dialog + exit */ } },
      OnShutdown: func(ctx context.Context) { if app.DB != nil { app.DB.Close() }; appLogger.Close() },
      Bind:     []any{app, app.AppModelHandler, app.DocsHandler, app.WorkspaceHandler, app.SettingsHandler, app.RecentHandler, app.ExportHandler},
      EnumBind: []any{allErrorCodes}, // apperr.ErrorCode -> real TS enum
      Mac: &mac.Options{ OnFileOpen: func(path string) { app.RouteOpenPath(path) } }, // DD-26 macOS open
  })
  ```

- Lifecycle: `OnStartup` calls `app.SetContext(ctx)` then `app.Init(ctx)` (two-phase DI opens the DB and
  injects repos). `OnShutdown` closes the DB and logger. **No single-instance lock** (DD-08).
- OS file-open routing (DD-26): macOS via `Mac.OnFileOpen`; Windows/Linux via the **first CLI argument**.
  Normalize both through `internal/fileassoc` (`ResolveOpenTarget`) into one open request, dispatched as an
  `internal/appmodel` **`OpenDoc` command** — the model opens the document and the resulting tab/document
  change reaches the frontend as a **`state:patch`** event (DD-62); the open starts in the configured
  default mode (DD-27).
- Declare associations + icon in `wails.json` `info.fileAssociations` for `.md`, `.markdown`, `.mdown`,
  `.txt` (DD-07):

  ```json
  "info": {
    "productName": "GoMarkEdit",
    "fileAssociations": [
      { "ext": "md", "name": "Markdown Document", "iconName": "markdown", "role": "Editor" }
    ]
  }
  ```

- After ANY bound-signature change, run `just gen` (`wails generate module`) and commit no drift in
  `frontend/wailsjs/`.

## DON'T

- No Wails v3. No single-instance flock / "already running" dialog (multi-instance is required, DD-08).
- Don't `Bind` a handler that returns `(T, error)` or takes `context.Context` (see `go-error-envelope.md`).
- Don't serve local files without the allowlisted, traversal-checked asset handler.
- Don't leave stale bindings; don't silently seize the OS default association (register/prompt only, DD-25).

## Authoring checklist

- [ ] `frontend/dist` embedded; asset handler is the guarded `internal/assets` one.
- [ ] `OnStartup`->`SetContext`+`Init`; `OnShutdown` closes DB + logger; no instance lock.
- [ ] macOS `Mac.OnFileOpen` + Win/Linux argv both routed via `internal/fileassoc` into an `appmodel`
      `OpenDoc` command (frontend updated via `state:patch`, DD-62).
- [ ] `AppModelHandler` is in the `Bind` list; every `internal/appmodel` mutation emits `state:patch`.
- [ ] `wails.json` `info.fileAssociations` covers `.md/.markdown/.mdown/.txt` + icon.
- [ ] `ErrorCode` in `EnumBind`; bindings regenerated with no drift.
