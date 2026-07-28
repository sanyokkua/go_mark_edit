**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** all `01_Product/*`, `02_Architecture/*`, `08_Decisions/*`

# Design Decisions (Locked)

These are the binding product/technical decisions made with the project owner. Each has a stable id
(`DD-NN`) that stories and ADRs cite. A decision changes only via a new ADR that supersedes the
relevant row. Where a decision is architecturally significant it also has an ADR (noted).

## Table of Contents

1. Platform & framework
2. Documents, files & workspace
3. Persistence & state
4. Markdown behaviour
5. Formatting, linting & standards
6. Rendering & assets
7. Export
8. OS integration
9. Theming & UX
10. Non-functional & operations
11. LLM assistant
12. Drag-and-drop
13. Window & UI-layout state
14. Application state ownership
15. Versioning, app icon & CI/CD
16. Decisions from the 2026-07-25 review

## 1. Platform & framework

- **DD-01** Target **Windows 10+, macOS 12+, modern Linux**; one codebase, native webview per OS. (ADR-0001)
- **DD-02** Use **Wails v2** (stable), not v3 (alpha). (ADR-0001)
- **DD-03** Backend is **Go 1.25+, CGO-free**; SQLite via `modernc.org/sqlite`.
- **DD-04** Frontend is **React 19 + Vite + TypeScript**, rendered in the embedded webview. It holds
  **no authoritative application state** — it is a thin view/controller over the Go-owned model (DD-62/DD-63).

## 2. Documents, files & workspace

- **DD-05** Support **multiple document tabs**.
- **DD-06** Support **opening a folder** as a workspace tree, recursively, **filtered** to `.md`,
  `.markdown`, `.mdown`, `.txt` (all other files hidden).
- **DD-07** Claim/associate extensions: **`.md`, `.markdown`, `.mdown`, `.txt`**; ship a custom file icon.
- **DD-08** Support **multiple app instances** (VS Code-style). Opening a second file may open a new
  window/instance; there is **no single-instance lock**. (ADR-0006)
- **DD-09** Editor shows **Markdown source with syntax highlighting**; the preview **renders** it. No
  WYSIWYG. The editor's visible buffer is a working copy **debounce-synced to the backend model** (DD-64).

## 3. Persistence & state

