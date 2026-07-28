**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `02_Architecture/01_SYSTEM_ARCHITECTURE.md`, `02_Architecture/02_BACKEND_GO.md`, `02_Architecture/03_FRONTEND_REACT.md`

# Module Inventory

The authoritative list of every shippable module. A story that names a module should use a
path from this file. Adding/renaming a module requires updating this file in the same story.

## How to read

- **Backend** modules are Go packages under `internal/` (module path shown relative to repo root).
- **Frontend** modules are TypeScript folders under `frontend/src/`.
- **Independent test target**: `yes` = unit-testable in isolation with fakes; `integration` = needs a
  real dependency (DB/webview/OS); `partial` = mix.
- Backend layering is strict: **Handler → Service → Repository**; handlers return `apperr.*Result`
  and take no `context.Context`. `internal/apperr` imports no other internal package.

## Module layering map

```
                 Wails bindings (main.go: Bind / EnumBind)
                          │
   Handlers  ── appmodel / docs / workspace / settings / recent / export / fileassoc (in internal/application wiring)
                          │  (Result envelopes; no ctx)
   Services  ── appmodel (authoritative model, DD-62; composes the verticals below; emits state:*)
                · docsvc / workspacesvc / settingssvc / recentsvc / exportsvc / assetsvc
                          │  ((T, error) signatures)
   Repos/OS  ── db+store / file / os dialogs / assetserver handler
                          │
   Shared    ── apperr · logging · bootstrap · gate

Frontend (webview):
   ui/widgets → ui/components → ui/primitives → ui/styles(tokens)
   logic/store (Redux projection of appmodel: GetState hydration + state:patch, DD-63)
     → logic/adapter (commands / debounced UpdateBuffer, DD-64) → wailsjs bindings → Go handlers
   logic/{theme,markdown,format,lint,hooks,utils} · i18n · dev/bridge-mock
```

## Backend modules (Go, `internal/`)

