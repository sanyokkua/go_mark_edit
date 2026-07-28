# Settings

## What it's for

Roughly twenty-five choices, each of which somebody cares about and most of which somebody else never
touches. Settings exist so the defaults can be opinionated without being a trap. They also exist so the
app has one honest place to say what it does with your data — which is the point of the read-only rows
in Content and privacy: they are not toggles, they are a statement you can check.

## What you can do

Two surfaces, kept in sync. The **Settings menu** in the title bar holds the most-used controls inline:
the theme swatches, the appearance choice, the default open mode, the Markdown standard, and toggles for
autosave, format on save and lint on save — plus **All settings…**, which is also `Ctrl/Cmd+,`.

The **Settings dialog** groups everything: Appearance, Editor, Markdown, Export, Content and privacy,
Diagnostics, Language. Once the assistant exists it gains AI · Providers and AI · Context.

**AI · Providers** holds the provider kind, its base URL, its authentication, the four Test buttons and
the model picker. The model list has a **filter box** above it with an `N of M shown` header, because a
provider can report several hundred models — `connecting-an-ai-provider.md#every-model-picker-filters`
specifies it. The filter is a persisted value **per provider**, not one global filter.

Changes take effect immediately. There is no OK or Cancel. Every group has **Reset this group**, and the
dialog has **Reset all settings**.

## Rules

### Every change writes through immediately {#changes-apply-immediately}
- A control writes its value the moment it changes and the effect is visible at once. There is no commit
  step.

Examples: picking a theme → the window changes as the swatch is clicked · an OK button → the user has to
guess whether an unconfirmed change is live.

### Every setting declares a type, a range and a default, in one place {#one-statement-per-setting}
- The tables below are **the** statement of each setting's acceptable values. The control, the backend
  validator and the seeded default all read from this document rather than each carrying a copy.

Examples: max log file size is 1–100 MB here, in the control, and in the validator · three separate
copies → an interface offering a value the backend rejects, which is a real defect from a reviewed
application where a timeout control offered 1–3600 seconds against a validator accepting 1–600 and a
seeder writing 60.

### An out-of-range value is rejected, not clamped {#out-of-range-is-rejected}
- **If** a value outside a setting's stated range is submitted, **then** it is rejected and the message
  names the acceptable range — for example `expected 1–100 MB, got 250`.
- It is never silently clamped.

Examples: 250 MB for max log file size → rejected, with `1–100 MB` in the message · clamped to 100 →
the user believes they set 250 and the app is quietly doing something else.

### An unknown key is ignored and a missing key falls back per value {#registry-grows-safely}
- **If** the store contains a key this build does not know, **then** it is ignored.
- **If** a key is missing, **then** **that value** falls back to its own default — not the whole group.

Examples: a database written by a newer build containing `ai.provider` → an older build opens it and
ignores that key · `editor.wordWrap` missing while `editor.fontSize` is present → wrap falls back to
off, font size keeps 14 · a whole-group fallback → adding one setting resets every other setting in the
group for everyone who upgrades.

*Why this matters:* it is what lets the settings registry grow without a schema migration, and what lets
two versions of the app share one database file.

### Reset restores the defaults table and touches nothing else {#reset-scope}
- **Reset this group** and **Reset all settings** restore exactly the values in `#defaults`, in one
  transaction, taking effect immediately.
- Reset does **not** touch window geometry, layout state, or the recent-files list.

Examples: Reset all → the theme returns to Material and the window keeps its size and position · reset
including the window size → losing your window layout while fixing a font size.

*Why reset exists at all:* settings write through with no Cancel. Twenty-five live controls and no way
back to a known state is a support problem the first time somebody sets a combination they cannot undo.

### One window does not see another window's change {#no-cross-window-invalidation}
- **While** two windows are open, a setting changed in one is **not** picked up by the other. The second
  window keeps its value until it is relaunched.
- There is no cross-process invalidation, no polling, and no watch on the database.

Examples: change the theme in window A → window B keeps the old theme until relaunched · a watcher →
background work, which this product does not do.

*This is written down because it is the first question several windows will generate.* It is a
consequence of choosing several instances over a single one, plus doing no background work.

### Appearance {#appearance-group}

| Setting | Control | Values |
|---|---|---|
| Theme | swatches | Liquid Glass, Material, Minimal |
| Appearance | segmented | Auto, Light, Dark |
| Default open mode | segmented | Reading (Viewer), Editor |

- Default open mode applies to every file-system open — an operating-system open, a drop, the workspace
  tree, the Open dialog — and not to a new document.

Examples: Default open mode Reading, double-click a file → the reader · the same setting, `Ctrl/Cmd+N` →
the editor.

### Editor {#editor-group}

