**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `02_Architecture/01_SYSTEM_ARCHITECTURE.md`, `02_Architecture/05_STATE_AND_PERSISTENCE.md`, `02_Architecture/06_ERROR_HANDLING.md`, `06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `08_Decisions/ADR-0004`, `08_Decisions/ADR-0006`

# Backend (Go)

The backend is CGO-free Go 1.25+ under `internal/`, wired by a single composition root. It uses a typed
error-envelope pattern and two-phase dependency injection, fitted to a Markdown editor's domain
(documents, workspace tree, assets, export) and to multi-instance operation (DD-03,
DD-08). This document is the normative contract for handlers, services, repositories, and wiring.

## Table of Contents

1. Layering
2. Error envelope
3. DI two-phase
4. Packages
5. Dialogs
6. File I/O
7. Persistence
8. Long-ops gate
9. Application model

## Layering

Strict, inward-pointing layers:

```
Wails bindings (main.go: Bind / EnumBind)
        │
Handlers   appmodel · docs · workspace · settings · recent · export · fileassoc
        │   returns apperr.*Result · takes NO context.Context · defer/recover → CodeInternal
Services   appmodelsvc · docsvc · workspacesvc · settingssvc · recentsvc · exportsvc · assetsvc
        │   holds (T, error) signatures · owns business logic · receives ctx
Repos/OS   db + store (sqlc) · file (paths) · runtime dialogs · AssetServer handler
        │
Shared     apperr · logging · bootstrap · gate
```

- A **handler** is the only Wails-bound surface of a vertical. It validates/marshals, calls its
  service, converts any error to a `WireError`, and returns an `apperr.*Result`. It never contains
  business logic and never returns `(T, error)`.
- A **service** owns the logic and keeps idiomatic `(T, error)` signatures. It receives the Wails
  `ctx` from the handler where a downstream call needs it (dialogs, runtime).
- A **repository / OS adapter** is the only code that touches SQLite (`internal/db`), the file system,
  or OS dialogs.
- `internal/apperr` is the bottom of the graph and imports no other internal package (verified by an
  import-graph check in `just check`).

## Error envelope

The error envelope is defined as follows (DD-03; ADR-0004 wiring context; full catalog in
`06_ERROR_HANDLING.md`).

- `apperr.AppError` is the single typed backend error: `Code ErrorCode`, `Title`, `Message`,
  `Details map[string]string` (safe allowlist only — never secrets or absolute paths beyond what the
  user already knows), `Retryable bool`, and an **unexported `cause error`** that is *never*
  serialized.
- `apperr.WireError` is the JSON shape crossing the bridge — identical fields **minus** `cause`.
- `apperr.ToWire(log zerolog.Logger, err error) WireError` logs the full error chain (including
  `cause`) once at the handler boundary, then returns the sanitized `WireError`. Any nil or
  unclassified error maps to `CodeInternal`.
- Bound methods return a concrete envelope: `VoidResult`, `StringResult`, `DocResult`, `DocListResult`,
  `TreeResult`, `SettingsResult`, `RecentResult`, … (`06_ERROR_HANDLING.md` `#result-envelopes`).

**Canonical handler skeleton** (every bound method follows this shape exactly):

```go
// SaveDocument is Wails-bound: no context.Context param, returns a Result envelope.
func (h *DocsHandler) SaveDocument(req SaveDocRequest) (res apperr.DocResult) {
    defer func() {
        if r := recover(); r != nil {
            ae := apperr.Internal(fmt.Errorf("panic: %v", r))
            wire := apperr.ToWire(h.zlog(), ae)
            res = apperr.DocResult{Error: &wire}
        }
    }()

    doc, err := h.service.Save(h.ctx, req) // service keeps (ctx, T) (T, error)
    if err != nil {
        wire := apperr.ToWire(h.zlog(), err)
        return apperr.DocResult{Error: &wire}
    }
    return apperr.DocResult{Data: &doc}
}
```

Rules: a **named return** (`res`) so the deferred `recover` can rewrite it; `defer/recover` converts any
panic to `CodeInternal`; validation failures use `apperr.Validation(field, expected, got)`; the gate's
rejection uses `apperr.Busy()`. `ErrorCode` is exported to TypeScript via `EnumBind` in `main.go`
(`04_WAILS_INTEGRATION.md` `#bind-enumbind`).

## DI two-phase

`internal/application.ApplicationContextHolder` is the DI root and the **only** file allowed to wire
concrete implementations. Wiring is two-phase because the database is not open when
the struct is constructed:

```go
type ApplicationContextHolder struct {
    ctx context.Context

    AppModelHandler  *appmodel.AppModelHandler
    DocsHandler      *docs.DocsHandler
    WorkspaceHandler *workspace.WorkspaceHandler
    SettingsHandler  *settings.SettingsHandler
    RecentHandler    *recent.RecentHandler
    ExportHandler    *export.ExportHandler

    DB          *db.Database
    fileService file.FileUtilsServiceAPI
    appLogger   *logging.Logger
    // ...services held for phase-2 SetRepository wiring
}

// Phase 1 — pure constructor: build services/handlers with NIL repositories.
func NewApplicationContextHolder(appLogger *logging.Logger) *ApplicationContextHolder { /* nil repos */ }

// Phase 2 — after the DB opens (called from OnStartup): inject real repositories.
func (a *ApplicationContextHolder) Init(ctx context.Context) error {
    dbPath, _ := a.fileService.GetAppDatabaseFilePath()
    database, err := db.Open(dbPath) // WAL + busy_timeout; NO single-instance lock (DD-08)
    if err != nil { return fmt.Errorf("open database: %w", err) }
    a.DB = database

    a.SettingsService.SetRepository(settings.NewSqliteSettingsRepository(database))
    a.RecentService.SetRepository(recent.NewSqliteRecentRepository(database))
    // reconfigure logger from persisted log.* settings, restore window state, etc.
    return nil
}
```

`SetContext(ctx)` stores the Wails runtime context on the holder (and forwards it to handlers that need
it for dialogs/events). `OnShutdown` closes the DB and logger. Startup failure surfaces a
`runtime.MessageDialog` and exits non-zero. Adding a service follows the same recipe: interface in the
new package, nil repo in the constructor, real repo in `Init`, `Bind` in `main.go`, then
`wails generate module`.

## Packages

One package per row of the module inventory (`06_Process_and_Traceability/01_MODULE_INVENTORY.md`):

| Package | Role | Entry points |
|---|---|---|
| `internal/appmodel` | **Authoritative in-memory application model** (open docs + content, tabs, workspace ref, UI/layout); query + commands; emits `state:*` events (DD-62–64) | `AppModelHandler/Service`, `GetState`, `Apply*` commands |
| `internal/apperr` | Error/`ErrorCode` catalog, `AppError`, `WireError`, `ToWire`, all `*Result` + DTOs | `apperr.go`, `wire.go`, `results.go` |
| `internal/bootstrap` | Pre-DB console logger; `IsDevBuild` build tag | `NewLogger`, `IsDevBuild` |
| `internal/logging` | Configured zerolog + lumberjack file sink; implements Wails logger; `Reconfigure` | `logging.Logger` |
| `internal/file` | OS path resolution (config/logs/db dirs), `-Dev` isolation | `FileUtilsServiceAPI` |
| `internal/db` | SQLite open (modernc), WAL + `busy_timeout`, goose migrations, sqlc `store/` | `Open`, `Database` |
| `internal/settings` | KV settings groups (theme, appearance, standard, policies, view-mode) H/S/R | `SettingsHandler/Service`, `SettingsRepositoryAPI` |
| `internal/recent` | Recent files & folders, "reopen last"; MRU, prune-missing H/S/R | `RecentHandler/Service` |
| `internal/docs` | Document open/save/save-as, native dialogs, encoding + line-ending preservation | `DocsHandler/Service` |
| `internal/workspace` | Open-folder → recursive filtered tree; lazy children | `WorkspaceHandler/Service` |
| `internal/assets` | Guarded `AssetServer.Handler`; relative-to-document + allowlist | `NewAssetHandler` |
| `internal/export` | PDF export orchestration via webview print | `ExportHandler/Service` |
| `internal/fileassoc` | `OnFileOpen`/argv → open request; per-OS open-path helper | `ResolveOpenTarget`, `OpenPathArgs` |
| `internal/gate` | Single-flight guard for long ops | `Gate.TryAcquire/Release` |
| `internal/application` | DI root; two-phase wiring; holds ctx | `NewApplicationContextHolder`, `Init` |

Composition root: **`main.go`** (embed, `wails.Run`, `Bind`, `EnumBind`, `OnStartup`→`Init`,
`OnShutdown`, `Mac.OnFileOpen`).

## Dialogs

Native open/save dialogs are Wails runtime calls made from within a service, using the stored context:

```go
path, err := wailsruntime.OpenFileDialog(ctx, wailsruntime.OpenDialogOptions{
    Title:   "Open Markdown",
    Filters: []wailsruntime.FileFilter{{DisplayName: "Markdown", Pattern: "*.md;*.markdown;*.mdown;*.txt"}},
})
```

`SaveFileDialog` mirrors this for "Save As". `OpenDirectoryDialog` backs "Open Folder" (DD-06). The
handler wraps the outcome in a `*Result`; a user cancel is **not** an error — it returns an empty/`nil`
`data` field, which the frontend treats as a no-op (a documented edge case, `EC-DOCS-*`). Dialog
functions call into the live Wails frontend, so services keep them behind small package-level function
variables that tests swap (the "execution seam" pattern).

## File I/O

`internal/docs` is the document I/O boundary (DD-15):

```go
type Document struct {
    Path       string // absolute; empty for a new, never-saved buffer
    Content    string // UTF-8 text handed to the webview
    Encoding   string // "utf-8" (+ "-bom" when a BOM was present)
    LineEnding string // "lf" | "crlf" — detected on open, preserved on save
    HadBOM     bool
}

type DocsService interface {
    Open(ctx context.Context, path string) (Document, error)
    Save(ctx context.Context, req SaveDocRequest) (Document, error)   // existing path
    SaveAs(ctx context.Context, req SaveDocRequest) (Document, error) // dialog → new path
}
```

