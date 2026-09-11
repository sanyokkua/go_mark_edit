# Architecture rules

`/plan-story` matches a story's file paths against each rule's `Applies to` globs and copies the
matching rules into the story verbatim. Nothing here is cited from a story; it is pasted into it.

`Enforced by` names a command that actually runs, or the word `review`. `review` is honest and useful —
it marks where the mechanical net has holes.

---

## The bridge

### A bound handler returns a result, never an error {#handler-returns-a-result}
**Applies to:** `internal/**/handler*.go`, `main.go`
**Enforced by:** `just archtest`

- Every method on a type passed to `Bind` in `main.go` returns exactly one value, and that value is an
  `apperr.*Result` struct — `VoidResult`, `StringResult`, `SettingsResult`, `StateResult`, or a new one
  added beside them in `internal/apperr/results.go`.
- **When** the operation succeeds, the result's `Data` field is set and `Error` is nil.
- **When** it fails, `Error` holds a `*apperr.WireError` and `Data` is left zero.

Examples: `GetSettings() (res apperr.SettingsResult)` → correct · `GetSettings() (apperr.Settings, error)`
→ rejected · `UpdateBuffer(id, content string) (res apperr.VoidResult)` → correct even though there is
nothing to return.

*Why:* Wails turns a returned Go `error` into a rejected JavaScript promise carrying only a string, so
the error code, the retryable flag and the safe details are all lost at the boundary. Returning a struct
keeps a failure typed on both sides.

*Do instead of:* returning `(T, error)` and unwrapping it in the adapter · returning `error` alone for a
command with no payload · panicking to signal a validation failure.

---

### A bound handler takes no context {#bound-handlers-take-no-context}
**Applies to:** `internal/**/handler*.go`
**Enforced by:** `just archtest`

- No parameter of a bound method has type `context.Context`.
- **When** a handler needs the lifecycle context, it calls its own `contextProvider` field, which
  `internal/application` supplies as `holder.Context`.

Examples: `func (h *AppModelHandler) GetState() (res apperr.StateResult)` → correct ·
`func (h *AppModelHandler) GetState(ctx context.Context) …` → rejected.

*Why:* Wails strips a leading `context.Context` parameter when it generates the TypeScript binding, so
the Go signature and the generated signature disagree, and `guardArity` then rejects every call to that
method at runtime with an argument-count mismatch.

*Do instead of:* accepting `ctx` "for symmetry with the service" · defaulting to `context.Background()`
inside the handler, which loses cancellation on shutdown.

---

### A panic inside a bound method becomes an internal error {#panic-becomes-internal-error}
**Applies to:** `internal/**/handler*.go`
**Enforced by:** `just archtest`

- Every bound method uses a **named** result — `(res apperr.XxxResult)` — and its first statement is a
  `defer func() { if recovered := recover(); recovered != nil { … } }()`.
- **If** the deferred function recovers a panic, **then** it assigns `res` a result whose `Error` is
  `apperr.ToWire(logger, apperr.Internal(fmt.Errorf("panic: %v", recovered)))`.

Examples: a nil map write deep in a service → the user sees the internal-error message and the app keeps
running · the same panic without the recover → the Go process dies and the window disappears with no
explanation.

*Why:* a panic on a bound method's goroutine kills the whole process, and the user loses every unsaved
document in every window. The recover converts a crash into one failed operation.

*Do instead of:* recovering in the service instead of the handler, which leaves any new caller
unprotected · using an unnamed return, where assigning inside the deferred function has no effect.

---

### `internal/apperr` imports nothing else under `internal/` {#apperr-imports-nothing-internal}
**Applies to:** `internal/apperr/**`
**Enforced by:** `just archtest` → `TestArchitectureApperrHasNoInternalDependencies`

- No file in `internal/apperr` imports a path beginning `github.com/sanyokkua/go_mark_edit/internal/`.

Examples: importing `internal/logging` to log inside a constructor → rejected; take a `zerolog.Logger`
as a parameter instead, which is what `ToWire` already does.

*Why:* every other package imports `apperr`, so a single import back the other way makes the graph
cyclic and Go refuses to build it. Catching it with a test names the cause; catching it with the
compiler names a cycle spanning six packages.

*Do instead of:* putting a shared helper in `apperr` because it is convenient and everything can see it.

---

### The error cause never crosses the bridge {#cause-stays-local}
**Applies to:** `internal/apperr/**`, `internal/**/handler*.go`
**Enforced by:** review