| Module path | Purpose | Public API entry point | Notable deps | Test target | Implementer notes |
|---|---|---|---|---|---|
| `internal/apperr/` | Error/`ErrorCode` catalog, `AppError`, `WireError`, `ToWire`, all `*Result` envelopes + DTOs | `apperr.go`, `wire.go`, `results.go` | none (bottom of graph) | yes | Imports no other internal pkg. `cause` never serialized. Enum exposed to TS via `EnumBind`. |
| `internal/bootstrap/` | Pre-DB console logger + build-tag `IsDevBuild` | `NewLogger`, `IsDevBuild` | zerolog | yes | Called first in `main()`. |
| `internal/logging/` | Configured zerolog + lumberjack file sink; implements Wails logger; `Reconfigure` | `logging.Logger` | zerolog, lumberjack | partial | Local file only (DD-33). No `os.Exit` in `Fatal`. |
| `internal/file/` | OS path resolution (config/logs dirs), `isDev` isolation | `FileUtilsServiceAPI` | os | yes | macOS `~/Library/Application Support/GoMarkEdit`, Linux `~/.config/GoMarkEdit`, Win `%APPDATA%\GoMarkEdit`; `-Dev` suffix in `wails dev`. |
| `internal/db/` | SQLite open (modernc), WAL+busy_timeout, goose migrations, sqlc store | `Open`, `Database` | modernc.org/sqlite, goose, sqlc `store/` | integration | **No single-instance flock** (DD-08). Multi-process WAL. `store/` is sqlc-generated — never hand-edit. |
| `internal/appmodel/` | **Authoritative in-memory application model** (single source of truth, DD-62): open docs + canonical content, tabs+active, workspace ref, UI/layout; query `GetState` + commands (`OpenDoc`/`CloseTab`/`SetActiveTab`/`UpdateBuffer`/`SetUILayout`/…); emits `state:*` events H/S | `AppModelHandler`, `AppModelService` | docs, workspace, settings, recent, apperr, Wails runtime (events) | partial | Mutex-guarded `AppState`; composes the I/O verticals (does not duplicate them). Debounced `UpdateBuffer` from the editor (DD-64); never echoes buffer text to the focused editor. Persists only the durable subset (window/UI-layout) via settings. |
| `internal/settings/` | KV settings groups (theme, appearance, autosave, standard, policies…) + window/UI-layout state groups (`window.*`/`ui.*`, DD-60/DD-61) H/S/R | `SettingsHandler`, `SettingsService`, `SettingsRepositoryAPI` | db, apperr, file | partial | Generic `settings(key,value,type)` KV table; add prefs/layout keys without a migration. `WindowState`/`UILayout` config groups back the write-through-on-change layout persistence; `Init(ctx)` `restoreWindowState`. Holds `AppVersion` (ldflags-injected, DD-65). |
| `internal/recent/` | Recent files & folders list + "reopen last" H/S/R | `RecentHandler`, `RecentService` | db, apperr | partial | Bounded list; MRU ordering; prune missing paths lazily. |
| `internal/docs/` | Document I/O: open/save/save-as, native dialogs, encoding & line-ending preservation | `DocsHandler`, `DocsService` | apperr, file, Wails runtime dialogs | integration | UTF-8 new files; preserve BOM/CRLF (DD-15). Uses `runtime.OpenFileDialog`/`SaveFileDialog`. |
| `internal/workspace/` | Open folder → recursive filtered tree (`.md/.markdown/.mdown/.txt`); lazy children | `WorkspaceHandler`, `WorkspaceService` | apperr, file | partial | Filter hidden files; large-folder guard; optional watch is out of v1 scope. |
| `internal/assets/` | Guarded `AssetServer.Handler` serving local files to the webview; relative-to-document resolution + allowlist | `NewAssetHandler` | net/http, os | partial | Path-traversal rejection; allowlist = doc dir + workspace root (DD-21). |
| `internal/export/` | PDF export orchestration (trigger webview print of a print-scoped view) | `ExportHandler`, `ExportService` | apperr, Wails runtime | partial | v1 uses webview print path (DD-23). Styling flag (DD-24). |
| `internal/fileassoc/` | Open-target routing for OS opens **and drag-and-drop**: normalize `OnFileOpen`/argv/**dropped** paths → open request(s); `stat`-classify file vs folder; per-OS open-path helper | `ResolveOpenTarget`, `ResolveDropped`, `OpenPathArgs` | apperr, os | yes | Pure argv/classify mapping is unit-testable. Dropped paths route identically to OS opens (DD-58). |
| `internal/gate/` | Single-flight guard for long ops (export/format-all) | `Gate.TryAcquire/Release` | none | yes | Surface `apperr.Busy()` when held. |
| `internal/application/` | DI root `ApplicationContextHolder`; two-phase wiring; holds ctx; small app utilities | `NewApplicationContextHolder`, `Init` | all services/handlers | partial | Phase 1 nil repos in ctor; Phase 2 `SetRepository` in `Init(ctx)`. Only file allowed to wire concretes. |

Composition root: **`main.go`** (embed `frontend/dist`, `wails.Run`, `Bind`, `EnumBind`, `OnStartup`→`Init` + `runtime.OnFileDrop`, `OnShutdown`, `Mac.OnFileOpen`, `DragAndDrop{EnableFileDrop,DisableWebViewDrop}`, `info.fileAssociations` via `wails.json`).

## Frontend modules (TypeScript, `frontend/src/`)

| Module path | Purpose | Public API entry point | Notable deps | Test target | Implementer notes |
|---|---|---|---|---|---|
| `ui/styles/` | `tokens.css` (3 themes × light/dark), `base.css`, print stylesheet | CSS custom props | — | partial | Normative tokens; never rename. `.reader`/print styles here. |
| `ui/primitives/` | Radix wrappers: Dialog, DropdownMenu, ContextMenu, Tabs, Switch, Segmented, Select, Popover, Toast, Tooltip | `*.tsx` + `*.module.css` | radix-ui | yes | Behaviour/a11y from Radix; visuals from tokens. |
| `ui/components/` | Presentational: Button, IconButton, Icon, Chip, TreeItem, TabBar, Toolbar, StatusBar, MenuBar, Banner, MarkdownView, MermaidBlock, CodeEditor | per-component `.tsx` | react, monaco, mermaid | yes | `CodeEditor`/`MermaidBlock`/`MarkdownView` wrap Monaco / Mermaid / react-markdown. |
| `ui/widgets/` | Feature views: EditorView, PreviewView, ReaderView, FileExplorer(Sidebar), SettingsDialog, ShortcutsDialog, AboutDialog, ExternalContentBanner, AppMenuBar | per-widget folder | store, adapter, i18n | partial | Compose components; read/dispatch store. |
| `logic/adapter/` | Wrappers over generated `wailsjs/` bindings (appModel, docs, workspace, settings, recent, export, assets, app) + `unwrap`/`guardArity`; hydrates via `GetState` and subscribes to `state:*` events | `index.ts` singletons | wailsjs | partial | **Only layer importing `wailsjs/`.** `unwrap` auto-toasts envelope errors. `appModelAdapter` owns `getState`/commands + `updateBuffer`/`flushBuffer` (DD-64) and dispatches `state:patch` into the store. |
| `logic/store/` | Redux Toolkit slices projecting the backend model: documents, tabs, workspace, settings, ui, theme, recent, lint, notifications | `store/index.ts` | @reduxjs/toolkit | yes | **Projection / view-model cache of `internal/appmodel` — not a source of truth (DD-62/DD-63).** Hydrated from `GetState`, reconciled by `state:*` events; UI actions dispatch **commands**. Holds no document content (only metadata); the visible buffer lives in Monaco and syncs to Go (DD-64). |
| `logic/theme/` | `resolveEffectiveTheme`, `applyTheme`, `initTheme`, `watchSystemTheme` (theme × appearance) | `theme/index.ts` | — | yes | Sets `data-theme`+`data-mode` on `document.documentElement`. |
| `logic/markdown/` | Rendering pipeline config: remark/rehype plugin sets per standard, `components` override, mermaid wiring | `renderer.ts` | react-markdown, remark-*, rehype-* | yes | Standard→plugin-set map (DD-14/DD-19). |
| `logic/format/` | Format + Compact via Prettier / remark-stringify | `format.ts` | prettier / remark | yes | Canonical style defaults (DD-16/DD-18). |
| `logic/lint/` | remark-lint runner + rule config; maps findings to editor markers | `lint.ts` | remark-lint | yes | Consistency rules (DD-17). |
| `logic/hooks/` | `useShortcuts`, `useFileOpenEvent`, `useFileDrop`, `useAutosave`, `useSystemTheme`, `useToast` | per-hook | react | partial | Autosave debounced (DD-12); shortcuts registry (DD-31). `useFileDrop` subscribes to the Wails `OnFileDrop` event + `preventDefault`s webview drop (DD-58/DD-59). |
| `ui/components/` (DropOverlay) | Drag-over **drop-target overlay** ("Drop to open"); carries the `--wails-drop-target` token | `DropOverlay` | react | yes | Visual affordance for drag-and-drop (DD-59); the folder-conflict prompt reuses the Dialog primitive. |
| `logic/utils/` | `parseError`, path/url helpers | per-util | — | yes | `parseError` normalizes envelope errors. |
| `i18n/` | i18n init + `en` resource bundle; `t()` | `i18n/index.ts`, `locales/en.json` | i18n lib | yes | English only shipped; adding a locale = new JSON (DD-35). |
| `dev/bridge-mock/` | Dev-only mock of the Wails bridge (handlers + runtime) + Vite plugin wiring | `bridge-mock/*` | — | n/a | Active only in plain `npm run dev`. |

## LLM assistant modules (built last)

These modules are added by the assistant phases (`07_Phases/00_ROADMAP.md`). They consume the
reserved seams F1–F10 and must not exist earlier. See
`02_Architecture/08_LLM_INTEGRATION.md`.

### Backend (Go, `internal/llm/` group + additions)

| Module path | Purpose | Public API entry point | Notable deps | Test target | Implementer notes |
|---|---|---|---|---|---|
| `internal/llm/providers/` | `Provider` interface + OpenAI-compatible client + per-kind `ProviderProfile` + factory; model discovery; error mapping; streaming | `Provider`, `NewFactory`, `ProviderProfile` | net/http client, apperr | partial | Ollama/LM Studio/llama.cpp/OpenAI/Azure/compat. API key from env-var name only (DD-45). |
| `internal/llm/verify/` | Draft-config verification: `TestConnection`/`TestModels`/`TestInference` | `VerifyService` | providers, gate, apperr | partial | TestInference acquires the gate (DD-46/DD-47). |
| `internal/llm/tokenizer/` | Offline token estimation + safety margin + fit check | `Estimate`, `Fits` | offline BPE (embedded) | yes | Estimator + margin; reply reserve (DD-50). No network. |
| `internal/llm/context/` | Context budgeter: allocate window across system/tools/document/history; sliding-window / summarize trim | `Budget`, `Trim` | tokenizer | yes | Explicit budget (DD-51). |
| `internal/llm/tools/` | Agent tool registry + implementations: read_document, read_selection, list_workspace_files, read_workspace_file, propose_edit | `Registry`, tool defs | appmodel (canonical buffer/selection), workspace, assets(allowlist) | yes | Least-privilege, read-mostly; edits are proposals only (DD-41/DD-42). Document/selection reads come from `internal/appmodel` (DD-62/DD-64), never the editor widget. |
| `internal/llm/agent/` | Agentic tool-call loop orchestrator: multi-turn, bounded iterations/time, cancellation each turn; emits progress/stream events | `AgentHandler`, `RunAgent` | providers, tools, context, gate | partial | Replaces a fixed linear chain (DD-40/ADR-0008). |
| `internal/llm/actions/` | Preconfigured action catalog (Proofread, Confluence/Wiki, Article, Q&A, Summarize…) as data → seeds the agent | `Catalog`, `ActionMeta` | — | yes | Actions are data; custom-instruction path bypasses the catalog (DD-39). |
| `internal/settings/` (extended) | Adds `providers` table (additive migration) + AI KV keys (provider id, model, params, estimator, margins, strategies) | existing `SettingsHandler` | db | partial | Additive migration only; grows the F4 registry. |

### Frontend (TypeScript, additions)

| Module path | Purpose | Public API entry point | Notable deps | Test target | Implementer notes |
|---|---|---|---|---|---|
| `ui/widgets/assistant/` | Right sidebar: header (provider/model), scope + token meter, actions bar, chat transcript, composer, edit-proposal card | `AssistantSidebar` | store, adapter, DiffView | partial | Consumes F1 slot; apply-edit via F3/F7 command seam (DD-38/DD-42). |
| `logic/store/assistant/` | Redux slices: `assistant` (config/scope), `chat` (transcript), `run` (agent progress/stream) | `assistant/index.ts` | @reduxjs/toolkit | yes | One slice per concern; agent events → run slice. |
| `logic/adapter/` (extended) | Adapter methods for agent/providers/verify handlers; subscribe to agent progress/stream events | existing `index.ts` singletons | wailsjs | partial | Only layer importing `wailsjs/`. |
| `logic/llm/` | Frontend helpers: scope resolution, token-meter formatting, edit-proposal → diff mapping | `llm/index.ts` | — | yes | UI-side glue; no network. |
| `ui/widgets/settings/` (extended) | New settings tabs: **AI / Providers** and **AI Context** | existing SettingsDialog | store | partial | DD-53. |

## Module count summary

- **Before the assistant**, backend: **15** packages + `main.go` (incl. `internal/appmodel`). Frontend: **13** module folders.
- **The assistant phases** add backend: **7** new packages (`internal/llm/*`) + `internal/settings` extension.
  Frontend: **4** new/extended modules.
- Total shippable modules tracked here: **~38** (+ composition root).
