# The KV store, typed access, and keys

Authority: `specification/02_Architecture/05_STATE_AND_PERSISTENCE.md` (File-first, KV schema,
Recent, Window state). Design decisions **DD-10** (what is persisted), **DD-11** (clean launch, no
session restore), **DD-12** (autosave existing files only). Module inventory:
`specification/02_Architecture/01_MODULE_INVENTORY.md` (`internal/db/`,
`internal/settings/`, `internal/recent/`). Governing rule: `.claude/rules/go-persistence-sqlite.md`.

## What is persisted (and what is not)

Beyond the files themselves, the store persists (DD-10):

- **recent files & folders**,
- all **settings**,
- **window size / maximized**,
- **per-document view mode** (DD-60/DD-61 write-through-on-change; see ADR-0013).

It **never** holds document content — only paths, preferences, and small view state.

On launch the app opens **clean** — no session restore, no crash recovery, no swap files (DD-11).
Autosave persists **existing** files only (default on); a never-saved buffer requires an explicit
Save / "Save As" (DD-12).

## Config / DB / logs folders

Resolved via `internal/file`, with a `-Dev` suffix under `wails dev` so a dev session never touches
production data:

| Platform | Folder |
|---|---|
| macOS | `~/Library/Application Support/GoMarkEdit` |
| Linux | `~/.config/GoMarkEdit` |
| Windows | `%APPDATA%\GoMarkEdit` |

## The generic KV table

One table backs all scalar config groups, so a new scalar preference needs **no migration** — only a
new dotted key:

```sql
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type  TEXT NOT NULL   -- 'string' | 'int' | 'float' | 'bool'
);
```

## Typed access

```go
// internal/settings/repository_sqlite.go
func (r *SqliteSettingsRepository) getBool(key string, def bool) bool {
    v, err := strconv.ParseBool(r.getSetting(key).Value)
    if err != nil {
        return def
    }
    return v
}

// UpsertSetting is one parameterized statement (sqlc-generated):
//   INSERT INTO settings(key, value, type) VALUES(?, ?, ?)
//   ON CONFLICT(key) DO UPDATE SET value = excluded.value, type = excluded.type;
```

Group accessors are typed `Get*Config` / `Update*Config`, built on `getBool` / `getInt` / `getFloat`
/ `getString` + `UpsertSetting`. Every getter takes a **default** so a missing/malformed key yields a
sane value instead of a zero.

### KV `type` strings

| `type` | Getter | Example key | DD |
|---|---|---|---|
| `bool` | `getBool` | `editor.autosave` | DD-12 |
| `string` | `getString` | `appearance.theme`, `view.defaultOpenMode` | DD-28, DD-27 |
| `int` | `getInt` | `window.width`, `window.height` | DD-10 |
| `float` | `getFloat` | (numeric prefs) | — |

### Representative key prefixes

`appearance.*`, `editor.*`, `markdown.*`, `format.*` / `lint.*`, `export.*`, `content.*`
(`content.remotePolicy` = `ask` / `allow` / `block`, DD-22), `view.*`, `lang.*`, `window.*`.

Structured data (the recent list) gets its **own table**, not the KV table — reach for a migration
only when the data is relational or a list, not a handful of scalars.