- `AppError`'s `cause` field stays unexported and has no JSON tag, so it cannot be serialised.
- `apperr.ToWire` is the only place a full error chain is logged. Everywhere else returns the error
  upward without logging it.
- **If** an error carries `Details`, **then** every value in that map is safe to show a user: a file's
  base name, an environment-variable *name*, a field name. Never a token, an API key, a full remote URL,
  or a user's home path.

Examples: `apperr.IO("save", err)` where `err` is `open /Users/ana/secret.md: permission denied` → the
user sees the IO message, the log holds the full chain, the bridge carries neither the path nor the
cause.

*Why:* a serialised cause chain is how absolute paths and credentials end up in a screenshot of an error
dialog. Logging in one place is also what stops the same failure appearing four times in the log file.

*Do instead of:* adding a `cause` JSON field "for debugging" · logging at both the service and the
handler.

---

### Every error code is in the enum binding {#error-codes-are-enum-bound}
**Applies to:** `internal/apperr/apperr.go`, `main.go`
**Enforced by:** `just gen-check`

- **When** a new `ErrorCode` constant is added, it also gets an entry in `apperr.AllErrorCodes` with its
  TypeScript member name, and `just gen` is re-run.

Examples: adding `CodeConflict ErrorCode = "conflict"` without the `AllErrorCodes` row → the frontend's
generated enum has no `Conflict` member, and the comparison against it silently never matches.

*Why:* the enum is generated from that slice, not from the constants, so a missing row produces
TypeScript that compiles and is wrong.

*Do instead of:* comparing raw strings on the frontend to avoid the regeneration step.

---

## Wiring and layering

### Every layer is one hop {#one-hop-per-layer}
**Applies to:** `internal/**/*.go`
**Enforced by:** review

- A handler calls its own service and nothing else.
- A service calls its repository, the OS, or another service's interface.
- A handler never touches a repository, a `*sql.DB`, or the filesystem directly.
- A service keeps `(T, error)` signatures and takes `ctx context.Context` as its first parameter.

Examples: `SettingsHandler.GetSettings` → `SettingsService.Get(ctx)` → `SettingsRepositoryAPI.Load(ctx)`
→ correct · `SettingsHandler` calling `store.Queries.GetSetting` → rejected.

*Why:* the envelope, the panic recovery and the logging all live at the handler boundary. A call that
skips the service skips them too, so the failure mode is not a layering complaint — it is an unrecovered
panic and an unlogged error.

*Do instead of:* a handler reaching for the database "because the service would just pass it through".

---

### All wiring lives in one composition root {#one-composition-root}
**Applies to:** `internal/**/*.go`, `main.go`
**Enforced by:** `just archtest`

- Concrete services, handlers and repositories are constructed only in
  `internal/application/application_context_holder.go` and `main.go`.
- The constructor builds the whole graph with **nil** repositories.
  `Init(ctx)` opens the database and injects the real ones through setters such as
  `SettingsService.SetRepository`.
- No package holds a package-level singleton of another package's type, and nothing calls
  `db.Open` outside `Init`.

Examples: `settings.NewSettingsService(nil)` in the constructor, then
`SetRepository(settings.NewSqliteSettingsRepository(database))` in `Init` → correct · a service calling
`db.Open` on first use → rejected.

*Why:* the database cannot open until Wails has supplied the startup context, but the handlers must
exist before that so they can be passed to `Bind`. Two phases is what resolves that ordering, and
keeping it in one file is what makes the whole graph readable at once.

*Do instead of:* a `sync.Once` lazy initialiser inside a service · a global `var DB *sql.DB` · building a
service inside the handler that uses it.

---

### An interface is owned by the package that defines its type {#interfaces-live-with-their-type}
**Applies to:** `internal/**/*.go`
**Enforced by:** review

- The interface a consumer depends on is declared in the package that owns the concrete type, or in the
  consuming package if it is narrower than the whole type.
- There is no shared `interfaces.go`.

Examples: `SettingsRepositoryAPI` in `internal/settings` · `AppModelServiceAPI` declared in
`internal/appmodel` next to the handler that consumes it.

*Why:* a shared interface file is imported by everything, so every change to any interface recompiles
and re-tests everything, and the file grows into a place where unrelated things are declared together.

*Do instead of:* an `internal/contracts` package.

---