- **DD-10** Persist beyond files: **recent files & folders**, all **settings**, window size, and
  per-document view mode. **Application-level window & UI-layout state** (sidebar visibility, view
  arrangement, etc.) also persists, per **DD-60**/**DD-61**. Backed by a small **SQLite key-value
  store**. (ADR-0004) The persisted data is the **durable subset** of the backend-owned application
  model (DD-62); the live model lives in Go memory and is not all persisted.
- **DD-11** On launch the app opens **clean** (no automatic session restore). The user reopens via
  **File → Open Recent** or "Reopen last file/folder". **No crash recovery / swap files.**
- **DD-12** **Autosave** existing files, with a setting to enable/disable (default: **on**). New,
  never-saved buffers are never silently written — they require an explicit Save/"Save As".
- **DD-13** Because instances are multi-process (DD-08), the settings DB is opened with **WAL +
  `busy_timeout`** so concurrent instances share it safely; writes (settings/recent) are infrequent.

## 4. Markdown behaviour

- **DD-14** Markdown standard is a **user setting** with three levels: **Minimal (CommonMark)**,
  **GFM** (default), **Full** (GFM + math + footnotes + admonitions/directives + frontmatter).
- **DD-15** Encoding: **UTF-8 for new files**. Opened files are read tolerantly; the app **preserves
  the file's existing line endings (LF/CRLF) and a BOM if present** on round-trip, and never silently
  rewrites them. Encoding + line-ending are shown in the status bar.

## 5. Formatting, linting & standards

- **DD-16** Provide **Format** (pretty-print: pad tables, normalize markers/wrap) and **Compact**
  (a conservative whitespace-tightening, *not* aggressive minify — Markdown whitespace can be
  meaningful). Both are frontend operations (Prettier / remark-stringify). (ADR-0003)
- **DD-17** Provide **Lint** for consistency (list-marker style, emphasis style, heading style, etc.)
  using `remark-lint`; findings shown as editor squiggles + a status-bar count.
- **DD-18** Format and Lint run **on demand** (toolbar/shortcut) and **optionally on save** (settings:
  "Format on save", "Lint on save"). Enforced canonical style defaults: bullet `-`, emphasis `_`,
  ATX headings `#`.

## 6. Rendering & assets

- **DD-19** Rendering pipeline: **react-markdown + remark-gfm + remark-math + rehype-katex +
  rehype-highlight**, with a `components` override that intercepts ` ```mermaid ` fences into an async
  **MermaidBlock**. (ADR-0003)
- **DD-20** **Editor engine: Monaco** for v1 (proven; handles large
  files). Live preview is **debounced**; for very large files the preview may pause live updates
  (setting). CodeMirror 6 is a documented future option. (ADR-0002)
- **DD-21** **Local image paths resolve relative to the current document** (GitHub/GitLab semantics),
  served through a guarded Wails `AssetServer` handler with a directory **allowlist** (the document's
  folder + workspace root); path traversal is rejected. *(Configured roots were cut on 2026-07-25 —
  no setting for them was ever defined; ADR-0030, `01_Product/19_SANITIZATION_AND_CSP.md`.)*
- **DD-22** **Remote content in documents (images/CSS)** is governed by a policy setting: **Ask**
  (default; shows an in-preview banner), **Always allow**, **Always block**. The app itself makes no
  network calls; only document-referenced remote assets are affected, and only per this policy.

## 7. Export

- **DD-23** **Export current document to PDF** via the webview print path (`window.print()` against a
  print-scoped copy of the rendered preview). v1 does not implement paginated layout controls. (ADR-0003)
- **DD-24** A setting chooses **PDF styling**: **Current theme** or **Clean document** (a neutral
  print stylesheet).

## 8. OS integration

- **DD-25** "Default app" means: appear in the OS **"Open With"** list everywhere, be **settable as
  default**, and when a Markdown file is opened, **GoMarkEdit launches and opens it**. The app cannot and
  will not silently seize the default on Windows/macOS (OS policy); it registers and may prompt.
- **DD-26** Opening a file via the OS delivers the path through Wails **`OnFileOpen`** (macOS) / the
  **first CLI argument** (Windows/Linux); such an open **starts in the default open mode** (DD-27).
- **DD-27** Setting: **default open mode** — **Editor** (default) or **Reading (Viewer)** — applied
  whenever a document is opened **from the file system**: an OS "Open With" / double-click / association
  open (`OnFileOpen` / argv, DD-26), a **drag-and-drop** open (DD-56), a **workspace-tree** open, and the
  in-app **Open** dialog. **Editor** (the default) opens the source editor in the document's persisted
  arrangement — or the last-used arrangement for a first-time open (DD-60); **Reading (Viewer)** opens
  straight into chrome-hidden reading mode (DD-30). Creating a **new** file always opens in the Editor,
  regardless of this setting. The mockup labels the two choices **"Reading (Viewer)"** and **"Editor"**.

## 9. Theming & UX

- **DD-28** Ship **three themes**: **Liquid Glass**, **Material**, **Minimal**. **No user-authored themes.** (ADR-0005)
- **DD-29** Each theme supports **Auto / Light / Dark**; **Auto follows the OS** `prefers-color-scheme`
  and updates live. Editor and preview themes are **unified** (one selection drives both).
- **DD-30** One shared layout; the theme is a **token layer only** (CSS custom properties keyed by
  `data-theme` × `data-mode`). The Viewer/reading mode **hides all chrome**. (ADR-0005)
- **DD-31** Keyboard shortcuts for bold/italic/etc., headings, lists, link/image, format, lint, save,
  open, toggle sidebar, reading mode, settings. Shortcuts shown in menus/tooltips + a Shortcuts dialog.

## 10. Non-functional & operations

- **DD-32** **Offline-first, no background network.** The app performs **no background network activity
  whatsoever** — no update checks, no telemetry, no CDN/asset fetches; all rendering assets are bundled.
  The **only** outbound requests the app ever makes are **LLM inference calls to the provider the user
  explicitly configured** (the assistant phases, DD-38+), and only **on user action** (invoking an action or sending
  a chat message). The **default provider is local** (e.g. Ollama/LM Studio), so a default install stays
  fully on-device. Remote providers (e.g. OpenAI) are strictly opt-in and require the user to enter
  their own endpoint/credentials. Before the assistant exists the app makes **zero** network calls of any kind.
  (Revised for the assistant; see ADR-0011.)
- **DD-33** **No telemetry / analytics.** Diagnostic **logs are written to a local file** (rotating)
  and never transmitted.
- **DD-34** **MIT-licensed, open source.** **No code signing / notarization** and **no auto-update** in
  v1 (document the unsigned-install caveats).
- **DD-35** **i18n-ready**: all user-facing strings go through a lightweight i18n layer; **English** is
  the only shipped locale in v1, but adding a locale must require no code changes beyond a resource file.
- **DD-36** Basic **accessibility**: keyboard operability for core actions. Full screen-reader/contrast
  certification is out of scope for v1 (DD, not a regression target).
- **DD-37** A high bar of CI/testing rigour is the **target** but is staged in later phases
  (see `07_Phases`); it is not required to block the earliest scaffolding stories.

## 11. LLM assistant

The assistant adds LLM-powered proofreading, reformatting, chat, and custom instructions over the
open document. It is built last (`07_Phases/00_ROADMAP.md`) and
must not exist before the assistant phases, but every phase before them must leave the seams open for it
(the forward-compatibility constraints F1–F10 in `00_Foundation/06_IMPLEMENTATION_STAGES.md`).

- **DD-38** The assistant lives in a **right-hand sidebar** that can be shown/hidden (default hidden
  until a provider is configured). It has, top-to-bottom: a provider/model header, an **apply-to scope**
  control (Whole document / Selection) with a **live token-fit meter**, a **quick-actions** bar, a
  **chat transcript**, and a **composer** for free-text instructions. (ADR-0010)
- **DD-39** **Preconfigured actions** ship as a catalog: **Proofread** (fix grammar/typos, keep a
  consistent style, **preserve all formatting and meaning**), reformat targets aimed at development &
  writing (**Confluence/Wiki**, **Article**, **Q&A**, plus e.g. Summarize, Improve clarity, Make
  formal/concise), and a **Custom instruction** free-text path. Actions are data (id, label, category,
  system prompt, directive, default scope), extensible without code changes where possible.
- **DD-40** The assistant is an **agentic, tool-call-based** workflow, **not** a single fixed prompt.
  The model runs a bounded **tool-call loop**: it may call read tools to gather context and an
  edit-proposal tool to return changes; the loop has hard **iteration and time limits**. (ADR-0008)
- **DD-41** **Tool scope is least-privilege and read-mostly.** Tools expose: the **current document**
  (full or selection), and — **only when a folder workspace is open** — **listing and reading of other
  Markdown/text files under the workspace root** (allowlisted, traversal-rejected, reusing the
  asset-allowlist rules established before the assistant). No arbitrary filesystem, shell, or network tools. The model **never writes
  files directly**.
- **DD-42** **All edits are proposals the user reviews.** An edit tool returns a **diff** shown in the
  sidebar; the user **Applies** (writes it into the editor buffer via the editor's document API),
  re-runs, or discards — there is no partial apply. Nothing is written to disk except through the normal save/autosave path
  after the user applies and the buffer changes. (ADR-0010)
- **DD-43** **Scope: selection or whole document.** If text is selected, actions default to the
  selection; otherwise to the whole document. The user can override per action. Applying a
  selection-scoped edit replaces only the selected range.
- **DD-44** **Chat is multi-turn** about the open document, with the same tools. Free-text
  **custom instructions** seed the loop with the user's text as the directive. Chat history is kept per
  document/tab for the session (not persisted across launches in v1).
- **DD-45** **Providers reuse a provider-abstraction**: a single OpenAI-compatible client parameterized
  by a per-kind **provider profile**, supporting **Ollama, LM Studio, llama.cpp, OpenAI, Azure OpenAI,
  and generic OpenAI-compatible** endpoints. Config: base URL, auth scheme (none/bearer/api-key),
  headers, selected model. **API keys are referenced by environment-variable name and never persisted
  or logged.** (ADR-0007)
- **DD-46** **Model discovery + verification.** The app can list models from the provider and run
  **Test connection / Test models / Test inference** on a draft config before saving. Selected provider
  and model are persisted (KV + a `providers` table); the default provider is local. (ADR-0007)
- **DD-47** **Single in-flight inference, app-wide.** A process-wide single-flight gate ensures at most
  one LLM request runs at a time; a second attempt reports a **Busy** error. Runs are **cancellable**;
  the tool loop checks for cancellation each iteration. (ADR-0008)
- **DD-48** **Retries and timeouts are owned by the app**, not the HTTP client: classify errors
  (unreachable/timeout/auth/rate-limited/context-window/…) and retry only retryable ones with backoff,
  honoring `Retry-After`. Errors surface through the standard Result-envelope + toast path.
- **DD-49** **Streaming responses** are supported where the provider allows (assistant text streams into
  the chat); non-streaming is the fallback. Streaming is a UX enhancement, never required for correctness.
- **DD-50** **Proactive tokenization / context fit.** Before a whole-document action, the app
  **estimates token count** (offline estimator + a configurable safety margin, reserving headroom for
  the reply) and shows a **fit meter**. If the content will not fit the model's context window, the app
  **warns** and offers to **process a chunk / the selection** (default: warn; chunking is opt-in in v1).
  A reactive context-window error remains the backstop. (ADR-0009)
- **DD-51** **Context is an explicit budget.** The loop allocates the window across system prompt, tool
  schemas, document/selection, and chat history; over-budget history is trimmed by **sliding window**
  (default) or **summarization** (setting). Tool schemas and system prompts are kept concise.
- **DD-52** **Inference parameters are configurable**: temperature, max output tokens, and context
  length (num_ctx), per the selected model, with sensible defaults.
- **DD-53** **Assistant settings** live in dedicated Settings tabs: **AI / Providers** (provider, base
  URL, auth, model, params, the three Test buttons) and **AI Context** (estimator, safety margin, reply
  reserve, over-context strategy, history strategy, max tool iterations). (ADR-0010)
- **DD-54** **Privacy is explicit.** Document text leaves the machine **only** when the user invokes an
  action/chat and **only** to the configured provider. The Content & privacy settings state this
  plainly; telemetry/auto-update remain never (DD-33/DD-34). A local provider keeps everything on-device.
- **DD-55** **A run transcript** (messages + tool calls + applied edits) is available for the current
  session; persistent history of assistant runs is optional and, if added, stores snapshots locally only.

## 12. Drag-and-drop

Refines `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open`. Drag-and-drop opens files/folders;
it does not move, copy, or reorder anything on disk. It is a pre-assistant capability (it consumes the tab set and the folder
workspace) and adds **no network**.

- **DD-56** *(narrowed by DD-77 / ADR-0033: the app also creates files and folders in the workspace.)*
  The window accepts **drag-and-drop of files and folders**. A dropped **file** opens in a
  **new tab**, or in the **current tab if no document is open** (or the current tab is an empty, never-saved
  buffer). Dropping **multiple files** opens each in its own tab. Dropped documents open in the
  **default open mode** (DD-27). A dropped file of an **unsupported type** (not `.md`/`.markdown`/`.mdown`/`.txt`)
  is rejected with a toast and no tab is opened.
- **DD-57** A dropped **folder** opens as a **workspace** (filtered tree, DD-06). If **no folder is
  currently open**, it opens in the **current window**. If a folder **is already open**, the app
  **prompts**: **Open in this window** (replace the current workspace) or **Open in a new window** (a new
  instance opened on the dropped folder, per the multi-instance model DD-08 / ADR-0006). A **mixed** drop
  (files + folders) is resolved deterministically: files open as tabs; each folder runs the folder flow
  (prompt if a workspace is already open). Dropping **more than one folder** opens each via the folder
  flow (new windows), never silently discarding any.
- **DD-58** Drag-and-drop uses **Wails' native file-drop** (`options.App.DragAndDrop.EnableFileDrop` +
  `runtime.OnFileDrop`), which delivers **absolute filesystem paths** — **not** browser `File` objects
  (a webview's `DataTransfer` does not expose real paths). The Go side **`stat`s** each path to classify
  file vs folder and routes it through the **same open-target resolution used for OS file-association
  opens** (`internal/fileassoc`), so a dropped path and an OS-opened path behave identically. (ADR-0012)
- **DD-59** The **webview's default drop must be suppressed** so a drop never navigates the page to the
  file (a real hazard on Linux/WebKitGTK) — via the Wails drop configuration plus `preventDefault` on
  `dragover`/`drop`. A **drop-target overlay** gives visual feedback on drag-over. **Non-file drops**
  (selected text, a browser image/tab) are **ignored safely** (no crash, no action). Per-OS behaviour is
  verified on all three platforms.

## 13. Window & UI-layout state

Refines `02_Architecture/05_STATE_AND_PERSISTENCE.md#window-state` and `01_Product/11_SETTINGS.md#persistence`.
These decisions cover the **application-level** window/chrome layout, which is distinct from the
**per-document** view state of DD-10 (each tab's own arrangement, scroll, and cursor). Recorded in
`docs/adr/0013-window-ui-layout-state.md`.

- **DD-60** **Window & UI-layout state persists** across sessions and windows as *application-level*
  layout. This layout is part of the backend-owned application model (DD-62): the frontend toggles it by
  dispatching a **command**, and the backend updates the model, emits the change, and persists it. The
  persisted layout covers: the native **window size and maximized state**; **folder-sidebar**
  visibility (and width); the current **view arrangement** (Editor / Split / Preview) and individual
  **pane visibility**; and, once the assistant exists, the **assistant-sidebar** visibility (and width). State is written
  **through on every change** — a discrete toggle (show/hide a sidebar, switch arrangement) writes
  **immediately**; a continuous change (window resize) is **debounced** and then **flushed on close** — so
  the store always holds the **last value only**. There is **no history** and **no session/tab restore**
  (DD-11 still holds: documents open clean; only chrome layout is restored, not content). A **new window
  and each app launch restore the last saved layout** before the window is shown, falling back to defaults
  when a value is missing or invalid. Persistence reuses the settings KV store (DD-10), so no schema
  migration is required.
- **DD-61** **Multi-window layout is last-writer-wins by change time, not by close order.** Because every
  layout change is persisted the moment it happens (DD-60), the value in the store is always the one set by
  the window that **most recently changed** it. A window **never re-writes the whole layout on close** —
  closing only **flushes that window's own pending debounced write** (e.g. an in-progress resize) — so a
  window that closes later can **never clobber** a layout value another window changed more recently.
  Concurrent writes are safe on the shared WAL DB (DD-13); the last change committed wins.

## 14. Application state ownership

Refines `02_Architecture/01_SYSTEM_ARCHITECTURE.md`, `02_Architecture/02_BACKEND_GO.md#application-model`,
`02_Architecture/03_FRONTEND_REACT.md#state-ownership`, and
`02_Architecture/05_STATE_AND_PERSISTENCE.md#in-memory-application-model`. Recorded in
`docs/adr/0014-backend-authoritative-state.md`. The model is **MVC with the Go backend as the Model** and
the webview as the **View/Controller**.

- **DD-62** **The Go backend is the single source of truth for the entire live application model.** It
  owns, in Go memory (native data structures), the set of **open documents and their canonical content**,
  each document's dirty flag, encoding/line-ending, and per-document view state; the **tab set** (order +
  active tab); the **open workspace** (root + tree); and all **UI / layout / widget state** (sidebar
  visibility and width, view arrangement + pane visibility, assistant-sidebar visibility). There is
  **exactly one** source of truth; nothing is authoritative in the frontend. This gives Go ownership of the
  model's memory and lifecycle and eliminates dual-source drift. Backed by a dedicated `internal/appmodel`
  service (`02_Architecture/01_MODULE_INVENTORY.md`). It does not change the file-first rule
  (DD-11): documents on disk remain the persistence source of truth; `internal/appmodel` is the in-memory
  *working* model, and the app still opens clean.
- **DD-63** **The frontend is a thin view/controller — a projection of the backend model, never a store of
  truth.** The React/Redux store is a **derived, disposable projection**: hydrated from the backend by a
  query at startup / window-open and kept in sync by backend **`state:*` events**; every UI interaction is
  dispatched as a **command** to the backend, which mutates the authoritative model and emits the
  resulting change, and the frontend re-renders from it (unidirectional: command → model → event →
  projection → render). The frontend keeps **only ephemeral view scaffolding** in the webview /
  `localStorage` — the active editor's working buffer (DD-64), transient focus/scroll, dialog-open flags —
  **never a second source of truth**. Inactive documents' content is **not** retained in the webview; it
  lives only in Go, so webview memory stays bounded to what is on screen and Go manages the rest.
- **DD-64** **The active editor buffer is a debounced-synced working copy.** Monaco holds the *visible*
  document's editable text for responsiveness — an unavoidable property of an in-webview editor. Edits
  update the webview immediately and are **debounce-pushed** to the backend via an `UpdateBuffer` command;
  the backend model stays authoritative for content, dirty state, autosave, and save, and **every other
  consumer** (tab dirty indicator, status-bar counts, preview source, PDF export, the assistant)
  reads the backend's copy — never Monaco directly. The backend **never echoes buffer text back into the
  focused editor** (that would disturb the cursor/selection); it emits only derived state. On editor
  blur, tab switch, close, and save/autosave, the latest buffer is **flushed** to the backend before the
  action proceeds, so no edit is lost between debounce ticks.

## 15. Versioning, app icon & CI/CD

Refines `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md` and `04_Build_and_Release/03_CI_AND_HOOKS.md`.
Recorded in `docs/adr/0015-cicd-versioning-icon.md`. Owned by **Phase 08**.

- **DD-65** **The git tag is the single source of truth for the app version.** The version variable is
  `internal/settings.AppVersion`, whose compiled-in default is **`"dev"`**. A release build injects the
  real version via `wails build -ldflags "-X <module>/internal/settings.AppVersion=<version>"`, and CI
  additionally patches `wails.json`'s `version`/`info.productVersion` (with `jq`) so the Windows
  `info.json` and macOS `Info.plist` `{{.Info.ProductVersion}}` placeholders carry the same value. The
  version is computed **once** in CI from the pushed tag `v*.*.*` (or a manual `workflow_dispatch` input)
  and shared by all jobs. It is displayed in the **About dialog** and logged at startup. A build without
  the injection (local `wails build`, `wails dev`) therefore always reports **`dev`** — there is no
  hand-maintained version constant anywhere.
- **DD-66** **The app icon is the provided "MD>GO" glass-tile artwork**, stored as the canonical source at
  `specification/assets/icon/appicon-source.png`. It must be **processed before use** — the dark
  backdrop around the rounded glass tile is removed (transparent outside the tile's rounded-rect
  silhouette), the tile is cropped to its bounds, and the result is exported as a **1024×1024
  transparent-background `build/appicon.png`** (the deterministic pipeline lives at
  `specification/assets/icon/process_icon.py`). Wails/packaging derive the per-OS icons from it —
  macOS `.icns`, Windows `icon.ico` — and the same artwork seeds the **document/file-association icon**
  (DD-07, `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#2-app-icon-requirements`). One source
  asset; every platform icon is derived, never hand-forked.
- **DD-67** **CI and dev builds never touch production data.** All CI jobs (tests, verify gates, and the
  build matrix) run headless against **isolated state**: `wails dev` and dev builds use the `-Dev`
  config/DB/logs folder (`04_Build_and_Release/01_BUILD_MATRIX.md#7-dev-vs-prod-isdev-folder-isolation`),
  and CI test runs use temp paths — no job ever reads or writes a user's production `GoMarkEdit` folder.
  Only the **released artifact**, run by an end user, operates on production state. The release pipeline
  is a three-job shape: **determine-version → per-OS build matrix (+ full test-gate job) →
  create-release** (versioned artifact names, macOS `.app` re-zipped with permissions preserved,
  `SHA256SUMS.txt`, auto-detected pre-release on a `-suffix`).

## 16. Decisions from the 2026-07-25 review

Added after reviewing the specification against two shipped applications by the same author. Each of
these closed a hole, a contradiction, or a claim that could not be implemented as written. The
reasoning behind the larger ones is in ADR-0028 and ADR-0030…ADR-0034.

- **DD-68** **Notifications have two surfaces and one severity scale.** A notification is delivered as a
  **toast** (transient, stacked, dismissible) or **inline** (a banner attached to the surface it
  concerns — the blocked-remote-content banner, a read-only badge). It carries a severity, a title, a
  message, an optional action, and a **dedup key**: a repeat of a live notification refreshes the
  existing one and increments a count rather than stacking a second. There is a cap on how many toasts
  are visible at once. Durations are per severity. **Autosave never raises a success toast** — autosave
  is on by default, and a toast per write means a toast every few seconds while typing. Every
  `ErrorCode` has a written title and a remediation sentence in `en.json`, not a generic fallback.
  (`01_Product/20_NOTIFICATIONS_AND_EMPTY_STATES.md`)
- **DD-69** **One monochrome icon set, tinted from `currentColor`. No emoji in product UI.** A colour
  emoji is a bitmap: it cannot take a design token, and it renders differently — or not at all — on each
  platform. Shipping emoji as toolbar and menu glyphs is a standing violation of DD-30 and makes a
  cross-platform app look unfinished on two of three platforms.
- **DD-70** **Every unbounded input has a named limit, and a defined behaviour at the limit.** File size
  at which a document opens read-only; document size at which live preview pauses; maximum open tabs;
  maximum entries scanned when enumerating a folder; maximum search results; maximum lint markers. Each
  is a number with a unit, and each says what the user sees when it is reached. All of them live in one
  table (`03_NonFunctional/02_PERFORMANCE.md#hard-limits`); every other document cites it rather than
  restating a number. "Bounded" is not a specification.
- **DD-71** **Autosave never formats.** Format-on-save and lint-on-save run on an **explicit** save only.
  Autosave is on by default and debounced; running a formatter on it would reflow the document under the
  user's cursor every few seconds. This also means "what lands on disk is what you were shown" is true
  of explicit saves and, for autosaved files, true of the text but not of its formatting — which the
  format section states rather than implies.
- **DD-72** **Reading size and measure are user-controlled.** The preview and reading mode get their own
  font size and column width, independent of the editor's font size, with `Ctrl/Cmd +`, `Ctrl/Cmd -`
  and `Ctrl/Cmd 0`. Reading beautifully is a headline goal; a fixed column with no control is not it.
- **DD-73** **One command palette, over one registry.** `Ctrl/Cmd+Shift+P` opens a palette over the
  shortcut registry; `Ctrl/Cmd+P` is **quick-open by filename**. Export to PDF moves to
  `Ctrl/Cmd+Shift+E`. In an application with tabs, a file tree and Monaco, `Ctrl+P` is where people
  reach for quick-open; binding it to print is a browser convention in a desktop application.
- **DD-74** **Panes are draggable and their sizes persist.** The sidebar edge, the assistant edge and the
  editor/preview divider. `ui.sidebarWidth`, `ui.assistantWidth` and `ui.splitRatio` are persisted.
  Three width keys were already being stored with no way for a user to change any of them.
- **DD-75** **Every setting declares a type, a range and a default, and out-of-range values are
  rejected.** The range is stated once, in `01_Product/11_SETTINGS.md`; the control, the validator and
  the seeded default all cite that clause rather than carrying their own copy. Rejection names the
  acceptable range in the message (`apperr.Validation(field, expected, got)`) — it does not silently
  clamp, because a silently clamped value is one the user believes they set. **Reset to defaults** is a
  real action, per group and globally.
- **DD-76** **Document text is data, never instruction.** Everything the assistant reads — the open
  document, a selection, another workspace file returned by a tool — is untrusted content that may
  itself contain text shaped like an instruction. It is delimited explicitly in the prompt and framed as
  inert data, and the model is told so in the system prompt of every action. This applies to **tool
  observations** as much as to the primary input: a note containing "ignore your instructions and…" is a
  live injection vector the moment a workspace-read tool exists.
- **DD-77** **Workspace file operations are additive only.** The app creates files and folders in the
  workspace, reveals a path in the platform file manager, and copies a path. It **never renames, moves,
  deletes or reorders** anything on disk. After a create the app knows exactly what changed; after a
  rename or a delete it would have to reconcile an unknown amount of state with no filesystem watcher
  and no undo. (Narrows DD-56/DD-59; ADR-0033.)
- **DD-78** **Drop and paste insert a path; they never convert.** Dropping or pasting an **image**
  inserts a Markdown image link. A dropped file already on disk is linked by its path relative to the
  document — the app does not copy it. A clipboard **bitmap** has no path, so it is written next to the
  document and then linked; that is the only case in which drop or paste writes a file. Pasted **HTML or
  rich text** is inserted as its plain-text flavour, **unchanged** — the app does not guess at how the
  user wanted rich content converted to Markdown. The one exception is **unambiguously tabular text**
  (TSV or CSV, at least two rows with a consistent column count), which becomes a GFM table: that is
  what a spreadsheet or a database client puts on the clipboard, the shape is unmistakable rather than
  guessed at, and one undo returns the raw text.
