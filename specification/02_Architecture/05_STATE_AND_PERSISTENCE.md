**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `02_Architecture/02_BACKEND_GO.md`, `01_Product/03_FILES_TABS_WORKSPACE.md`, `01_Product/11_SETTINGS.md`, `02_Architecture/01_MODULE_INVENTORY.md`, `08_Decisions/ADR-0004`, `08_Decisions/ADR-0006`

# State and Persistence

What GoMarkEdit remembers between sessions, where it lives, and how multiple instances share it safely.
The design is file-first: documents are the source of truth on disk; the **live application model** is
owned in Go memory by `internal/appmodel` (DD-62; `#in-memory-application-model`); and the SQLite store
holds only the **durable subset** — preferences and lightweight navigation state (DD-10, DD-11).

## Table of Contents

1. File-first
2. In-memory application model
3. KV schema
4. Migrations
5. Recent
6. Window state
7. Multi-instance DB

## File-first

Documents live on the file system, not in a database. The app opens **clean** on launch — there is no
automatic session restore, no crash recovery, and no swap files (DD-11). The user returns to prior work
explicitly via File → Open Recent or "Reopen last file/folder". Autosave persists **existing** files
(default on, toggleable); a new, never-saved buffer is never silently written and requires an explicit
Save/Save-As (DD-12). Consequently the SQLite store never holds document content — only paths,
preferences, and small view state.

Config/DB/logs locations (via `internal/file`, with a `-Dev` suffix under `wails dev` so a dev session
never touches production data):

| Platform | Folder |
|---|---|
| macOS | `~/Library/Application Support/GoMarkEdit` |
| Linux | `~/.config/GoMarkEdit` |
| Windows | `%APPDATA%\GoMarkEdit` |

## In-memory application model

Between "documents on disk" and "the SQLite store" sits a third tier: the **live application model**,
owned in Go memory by `internal/appmodel` and the single source of truth while the app runs (DD-62;
`02_BACKEND_GO.md#application-model`). It holds the open documents **and their canonical content**, the
tab set + active tab, the open workspace reference, and the UI/layout state. The frontend never owns this
— it renders a projection and drives it with commands (DD-63; `03_FRONTEND_REACT.md#state-ownership`).

Two properties matter for persistence:

- **Most of the model is intentionally *not* persisted.** Consistent with file-first (DD-11), the app
  opens clean: the model starts empty, with no session/tab restore and no document content in the DB.
  Only the **durable subset** is written to SQLite — settings, recent files/folders, and window/UI-layout
  state (DD-10, DD-60/DD-61) — as a projection *out* of the model, via the settings/recent repositories.
- **Document content lives only in Go memory** (the `appmodel` buffers) and on disk, never in the DB and
  never (for inactive tabs) in the webview — this is the memory-ownership win of DD-62/DD-63
  (`07_LARGE_FILES_AND_CONCURRENCY.md#large-file-strategy`).

Mutations flow through `appmodel` commands, which update the model, persist the durable subset where
applicable, and emit `state:*` events; the DB is therefore touched only for the small, infrequent durable
writes described below, never on every keystroke.

## KV schema

State is a small SQLite key-value store (ADR-0004). A generic
`settings(key, value, type)` table backs all preferences, so a new scalar preference needs **no
migration** — only a new dotted key:

```sql
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type  TEXT NOT NULL   -- 'string' | 'int' | 'float' | 'bool'
);
```

Representative keys (authoritative list in `01_Product/11_SETTINGS.md` `#persistence`):

| Key prefix | Examples | Notes |
|---|---|---|
| `appearance.*` | `appearance.theme` (`liquid-glass`/`material`/`minimal`), `appearance.mode` (`auto`/`light`/`dark`) | DD-28, DD-29 |
| `editor.*` | `editor.autosave` (bool, default true), `editor.wordWrap`, `editor.minimap`, `editor.pauseLivePreview` | DD-12, DD-20 |
| `markdown.*` | `markdown.standard` (`minimal`/`gfm`/`full`) | DD-14 |
| `format.*` / `lint.*` | `format.onSave`, `lint.onSave` | DD-18 |
| `export.*` | `export.pdfStyle` (`theme`/`clean`) | DD-24 |
| `content.*` | `content.remotePolicy` (`ask`/`allow`/`block`) | DD-22 |
| `view.*` | `view.defaultOpenMode` (`editor`/`viewer`, default `editor`) | DD-27 |
| `lang.*` | `lang.locale` (`en`) | DD-35 |
| `window.*` | `window.width`, `window.height`, `window.maximized` | window geometry; see `#window-state` (DD-60) |
| `ui.*` | `ui.sidebarVisible`, `ui.sidebarWidth`, `ui.viewArrangement` (`editor`/`split`/`preview`), `ui.editorPaneVisible`, `ui.previewPaneVisible`, `ui.assistantVisible`, `ui.assistantWidth` (Stage 3) | application-level UI-layout state; see `#window-state` (DD-60/DD-61) |