## Persistence

### The generated store is never hand-edited {#generated-store-is-not-edited}
**Applies to:** `internal/db/store/**`
**Enforced by:** `just sqlc-check`

- `internal/db/store/` is written by `sqlc generate` from `internal/db/queries/*.sql` and
  `internal/db/migrations/*.sql`, as configured in `sqlc.yaml`.
- **When** a query changes, the `.sql` file changes and `sqlc generate` is re-run; the generated files
  are committed as part of the same change.

Examples: adding a `WHERE` clause by editing `settings.sql.go` → overwritten by the next generate, and
`just sqlc-check` fails before that.

*Why:* the generated file is build output. An edit there is lost silently on the next regeneration,
usually on someone else's machine, and the bug appears far from the change.

*Do instead of:* patching the generated Go because the SQL is awkward to express.

---

### Migrations only add {#migrations-only-add}
**Applies to:** `internal/db/migrations/**`
**Enforced by:** `just archtest`

- A migration file adds a table, a column, or an index. It contains no `DROP`, no
  `ALTER TABLE … DROP`, no `UPDATE` and no `DELETE`.
- An existing migration file is never modified after it has been committed; a correction is a new
  numbered file.
- A new column is nullable or carries a `DEFAULT`, so an existing row remains valid.

Examples: `0002_providers.sql` creating a new table → correct · editing `0001_settings.sql` to widen a
column → rejected, because every machine that already ran `0001` will never run it again.

*Why:* several copies of GoMarkEdit share one database file, and a user's copy may be several versions
behind. A destructive or retroactively-edited migration corrupts a database that a previous version is
still reading.

*Do instead of:* renaming a column in place · backfilling data inside a migration · "fixing" an already
released migration file.

---

### Small preferences use the existing key/value table {#preferences-use-the-kv-table}
**Applies to:** `internal/settings/**`, `internal/db/migrations/**`
**Enforced by:** review

- A scalar preference — a theme name, a boolean, a window width — is a row in the existing
  `settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, type TEXT NOT NULL)` table, read through a typed
  getter with an explicit default.
- **If** a preference needs a new table, **then** it is because it is a list of records with their own
  identity, such as the provider profiles.

Examples: `appearance.theme` → a KV row, no migration · the `providers` list → a real table and an
additive migration.

*Why:* a migration per preference means a migration per settings story, and every one of them is a
schema change that can only ever be added to.

*Do instead of:* a one-column table per settings group.

---

### The database opens in WAL mode with a busy timeout {#sqlite-is-multi-process-safe}
**Applies to:** `internal/db/**`
**Enforced by:** review

- The connection string sets `_pragma=journal_mode(WAL)` and `_pragma=busy_timeout(5000)`.
- `SetMaxOpenConns(1)` is set on the pool, so this process has a single writer.

Examples: two GoMarkEdit windows both saving a preference at the same moment → the second waits up to 5
seconds and succeeds · without the busy timeout → `database is locked`, surfaced to the user as a
settings failure they cannot act on.

*Why:* multiple instances are a product requirement, so two processes genuinely do write the same file.

*Do instead of:* serialising with a lock file · giving each instance its own database.

---

### Nothing locks the app to one instance {#no-single-instance-lock}
**Applies to:** `main.go`, `internal/**/*.go`
**Enforced by:** `just archtest` → `TestArchitectureNoSingleInstanceOrNetworkPath`

- No file imports `flock`, `lockfile`, or a single-instance package, and no code calls `syscall.Flock`
  or opens a lock file with `os.O_EXCL`.
- Wails' `SingleInstanceLock` option is not set.

Examples: a second launch while one window is open → a second window, both usable · a lock →
an "already running" dialog, which this product does not have.

*Why:* the user opens two files side by side by opening the app twice. Adding a lock removes a
capability people rely on and it is not visible in any test that runs one process.

*Do instead of:* adding a lock to "protect" the shared database — WAL and the busy timeout already do
that.

---

## The model and the projection

### Documents have an identity and a content accessor {#documents-have-identity}
**Applies to:** `internal/appmodel/**`
**Enforced by:** `just archtest`

- An open document is a struct with a stable `DocumentID` distinct from its path, and its text is
  reached through an accessor on the model — never by passing the string around.
- **When** a document is saved under a new name, its `DocumentID` does not change.