| Setting | Control | Values |
|---|---|---|
| Autosave | toggle | on / off |
| Live preview | toggle | on / off |
| Line numbers | toggle | on / off |
| Word wrap | toggle | on / off |
| Default action scope | segmented | Whole document, Selection |
| Font size | select | 13 / 14 / 16 px |
| Reading font size | select | 15 / 17 / 19 px |
| Reading width | select | Narrow (60 characters), Comfortable (72 characters), Wide (90 characters) |

- Default action scope is the assistant's default and is inert until the assistant exists.
- Font size is the editor's monospace size. Reading font size is the preview's and the reader's, and
  `Ctrl/Cmd +`, `Ctrl/Cmd -` and `Ctrl/Cmd 0` change it live.

Examples: font size 16 px and reading size 15 px → both honoured at once in Split view.

### Markdown {#markdown-group}

| Setting | Control | Values |
|---|---|---|
| Standard | segmented | Minimal, GFM, Full |
| Format on save | toggle | on / off |
| Lint on save | toggle | on / off |
| Bullet marker | segmented | `-`, `*`, `+` |
| Emphasis | segmented | `_ _`, `* *` |
| Heading style | select | ATX (`#`), Setext |

- The three marker settings are read by the toolbar, the format command and the linter alike, so they
  cannot disagree; see `formatting-text.md#canonical-markers`.
- Format on save and lint on save run on an **explicit** save only, never on an autosave.

Examples: bullet marker `*` → the toolbar inserts `*` and the linter stops flagging it.

### Export {#export-group}

| Setting | Control | Values |
|---|---|---|
| PDF styling | segmented | Current theme, Clean document |

- Current theme **always exports on a light background**; see
`exporting-a-document.md#printing-forces-light`.

Examples: Current theme → a light page carrying the theme's accent, radius and fonts · Clean document →
black on white in a print face, whatever theme is active.

### Content and privacy {#content-privacy-group}

| Setting | Control | Values |
|---|---|---|
| External images / CSS | segmented | Ask, Always allow, Always block |
| Background network | read-only, off | *(disabled)* |
| Telemetry and analytics | read-only, off | *(disabled)* |
| AI requests | read-only, informational | "on demand" |

- Only **External images / CSS** is a choice. The other three rows are statements of what the app does,
  shown so they can be checked, and they are not adjustable.
- **Background network** is off: no update checks, no telemetry, no asset or font fetching.
- **Telemetry and analytics** is never collected.
- **AI requests**, once the assistant exists, go only to the provider the user configured and only on a
  user action. A local provider keeps everything on the machine.

Examples: a toggle to enable telemetry → not offered, because there is nothing to enable · the row
missing entirely → the user has no way to confirm the claim.

### Diagnostics {#diagnostics-group}

| Setting | Control | Values | Default |
|---|---|---|---|
| Write logs to a file | toggle | on / off | On |
| Log level | select | `debug`, `info`, `warn`, `error` | `warn` in a release build, `debug` in a development build |
| Log folder | read-only path, plus **Open logs folder** | — | the platform log folder |
| Max file size | number, MB | 1 – 100 | 10 |
| Keep files | number | 1 – 20 | 5 | 
| Keep for | number, days | 1 – 365 | 30 |
| Compress rotated files | toggle | on / off | On |

- **If** the stored log level is empty, **then** it resolves to `warn` in a release build and `debug` in
  a development build, rather than failing.
- **If** the log directory cannot be created — a read-only or full configuration folder — **then** the
  app degrades to console-only and **opens anyway**.

Examples: a full disk → the editor opens, without a log file · exiting before the window appears →
trading a text editor for a diagnostic.

A development build differs from a release build in more than its folder, and the differences are listed
because otherwise they are discovered one at a time:

| | Development (`wails dev`, a local `just build`) | Release |
|---|---|---|
| Default log level | `debug` | `warn` |
| Console output | yes, alongside the file | file only |
| HTTP client debug logging | available | never |
| Version reported | `dev` | the git tag |
| Frontend served from | Vite at `:34115` | the embedded bundle |
| Config, database and log folders | suffixed `-Dev` | the plain folders |

### Language {#language-group}

| Setting | Control | Values |
|---|---|---|
| Interface language | select | English (the only one shipped) |

- Adding a language is a resource file, not a code change.

Examples: dropping `de.json` beside `en.json` → German appears in this list · a language needing a
wider button → the control was built to fit one string, which is a defect in the control.

### Everything persists in the key-value table {#settings-persist-in-kv}
- Settings are rows in the generic `settings(key, value, type)` table, so a new scalar preference needs
  no migration.
- Window size, per-document view mode and application layout live alongside them under `window.*` and
  `ui.*` keys. Logging configuration lives under `log.*`.
- A value that belongs to **one provider** — the model filter, for instance — is stored against that
  provider rather than as a single global key, so two configured providers keep two different filters.
- The database is opened in WAL mode with a 5-second busy timeout, so several windows share it safely and
  a contended write retries transparently.

Examples: adding a "show whitespace" toggle → one key, no migration · a table per settings group → a
migration per settings story.