Repository accessors are typed `Get*Config`/`Update*Config` groups built on
`getBool/getInt/getFloat/getString` + `UpsertSetting`. Reads and writes go through the settings
service; handlers wrap them in `*Result` envelopes.

## Migrations

Schema evolves through **goose** migrations under `internal/db/migrations/*.sql`, applied on `db.Open`.
Migrations are **additive-only**: a new nullable column, a new table, or a new index — never an
`UPDATE`/backfill/rewrite of existing rows, and never a modification of a shipped migration file. The
sqlc-generated `internal/db/store/` is regenerated by `sqlc generate` and is **never hand-edited**. All
queries are parameterized (sqlc), so there is no string-built SQL (`03_NonFunctional/03_SECURITY_AND_PRIVACY.md`).
Because most preferences use the generic KV table, migrations are rare — reserved for genuinely new
relational tables (e.g. the recent-items table).

## Recent

`internal/recent` keeps a bounded most-recently-used list of files and folders (DD-10). Contract:

- **MRU ordering** — opening an item moves it to the front; the list is capped (older entries drop off).
- **Prune-missing** — an entry whose path no longer exists is removed lazily on next read, so
  "Open Recent" never offers a dead path (edge case `EC-DOCS-*`/`EC-WS-*`).
- **"Reopen last"** — the most recent file and the most recent folder are individually recoverable,
  backing the "reopen last file/folder" action (DD-11).

```go
type RecentService interface {
    List(ctx context.Context) (RecentItems, error)     // {Files []RecentEntry; Folders []RecentEntry}
    Add(ctx context.Context, kind Kind, path string) error
    Last(ctx context.Context, kind Kind) (RecentEntry, error)
    Clear(ctx context.Context) error
}
```

## Window state

The native window's size and maximized state, plus the **application-level UI-layout state**, persist so
each window reopens the way the user left it (DD-10, DD-60). This layout state comprises: window size +
maximized; **folder-sidebar** visibility and width; the **view arrangement** (Editor / Split / Preview)
and individual **pane visibility**; and, in Stage 3, the **assistant-sidebar** visibility and width. It is
*application-level* — shared across windows and distinct from the *per-document* view mode below.

**Write-through on change.** Every layout mutation persists the moment it happens: a discrete toggle
(show/hide a sidebar, switch arrangement) writes **immediately** through the settings service; a
continuous change (window resize) is **debounced** and then **flushed on window/app close**. The store
therefore always holds the **last value only** — there is no history and no session/tab restore (DD-11).
Writes go through the `ui.*`/`window.*` keys (`#kv-schema`), so no migration is needed.

**Restore on open.** A new window and each app launch **read the last saved layout** and apply it before
the window is shown — the folder sidebar, arrangement, and window geometry are restored by an
`Init(ctx)` `restoreWindowState` step, falling back to `options.App` / sensible defaults when a value is
missing or invalid (EC-SET-5, EC-SET-7).

**Multi-window (last-writer-wins by change, not by close).** Because each change is written immediately,
the value in the store is always the one set by the window that **most recently changed** it. A window
**never re-writes the whole layout on close** — closing only flushes that window's own pending debounced
write — so a later-closing window can **never clobber** a value another window changed more recently
(DD-61, EC-SET-6). Concurrent writes are safe on the shared WAL DB (DD-13); the last change committed
wins.

Per-document **view mode** (Editor/Reading) is persisted separately (DD-10) so a document reopens in the
mode it was left in, unless overridden by the default open mode for file-system opens (DD-27).

## Multi-instance DB

GoMarkEdit runs multiple instances with **no single-instance lock** (DD-08; ADR-0006). No advisory
lock is acquired and a second instance is never refused. Concurrency safety instead rests on the
SQLite open configuration (DD-13):

```go
dsn := "file:" + path + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)" +
       "&_pragma=foreign_keys(ON)&_pragma=synchronous(NORMAL)"
db, _ := sql.Open("sqlite", dsn)
db.SetMaxOpenConns(1) // single writer within a process
```

- **WAL** lets readers and a writer proceed concurrently across processes.
- **`busy_timeout(5000)`** makes a briefly-contended write wait rather than fail with "database is
  locked".
- **Single-writer pool per process** serializes writes within an instance.
- Writes (settings, recent, window state) are **infrequent and small**, so cross-instance contention is
  negligible in practice.
- **Concurrent first-launch migration** — if two fresh instances open a not-yet-migrated DB at nearly the
  same time, goose runs each migration inside a transaction and records it in its version table; the
  losing instance finds the migrations already applied and proceeds. Additive-only migrations (`#migrations`)
  keep this race safe — no instance ever rewrites another's rows.
- **Contention past `busy_timeout`** — if a write stays blocked longer than 5000 ms (pathological, given
  writes are small and rare), SQLite returns "database is locked"; the repository surfaces it as a
  classified, retryable `CodeIO` through the envelope path rather than crashing, and the user can retry.

Last-writer-wins is acceptable for these preference writes; no document data is ever at risk because
documents live on the file system, not the DB (`#file-first`). A newer-than-expected schema is treated
as a hard error at open, not auto-downgraded.