Examples: an untitled document that is later saved keeps the id its tab was opened with, so the tab does
not blink out and back · using the path as the id → an untitled document has no id, and two documents
saved to the same path collide.

*Why:* every later feature — tabs, the assistant's read tool, the diff view — addresses a document by
id. A path is not an identity: it is empty before the first save and it changes after Save As.

*Do instead of:* keying tabs by file path · passing document text as a bare `string` between services.

---

### The Redux store is a projection, not a source {#store-is-a-projection}
**Applies to:** `frontend/src/logic/store/**`, `frontend/src/logic/adapter/**`
**Enforced by:** review

- The store is hydrated once from `GetState()` and thereafter changes only by applying a `state:patch`
  event or by recording purely local view scaffolding such as a dialog-open flag.
- **When** the user does something that changes the model, the UI dispatches a command to Go and waits
  for the resulting patch. It does not write the new value into the store first.
- No slice holds document text. Slices hold metadata: id, title, path, dirty, encoding, line ending,
  counts, view state.

Examples: closing a tab → `CloseTab` command → `state:patch` removes it → the tab bar re-renders · a
reducer removing the tab immediately → the tab vanishes even when the close was refused because the
document is dirty.

*Why:* two sources of truth for the same fact will disagree, and the disagreement shows up as a UI that
claims something the backend did not do. Optimistic updates are the specific way that happens here.

*Do instead of:* an optimistic reducer with a rollback on rejection · caching document text in a slice
"to avoid a round trip".

---

### The backend never echoes buffer text into the focused editor {#no-buffer-echo}
**Applies to:** `internal/appmodel/**`, `frontend/src/logic/hooks/**`
**Enforced by:** review

- A `state:patch` carries derived state — dirty, word count, encoding — and never the document's text.
- The visible Monaco buffer is pushed to Go by `UpdateBuffer` on a debounce, and flushed before saving,
  on blur, on tab switch and on close.

Examples: typing for ten seconds → several debounced `UpdateBuffer` calls, no patch containing text, the
caret never moves · a patch that reset the editor's value → the caret jumps to the start mid-sentence.

*Why:* setting a Monaco model's value resets the selection and the caret and discards the undo stack.
There is no way to do it invisibly while someone is typing.

*Do instead of:* a full-state patch that includes content · re-rendering the editor from the store on
every keystroke.

---

### One seam reads and mutates document content {#one-document-seam}
**Applies to:** `frontend/src/logic/hooks/**`, `frontend/src/ui/widgets/**`
**Enforced by:** review

- Document text and selection are read and changed through the document-command seam
  (`logic/hooks/useDocumentCommands`), not by reaching into the Monaco instance from a component.
- The seam's operations are the stable surface: read content, read selection, replace a range, replace
  all.

Examples: the Format button, and later the assistant applying a proposed edit, both call `replaceAll`
through the same seam · a toolbar button calling `editorRef.current.getModel().setValue(…)` → rejected.

*Why:* the assistant applies edits through exactly these operations. If a feature reaches past the seam,
the assistant either cannot reuse it or has to be given its own path into the editor, which is a second
way to change a document and a second set of bugs.

*Do instead of:* passing a Monaco ref down through props · a component-level `onChange` that mutates
state directly.

---

## The frontend

### Only the adapter imports `wailsjs/` {#only-the-adapter-imports-wailsjs}
**Applies to:** `frontend/src/**`
**Enforced by:** `just archtest` (ESLint `no-restricted-imports`)

- Files under `frontend/src/logic/adapter/` may import from `wailsjs/`. No other file may — not a
  component, a widget, a slice, a thunk, a hook, or a utility.
- Each generated binding is wrapped once, in `guardArity(name, bound)`, and exposed as a method on an
  adapter singleton.

Examples: `import { GetState } from '../../wailsjs/go/appmodel/AppModelHandler'` inside `EditorView.tsx`
→ rejected by lint · the same import inside `logic/adapter/services.ts` → correct.

*Why:* `wailsjs/` is generated and its shape changes with every backend signature change. One wrapping
layer means a signature change has one place to fix, and it is also the only seam the tests can mock —
a component that imports the binding directly cannot be tested without a running Go process.

*Do instead of:* importing a binding directly "just for one call" · mocking `wailsjs/` in a test.

---

### A generated binding is always called through `guardArity` {#guard-arity}
**Applies to:** `frontend/src/logic/adapter/**`
**Enforced by:** review

