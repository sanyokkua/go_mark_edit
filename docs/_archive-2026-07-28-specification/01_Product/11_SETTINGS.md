**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-25
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `01_Product/04_MARKDOWN_STANDARDS.md`, `01_Product/06_FORMAT_AND_LINT.md`, `01_Product/07_EXPORT.md`, `01_Product/09_ASSETS_AND_SECURITY.md`, `01_Product/10_THEMING.md`, `01_Product/13_I18N.md`, `02_Architecture/05_STATE_AND_PERSISTENCE.md`, `mockups/gomarkedit-mockup.html`

# Settings

The settings surface, groups, persistence, and defaults. Mirrors the Settings menu and Settings dialog
in `mockups/gomarkedit-mockup.html`. Refines `01_FUNCTIONAL_REQUIREMENTS.md#fr-settings`. Backed by
`internal/settings` (KV store, DD-10).

## Table of Contents

1. [Settings surface](#settings-surface)
2. [Appearance group](#appearance-group)
3. [Editor group](#editor-group)
4. [Markdown group](#markdown-group)
5. [Export group](#export-group)
6. [Content privacy group](#content-privacy-group)
7. [Diagnostics group](#diagnostics-group)
8. [Language group](#language-group)
9. [Every setting declares a type, a range and a default](#every-setting-declares-a-type-a-range-and-a-default)
10. [Reset to defaults](#reset-to-defaults)
11. [Persistence](#persistence)
12. [Defaults](#defaults)
13. [Edge cases](#edge-cases)

## Settings surface

Settings are reachable two ways, kept in sync:

- **Menu quick-settings** — the Settings menu in the titlebar exposes the most-used controls inline:
  theme swatches, appearance radio, default open mode, Markdown standard, and toggles for Autosave,
  Format on save, Lint on save, plus "All settings…" (`Ctrl/Cmd+,`).
- **Full Settings dialog** — a modal (`#setModal`) grouping every setting under headers: Appearance,
  Editor, Markdown, Export (PDF), Content & privacy, Language.

Changes apply immediately (live), not on an explicit "Save" — there is no OK/Cancel commit step for
settings; each control writes through on change.

Once the assistant exists the settings dialog gains two additional tabs — **AI / Providers** and **AI Context** —
that hold the assistant configuration (DD-53). They are specified in
`17_PROVIDERS_MODELS_SETTINGS.md#persistence` and `18_TOKENIZER_AND_CONTEXT.md`, are added as additive
registry growth (F4), and are absent from a build without the assistant. This document covers the pre-assistant groups
below.

## Appearance group

| Setting           | Control              | Values                          | Notes                                                                                                                                     |
| ----------------- | -------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Theme             | segmented / swatches | Liquid Glass, Material, Minimal | DD-28; drives tokens (`10_THEMING.md`)                                                                                                    |
| Color mode        | segmented            | Auto, Light, Dark               | DD-29; Auto follows OS live                                                                                                               |
| Default open mode | segmented            | Reading (Viewer), Editor        | DD-27; applied to every file-system open (OS/association, drag-and-drop, workspace tree, Open dialog); default **Editor**. Not new files. |

## Editor group

| Setting              | Control   | Values                                           | Notes                                                                                                                                                                                  |
| -------------------- | --------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autosave             | toggle    | on / off                                         | DD-12; existing files only                                                                                                                                                             |
| Live preview         | toggle    | on / off                                         | debounced; may pause for large files (DD-20)                                                                                                                                           |
| Line numbers         | toggle    | on / off                                         | Monaco gutter                                                                                                                                                                          |
| Word wrap            | toggle    | on / off                                         | soft wrap                                                                                                                                                                              |
| Default action scope | segmented | Whole document, Selection                        | Assistant default scope (DD-43); the runtime selection-if-present rule still overrides (`14_LLM_ASSISTANT_OVERVIEW.md#scope-selection-vs-document`). Inert until the assistant exists. |
| Font size            | select    | 13 / 14 / 16 px                                  | editor font size, monospace pane only                                                                                                                                                  |
| Reading font size    | select    | 15 / 17 / 19 px                                  | the preview and reading mode. `Ctrl/Cmd +` / `-` / `0` adjust it live (DD-72). Reading beautifully is a headline goal; a fixed size is not it.                                         |
| Reading width        | select    | Narrow (60ch) / Comfortable (72ch) / Wide (90ch) | the measure of the reading column (DD-72)                                                                                                                                              |

## Markdown group

| Setting        | Control   | Values             | Notes                                                   |
| -------------- | --------- | ------------------ | ------------------------------------------------------- |
| Standard       | segmented | Minimal, GFM, Full | DD-14; parsing + rendering (`04_MARKDOWN_STANDARDS.md`) |
| Format on save | toggle    | on / off           | DD-18                                                   |
| Lint on save   | toggle    | on / off           | DD-18                                                   |
| Bullet marker  | segmented | `-`, `*`, `+`      | canonical `-` (DD-18)                                   |
| Emphasis       | segmented | `_ _`, `* *`       | canonical `_` (DD-18)                                   |
| Heading style  | select    | ATX (`#`), Setext  | canonical ATX (DD-18)                                   |

## Export group

| Setting     | Control   | Values                                            | Notes                                                                                                                                                                         |
| ----------- | --------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF styling | segmented | Current theme, Clean document                     | DD-24; `07_EXPORT.md#styled-vs-clean`. **Current theme always exports on a light background** — a dark theme prints as an unreadable page (`10_THEMING.md#print-and-export`). |
| HTML export | segmented | Standalone (styles inlined), Fragment (body only) | Standalone opens in a browser as-is; Fragment is what you paste into a CMS or a wiki                                                                                          |

## Content privacy group

The **Content & privacy** group. The **Background network**, **Telemetry / analytics**, and **LLM
requests** rows are informational, read-only affirmations of the non-negotiable constraints — they are
not user-adjustable; only **External images / CSS** is a user choice, and **Diagnostic logs** is an
action button.

| Setting               | Control                  | Values                          | Notes                                                                                                                                                                                                     |
| --------------------- | ------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External images / CSS | segmented                | Ask, Always allow, Always block | DD-22; `09_ASSETS_AND_SECURITY.md#remote-content-policy`                                                                                                                                                  |
| Background network    | read-only, off           | (disabled)                      | no update checks, telemetry, or asset/CDN fetches — off and not toggleable (DD-32 as revised, DD-33)                                                                                                      |
| Telemetry / analytics | read-only, off           | (disabled)                      | never collected (DD-33) — not toggleable                                                                                                                                                                  |
| LLM requests          | read-only, informational | "on-demand"                     | Once the assistant exists: outbound only to your configured provider, only on user action; a local provider stays on-device (DD-32 as revised, DD-54; `14_LLM_ASSISTANT_OVERVIEW.md#privacy-and-network`) |

The **Diagnostic logs** action moved to the Diagnostics group below, where the settings that control
those logs also live.

## Diagnostics group

`02_Architecture/02_BACKEND_GO.md` has always said the logger is reconfigured from persisted `log.*`
settings on startup. **No such setting existed.** This group defines them, and gives the "Open logs
folder" button something to be about.

| Setting                | Control                 | Values                           | Default                                           | Notes                                                                               |
| ---------------------- | ----------------------- | -------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Write logs to a file   | toggle                  | on / off                         | On                                                | Off keeps console output in a dev build and writes nothing in a release build       |
| Log level              | select                  | `debug`, `info`, `warn`, `error` | `warn` in a release build, `debug` in a dev build | An empty stored value resolves to the build-appropriate default rather than failing |
| Log folder             | read-only path + action | —                                | the platform log folder                           | "Open logs folder" reveals it in the file manager                                   |
| Max file size          | number (MB)             | 1 – 100                          | 10                                                | rotation threshold                                                                  |
| Keep files             | number                  | 1 – 20                           | 5                                                 | rotated files retained                                                              |
| Keep for               | number (days)           | 1 – 365                          | 30                                                | age at which a rotated file is deleted                                              |
| Compress rotated files | toggle                  | on / off                         | On                                                |                                                                                     |

**A development build differs from a release build in more than its folder.** The `-Dev` config, database
and log folders are the visible part (DD-67); these are the rest, and they are listed because "dev and
prod differ" without an enumeration is a thing people discover one at a time:

|                           | Development (`wails dev`, a local `wails build`) | Release             |
| ------------------------- | ------------------------------------------------ | ------------------- |
| Default log level         | `debug`                                          | `warn`              |
| Console output            | yes, alongside the file                          | file only           |
| HTTP client debug logging | available                                        | never               |
| Version reported          | `dev`                                            | the tag (DD-65)     |
| Frontend served from      | Vite at `:34115`                                 | the embedded bundle |

Logs are local files and are never transmitted (DD-33). **No log line contains a secret, an API key, a
document's contents, or a user's file path beyond what is needed to identify a file**
(`.claude/rules/go-logging.md`).

**Failing to write logs never prevents the app from opening.** A log directory that cannot be created —
a read-only or full configuration folder — degrades to console-only and the editor opens anyway. It
currently exits before the window appears, which trades a text editor for a diagnostic (ADR-0032).

## Language group

| Setting     | Control | Values                 | Notes                            |
| ----------- | ------- | ---------------------- | -------------------------------- |
| UI language | select  | English (only shipped) | DD-35; i18n-ready (`13_I18N.md`) |

## Every setting declares a type, a range and a default

DD-75. Each row above states its acceptable values, and that statement is **the** statement: the
control, the backend validator and the seeded default all cite this document rather than carrying their
own copy of the number. Three sources for one range is how an interface ends up offering a value the
backend rejects — a real defect in a reviewed reference application, where the timeout control offered
1–3600 seconds against a validator that accepted 1–600 and a seeder that wrote 60.

**Out-of-range values are rejected, not clamped**, and the rejection names the acceptable range:
`apperr.Validation(field, expected, got)` with `expected` reading `"1–100 MB"`. A silently clamped value
is one the user believes they set.

An **unknown key** in the store is ignored, and a **missing** key falls back to its default per scalar —
not to a whole-group default. This is what makes the registry growable (F4): a build that predates a
setting must open a database that contains it, and vice versa.

## Reset to defaults

Every group has a **Reset this group** action, and the dialog has a **Reset all settings**. Both restore
exactly the [Defaults](#defaults) table, in one transaction, and take effect immediately like any other
change.

This exists because settings write through on change with no OK/Cancel step. Roughly twenty-five live
controls and no way back to a known state is a support problem the first time somebody sets a
combination they cannot undo. Reset does **not** touch window geometry, layout state, or the recent-files
list — those are not settings, and losing your window size while fixing a font size would be a surprise.

## Persistence

All settings persist in the SQLite **key-value** store via `internal/settings` (generic
`settings(key, value, type)` table, DD-10). New scalar preferences need no schema migration. Because
instances are multi-process (DD-08), the DB uses WAL + `busy_timeout` for safe concurrent access
(DD-13); a lock contention retries transparently (EC-SET-1). Window size, per-document view mode, and the
**application-level window/UI-layout state** — folder-sidebar visibility (and width), the view
arrangement (Editor / Split / Preview) and pane visibility, the **editor/preview split ratio**
(`ui.splitRatio`, DD-74), and the assistant-sidebar visibility and width —
are persisted alongside settings under `ui.*`/`window.*` keys (DD-60/DD-61;
`02_Architecture/05_STATE_AND_PERSISTENCE.md#window-state`). Layout state is written **through on change**
and restored when a new window or the app launches; across multiple windows the **last window to change a
value wins**, not the last to close (DD-61). A corrupt or newer-than-expected schema resolves to safe
defaults or a hard startup error per the persistence policy (EC-SET-2). Logging configuration lives
under `log.*`.

**A running instance does not observe another instance's change.** There is no cross-process
invalidation, no polling and no watch on the database: change the theme in one window and a second open
window keeps the old theme until it is relaunched. This is a deliberate consequence of DD-08 plus "no
background work", and it is written down because it is the first question multi-instance will generate.

## Defaults

| Setting                          | Default                          |
| -------------------------------- | -------------------------------- |
| Theme                            | Material                         |
| Color mode (appearance)          | Auto                             |
| Default open mode                | Editor                           |
| Autosave                         | On                               |
| Live preview                     | On                               |
| Line numbers                     | On                               |
| Word wrap                        | Off                              |
| Default action scope (assistant) | Whole document                   |
| Font size                        | 14 px                            |
| Reading font size                | 17 px                            |
| Reading width                    | Comfortable (72ch)               |
| Markdown standard                | GFM                              |
| Format on save                   | Off                              |
| Lint on save                     | On                               |
| Bullet marker                    | `-`                              |
| Emphasis                         | `_`                              |
| Heading style                    | ATX (`#`)                        |
| PDF styling                      | Current theme                    |
| HTML export                      | Standalone                       |
| External images / CSS            | Ask                              |
| UI language                      | English                          |
| Write logs to a file             | On                               |
| Log level                        | `warn` (release) / `debug` (dev) |
| Max log file size                | 10 MB                            |
| Keep log files                   | 5                                |
| Keep logs for                    | 30 days                          |
| Compress rotated logs            | On                               |

## Edge cases

- **EC-SET-1** — Settings DB locked by another instance → WAL + `busy_timeout` retry, no data loss.
- **EC-SET-2** — Corrupt / newer-than-expected schema → safe defaults or hard startup error.
- **EC-SET-3** — Changing the Markdown standard re-renders open documents.
- **EC-SET-4** — Turning autosave off with a dirty buffer keeps it dirty (no forced save).
- **EC-SET-5** — A new window (or the next app launch) opens with the **last saved** window/UI-layout
  state — sidebar visibility, view arrangement, window size — restored before the window is shown (DD-60).
- **EC-SET-6** — Two windows open: window A hides the sidebar, then window B (which changed nothing) is
  closed. The stored layout keeps A's change — the **last window to change** a value wins, never the last
  to close (DD-61).
- **EC-SET-7** — A missing or invalid persisted layout value (e.g. an out-of-range window size or an
  unknown arrangement) falls back to the sensible default rather than failing to open the window.
- **EC-SET-8** — A value outside its declared range is submitted → rejected with the acceptable range
  in the message; the stored value is unchanged. Never silently clamped.
- **EC-SET-9** — The store holds a key this build does not know → ignored, and left untouched so an
  older build downgrading does not lose it.
- **EC-SET-10** — A key this build expects is absent → that scalar falls back to its default; other keys
  in the same group are unaffected.
- **EC-SET-11** — Reset to defaults is used → every setting returns to the Defaults table in one
  transaction. Window geometry, layout state and recent files are not touched.
- **EC-SET-12** — Two instances are open and one changes a setting → the other keeps the old value until
  it is relaunched. No cross-process invalidation exists.
- **EC-SET-13** — The log directory cannot be created → logging degrades to console-only, a warning is
  recorded, and the app opens normally.
- **EC-THEME-3** — Invalid/missing persisted theme or appearance → fall back to defaults.