### Defaults {#defaults}

Examples: a first launch → Material, Auto, GFM, autosave on, lint-on-save on, format-on-save off ·
**Reset all settings** → exactly this table again, and nothing else changes.

| Setting | Default |
|---|---|
| Theme | Material |
| Appearance | Auto |
| Default open mode | Editor |
| Autosave | On |
| Live preview | On |
| Line numbers | On |
| Word wrap | Off |
| Default action scope | Whole document |
| Font size | 14 px |
| Reading font size | 17 px |
| Reading width | Comfortable (72 characters) |
| Markdown standard | GFM |
| Format on save | Off |
| Lint on save | On |
| Bullet marker | `-` |
| Emphasis | `_` |
| Heading style | ATX (`#`) |
| PDF styling | Current theme |
| External images / CSS | Ask |
| Interface language | English |
| Write logs to a file | On |
| Log level | `warn` in a release build, `debug` in a development build |
| Max log file size | 10 MB |
| Keep log files | 5 |
| Keep logs for | 30 days |
| Compress rotated logs | On |

## What it looks like

- The Settings menu — `../surface/mockup.html#material-light/menu-settings`
- Appearance — `../surface/mockup.html#material-light/settings-appearance`
- Editor — `../surface/mockup.html#material-light/settings-editor`
- Markdown — `../surface/mockup.html#material-light/settings-markdown`
- Export — `../surface/mockup.html#material-light/settings-export`
- Content and privacy — `../surface/mockup.html#material-light/settings-privacy`
- Diagnostics — `../surface/mockup.html#material-light/settings-diagnostics`
- Language — `../surface/mockup.html#material-light/settings-language`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| A value outside its range is submitted | The rejection, naming the acceptable range | Enter a value in range |
| The settings database is locked by another window | Nothing — the write retries transparently | Nothing |
| The settings database cannot be opened at startup | `GoMarkEdit could not start` · `GoMarkEdit could not initialize its local settings. Please try again.` | Retry; then check the configuration folder |
| The log folder cannot be created | Nothing in the interface; the app opens with console-only logging | Free space, or fix the folder's permissions |
| The stored schema is newer than this build understands | Safe defaults, or a startup error if the database cannot be read at all | Use a newer build |

## Edge cases

**Autosave is turned off while a document is modified**
- *Trigger:* the toggle is switched off with unsaved changes present.
- *Expected:* the document stays modified. Nothing is written to close the gap.
- *Avoid:* a final autosave on the way out, which writes a file the user had just decided should not be
  written automatically.

**Reset all settings is pressed with a document open**
- *Trigger:* Reset all.
- *Expected:* the defaults table is restored in one transaction and takes effect immediately. The window
  keeps its size and position, and the recent list is untouched.
- *Avoid:* a partial reset where half the values land and the other half fail.

**Two windows write the same setting at the same moment**
- *Trigger:* both change the theme simultaneously.
- *Expected:* one write waits for the other and both succeed. The last one committed is the stored value.
- *Avoid:* a `database is locked` error surfaced to the user, who cannot act on it.

**The Markdown standard is changed with documents open**
- *Trigger:* GFM to Full while three documents are open.
- *Expected:* the preview and reader of all three re-render under the new standard.
- *Avoid:* requiring a tab to be closed and reopened, which makes the setting look broken.

## Not this

- **No OK or Cancel.** See `#changes-apply-immediately`, and `#reset-scope` for the way back.
- **No import or export of a settings file.** It is a second format to keep valid, and the ranges in
  `#one-statement-per-setting` would have to be enforced against a file a user hand-edited.
- **No per-workspace or per-document settings.** One set, for the application.
- **No telemetry toggle.** There is nothing to toggle; see `#content-privacy-group`.
- **No live propagation between windows.** See `#no-cross-window-invalidation`.

## Decisions

- *2026-07-25* — Every setting states its type, range and default once, and out-of-range values are
  rejected with the range in the message rather than clamped.
- *2026-07-25* — The Diagnostics group was added. The architecture had always said the logger is
  reconfigured from persisted `log.*` settings at startup, and no such setting existed.
- *2026-07-25* — Failing to write logs never prevents the app from opening. Recorded in
  `../../adr/0032-run-registry-and-shutdown-ordering.md`.
- *2026-07-28* — The Export group lost its **HTML export** row. HTML export was never a decision; it
  entered during an earlier migration. The app exports a PDF and saves Markdown, and copying from the
  preview already produces styled text because the webview does it. See
  `exporting-a-document.md#pdf-is-the-only-export`.
- *2026-07-28* — The AI · Providers model picker gained a filter, and the filter is a **per-provider**
  persisted value rather than a global one. Two configured providers have two different model catalogues,
  so one shared filter would be wrong for at least one of them. See
  `connecting-an-ai-provider.md#every-model-picker-filters`.

## Open questions