- **When** an adapter method calls a generated binding, it calls it through `guardArity`, which rejects
  with a clear error when the argument count does not match.

Examples: calling a two-argument binding with one argument through `guardArity` → an immediate rejection
naming the method · the same call unguarded → the promise never settles and the UI waits forever.

*Why:* Wails v2 sends no response frame at all when the argument count is wrong, so the promise neither
resolves nor rejects. The symptom is a frozen feature with nothing in any log.

*Do instead of:* trusting the generated types, which are regenerated from Go and can be stale in a
working tree.

---

### The envelope is unwrapped in one place {#unwrap-in-one-place}
**Applies to:** `frontend/src/logic/**`
**Enforced by:** review

- `unwrap(result)` is the only code that inspects an `apperr.*Result`. It raises the error's toast and
  throws; callers get the payload or an exception.

Examples: `const state = unwrap(await appModel.GetState())` → correct · `if (res.error) { … }` at a call
site → rejected, because the next call site will handle it differently.

*Why:* the error message a user sees should not depend on which call produced it.

*Do instead of:* per-call-site error branches · swallowing `res.error` and returning `undefined`.

---

### No colour outside a token {#no-colour-outside-a-token}
**Applies to:** `frontend/src/ui/**`
**Enforced by:** `just archtest` (colour-literal scan)

- No hex colour, `rgb()`, `rgba()`, `hsl()` or CSS colour keyword appears anywhere under
  `frontend/src/ui/` except in `frontend/src/ui/styles/tokens.css`.
- A component reads `var(--token-name)`. A new visual value is a new token first.

Examples: `border: 1px solid var(--editor-pane-border-color)` → correct · `color: #16201e` in a module
CSS file → rejected · `background: white` in a `.tsx` inline style → rejected.

*Why:* there are three themes and each has a light and a dark appearance — six combinations. A literal
colour is correct in at most one of them, and it is invisible in the other five until someone switches.

*Do instead of:* a literal "just for the disabled state" · a colour in an inline `style` prop.

---

### The theme is set on the document element only {#theme-on-the-root-element}
**Applies to:** `frontend/src/logic/theme/**`, `frontend/src/ui/**`
**Enforced by:** review

- `data-theme` and `data-mode` are set on `document.documentElement` and nowhere else.
- `data-mode` is always the resolved value `light` or `dark`. The literal `auto` never reaches the DOM.

Examples: a dropdown rendered through a Radix portal inherits the theme because it is inside the same
document element · setting `data-theme` on the app shell instead → every portal renders unthemed.

*Why:* Radix renders overlays into a portal at the end of `<body>`, outside the React tree. Only an
attribute on the root element covers them.

*Do instead of:* wrapping the app in a themed div · passing the theme down as a prop to style each
component.

---

### Every user-visible string goes through `t()` {#strings-go-through-t}
**Applies to:** `frontend/src/**`
**Enforced by:** `just archtest` (ESLint), review

- Text a user reads is a key in `frontend/src/i18n/locales/en.json`, rendered with `t('key')`.
- This includes button labels, headings, placeholder text, empty-state copy, error messages, tooltips,
  and accessible labels.

Examples: `t('editor.emptyState.title')` → correct · `<button>Save</button>` → rejected ·
`aria-label="Close tab"` → rejected, `aria-label={t('tabs.close')}` → correct.

*Why:* a hard-coded string is invisible to translation and, more immediately, invisible to review — the
catalogue is where all the product's copy can be read and made consistent in one sitting.

*Do instead of:* a literal "because it is only a placeholder" · a template literal assembling a sentence
from fragments, which cannot be translated as one.

---

### Presentational components take props, not the store {#components-take-props}
**Applies to:** `frontend/src/ui/components/**`, `frontend/src/ui/primitives/**`
**Enforced by:** review

- Nothing under `ui/components/` or `ui/primitives/` imports `logic/store` or `logic/adapter`.
- Data and callbacks arrive as props. Wiring happens in `ui/widgets/`.

Examples: `StatusBar` takes `{ wordCount, lineEnding, encoding }` → correct · `StatusBar` calling
`useSelector` → rejected.

*Why:* a component that selects from the store needs a real store in every test that renders it, and it
cannot be reused in a second context with a different source of data.

*Do instead of:* `useSelector` inside a leaf component to avoid prop-drilling through one level.

---