Rules: **new files are written UTF-8, LF, no BOM.** Opened files are read tolerantly; the app detects
and **preserves the existing line endings (LF/CRLF) and a BOM if present** on round-trip and never
silently rewrites them (DD-15). Encoding + line-ending are reported to the status bar. Autosave applies
to existing files only; never-saved buffers require an explicit Save/Save-As (DD-12).

## Persistence

State beyond the file lives in a small SQLite key-value store, opened with **no single-instance lock**
(DD-08, DD-10, DD-13; ADR-0004, ADR-0006). The DSN
enables `busy_timeout`, WAL, foreign keys, and `synchronous(NORMAL)`; the pool is capped to one writer:

```go
dsn := fmt.Sprintf(
  "file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)&_pragma=synchronous(NORMAL)",
  path)
db, _ := sql.Open("sqlite", dsn)
db.SetMaxOpenConns(1)
```

Settings use a generic `settings(key, value, type)` table so new preferences need no migration; recent
files/folders and window state are persisted likewise. Full schema, migration policy, and the
multi-instance concurrency contract are in `05_STATE_AND_PERSISTENCE.md`. sqlc-generated
`internal/db/store/` is never hand-edited; migrations are additive-only.

## Long-ops gate

`internal/gate` is a process-wide, non-blocking, single-slot semaphore:

```go
type Gate struct{ ch chan struct{} }
func New() *Gate                { return &Gate{ch: make(chan struct{}, 1)} }
func (g *Gate) TryAcquire() bool { select { case g.ch <- struct{}{}: return true; default: return false } }
func (g *Gate) Release()         { select { case <-g.ch: default: } }
```

Exclusive, potentially slow operations — PDF export and format-all — acquire the gate; if it is already
held, the handler returns `apperr.Busy()` and the frontend shows a "please wait" toast instead of
starting a second run. Progress for such operations is surfaced through Wails events, not the return
value (`07_LARGE_FILES_AND_CONCURRENCY.md`).

## Application model

`internal/appmodel` is the **single source of truth** for the live application (DD-62; MVC "Model"). It
holds the whole working state in Go memory and is the only owner of it; the frontend renders a projection
of it and drives it with commands (DD-63; `03_FRONTEND_REACT.md#state-ownership`). It sits at the service
layer and composes the I/O verticals — it calls `internal/docs` for file read/write, `internal/workspace`
for the tree, and `internal/settings`/`internal/recent` for the durable subset — rather than duplicating
them.

```go
// The authoritative model (guarded by a single mutex; one owner).
type AppState struct {
    Docs    map[string]*OpenDoc // tabId → document (canonical content lives HERE, not the webview)
    TabOrder []string           // tab order
    ActiveTab string
    Workspace *WorkspaceRef      // open folder root (tree served lazily by internal/workspace)
    UI        UILayout           // sidebar visibility/width, arrangement, pane visibility, assistant (DD-60)
}

type OpenDoc struct {
    Path       string  // absolute; empty for a new, never-saved buffer
    Content    string  // canonical buffer — the source of truth (DD-64)
    Dirty      bool
    Encoding   string  // "utf-8" (+ "-bom")
    LineEnding string  // "lf" | "crlf"
    View       DocView // arrangement, reading flag, scroll, cursor/selection
}
```

**Query + commands + events.** The bound `AppModelHandler` exposes exactly three shapes, all following
the envelope contract (`#error-envelope`):

- **Query** — `GetState() StateResult` returns a serializable snapshot for the frontend to hydrate its
  projection at startup / window-open.
- **Commands** — `OpenDoc`, `CloseTab`, `SetActiveTab`, `ReorderTabs`, `UpdateBuffer` (the debounced
  editor sync, DD-64), `SetDocView`, `OpenWorkspace`, `SetUILayout`, … Each mutates `AppState` under the
  mutex, persists the durable subset where applicable (window/UI-layout via `internal/settings`, DD-60),
  and emits a `state:*` event describing the change.
- **Events** — after every mutation the service emits **`state:patch`** with only the changed sections
  (e.g. `{ docs: {…}, activeTab }`), which the adapter applies to the Redux projection
  (`07_LARGE_FILES_AND_CONCURRENCY.md#events-progress`, `03_FRONTEND_REACT.md#state-ownership`). The
  backend **never** emits buffer text back to the currently focused editor (DD-64), only derived fields
  (dirty, counts) other views need.

**Memory ownership.** Because `Content` for every open document lives in `appmodel`, inactive tabs cost
**no** webview memory — only the visible document's Monaco model is resident (DD-63;
`07_LARGE_FILES_AND_CONCURRENCY.md#large-file-strategy`). The model is per-process (each instance owns its
own), consistent with the multi-instance design (DD-08). It respects file-first (DD-11): the model starts
empty on launch (no session restore); documents on disk remain the persistence source of truth.