### The shell reserves three regions {#shell-reserves-three-regions}
**Applies to:** `frontend/src/ui/widgets/**`, `frontend/src/ui/styles/**`
**Enforced by:** review

- `AppShell` lays out a left region (the file tree), a centre region (the document area) and a right
  region (the assistant), and the right region's grid slot, width token and show/hide plumbing exist
  even while nothing renders into it.
- **While** the assistant does not exist, the right region has width `var(--shell-assistant-collapsed-width)`,
  which is `0`.

Examples: opening the assistant later sets one token and mounts one child → correct · adding a third
column to the grid when the assistant is built → rejected, because every layout test and every width
breakpoint written before then has to be redone.

*Why:* changing the shell's structure late invalidates the responsive verification of every screen built
on top of it.

*Do instead of:* a two-column layout with the intention of "adding a column when we get there".

---

## Cross-cutting

### The build is CGO-free {#build-is-cgo-free}
**Applies to:** `go.mod`, `internal/**/*.go`, `main.go`
**Enforced by:** `just archtest` (`CGO_ENABLED=0 go build ./...`)

- No Go file contains `import "C"`, and no dependency requires a C toolchain.
- SQLite is `modernc.org/sqlite`, which is a pure-Go translation of the C source.

Examples: `CGO_ENABLED=0 go build ./...` succeeds → correct · adding `mattn/go-sqlite3` → the same
command fails, and cross-compiling from macOS to Windows stops working.

*Why:* the release builds every platform from one runner. A CGO dependency means a cross-compiler per
target, and it is discovered at release time rather than at commit time.

*Do instead of:* a CGO driver because it benchmarks faster.

---

### The app makes no background network call {#no-background-network}
**Applies to:** `**`
**Enforced by:** `just archtest`, review

- The app makes **no** unsolicited outbound request: no update check, no telemetry, no crash report, no
  font, plugin or theme fetch, no CDN asset.
- Before the assistant phases exist, the app makes no outbound request at all.
- **When** the assistant exists, the only outbound requests are inferences to the provider the user
  configured, and only in direct response to the user invoking an action or sending a message. The
  default provider is a local one, so a default install still talks to nothing off the machine.
- Remote images and stylesheets referenced *inside a user's document* are a separate matter: the user
  chooses Ask, Always allow or Always block, and this rule does not cover them.

Examples: launching the app with a network monitor open and using it for five minutes → zero requests ·
a `<link>` to Google Fonts in `index.html` → rejected · `fetch('https://api.github.com/…')` to check for
a new version → rejected.

*Why:* people write private things in a text editor. "It only sends a version number" is a promise the
user cannot verify, so the product's answer is that there is nothing to verify.

*Do instead of:* an opt-out update check · loading KaTeX or Mermaid from a CDN instead of bundling it ·
a "anonymous usage statistics" toggle.

---

### Rendered HTML is always sanitised {#rendered-html-is-sanitised}
**Applies to:** `frontend/src/logic/markdown/**`, `frontend/src/ui/components/**`
**Enforced by:** review

- `rehype-sanitize` is in the rehype plugin list for every Markdown standard level, and it runs last.
- `dangerouslySetInnerHTML` is used only for SVG that Mermaid produced and that has already passed
  through the sanitiser.

Examples: a document containing `<img src=x onerror="…">` → the attribute is stripped and the image
renders inert · removing the sanitiser to make a plugin's output render → rejected.

*Why:* the preview renders a file that arrived from somewhere else, inside a webview that can call the
Go backend. Unsanitised HTML in that position is remote code execution against the user's machine.

*Do instead of:* trusting the plugin set's output · widening the schema until the symptom disappears
instead of allowing the specific element the pipeline emits.

---

### Logs stay local and carry no secrets {#logs-stay-local}
**Applies to:** `internal/**/*.go`
**Enforced by:** review

- Logs go to a rotating file in the directory `internal/file` resolves, and to the console in
  development. There is no network sink.
- No log field contains an API key, a token, a full remote URL, or a user's full home path. Log a file's
  base name when the full path is not needed.
- `Fatal` logs and returns; it does not call `os.Exit`. The decision to exit belongs to the caller, which
  shows the dialog first.

Examples: `log.Error().Str("code", "io").Str("file", "notes.md").Err(err).Msg("save failed")` → correct ·
including `/Users/ana/Documents/notes.md` when only the name is needed → rejected.

*Why:* a log file is the thing a user attaches to a bug report, and they cannot review what they cannot
see. `os.Exit` inside `Fatal` also skips every deferred close, including the database.

*Do instead of:* `fmt.Sprintf` message building · `log.Fatal()` from Go's standard library.

---

### One long operation at a time, through the gate {#one-long-operation-at-a-time}
**Applies to:** `internal/gate/**`, `internal/export/**`, `internal/llm/**`
**Enforced by:** review

- A long operation — exporting, formatting a whole folder, running an inference — acquires
  `internal/gate` before starting and releases it in a `defer`.
- **If** the gate is already held, **then** the operation is refused immediately with `apperr.Busy()`;
  it does not queue and it does not wait.
- The gate is generic. There is one gate, shared by every kind of long operation, not one per feature.

Examples: an export running while the user invokes an assistant action → the action returns busy at once
and the UI says so · a second gate for inference → two operations run at once and compete for the same
memory, which is what the gate exists to prevent.

*Why:* these operations are memory-hungry and the process is also holding every open document. Refusing
immediately is honest; queuing means an action appears to hang.

*Do instead of:* a per-feature mutex · a queue with no visible depth.

---

### Bindings are committed without drift {#bindings-have-no-drift}
**Applies to:** `frontend/wailsjs/**`, `internal/**/handler*.go`, `main.go`
**Enforced by:** `just gen-check`

- **When** a bound method's name, parameters or return type changes, `just gen` is run and the
  regenerated files under `frontend/wailsjs/` are committed in the same change.

Examples: renaming `SetDocView` without regenerating → the adapter calls a method that no longer exists,
`guardArity` rejects, and the feature fails only at runtime.

*Why:* the generated bindings are committed so the frontend type-checks without a Go toolchain. That is
only true while they match.

*Do instead of:* regenerating "later" · editing `frontend/wailsjs/` by hand to match.

---

### Format and lint are callable functions {#format-and-lint-are-functions}
**Applies to:** `frontend/src/logic/format/**`, `frontend/src/logic/lint/**`
**Enforced by:** review

- Formatting and linting are exported pure functions taking text and options and returning text or
  findings. The toolbar button and the on-save path both call the same function.

Examples: `format(text, options): string` → correct · a `handleFormatClick` that reads the editor,
transforms and writes back → rejected, because nothing else can reuse it.

*Why:* format-on-save, the folder-wide format, and re-formatting after the assistant applies an edit are
three callers of one function. If the logic lives in a click handler there is nothing to call.

*Do instead of:* a React hook that only works inside a component · logic embedded in an event handler.

---

### The diff view has two consumers {#diff-view-has-two-consumers}
**Applies to:** `frontend/src/ui/components/**`
**Enforced by:** review

- The diff view is a standalone component taking a before string and an after string. The format preview
  and the assistant's edit proposal both render it.

Examples: `<DiffView before={original} after={formatted} />` used by both → correct · a diff rendered
inside the assistant's proposal card → rejected, because the format preview then needs a second one.

*Why:* two diff renderers disagree about what a change looks like, and the user notices.

*Do instead of:* building the diff inline in whichever feature needs it first.

---

### A test proves behaviour, not a document {#tests-prove-behaviour}
**Applies to:** `internal/**/*_test.go`, `main_test.go`, `frontend/src/**/*.test.ts`, `frontend/src/**/*.test.tsx`
**Enforced by:** review

- A test asserts a user-visible outcome or a returned value. It does not assert on the contents of a
  Markdown file, the `justfile`, a CI workflow, or anything under `.claude/`.
- The only permitted source-scanning tests are the architecture invariants in this file, which cannot be
  checked any other way.
- The component under test is rendered, not mocked. Collaborators are mocked at `logic/adapter`, never at
  `wailsjs/`.
- Frontend queries are by accessible role, label or text — not by class name or test id.
- Go tests run under `-race` and use fakes satisfying the package's own interface, not a real database.

Examples: `expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()` → correct ·
`jest.mock('./AppShell')` inside `AppShell.test.tsx` → rejected, and this mistake is live in the
repository today · a Go test asserting a phase document contains a heading → rejected.

*Why:* a test that reads a document passes while the software is broken, and roughly 4,200 lines of
exactly that were deleted from this repository on 2026-07-25. A mocked subject asserts that the mock
works.

*Do instead of:* asserting a function was called · snapshotting a large DOM tree as the primary
assertion · deleting a failing test to make the suite green.
