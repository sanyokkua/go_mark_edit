**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `01_Product/04_MARKDOWN_STANDARDS.md`, `01_Product/06_FORMAT_AND_LINT.md`, `01_Product/07_PDF_EXPORT.md`, `01_Product/09_ASSETS_AND_SECURITY.md`, `01_Product/10_THEMING.md`, `01_Product/13_I18N.md`, `02_Architecture/05_STATE_AND_PERSISTENCE.md`, `mockups/gomarkedit-mockup.html`

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
7. [Language group](#language-group)
8. [Persistence](#persistence)
9. [Defaults](#defaults)
10. [Edge cases](#edge-cases)

## Settings surface

Settings are reachable two ways, kept in sync:

- **Menu quick-settings** — the Settings menu in the titlebar exposes the most-used controls inline:
  theme swatches, appearance radio, default open mode, Markdown standard, and toggles for Autosave,
  Format on save, Lint on save, plus "All settings…" (`Ctrl/Cmd+,`).
- **Full Settings dialog** — a modal (`#setModal`) grouping every setting under headers: Appearance,
  Editor, Markdown, Export (PDF), Content & privacy, Language.

Changes apply immediately (live), not on an explicit "Save" — there is no OK/Cancel commit step for
settings; each control writes through on change.

In **Stage 3** the settings dialog gains two additional tabs — **AI / Providers** and **AI Context** —
that hold the assistant configuration (DD-53). They are specified in
`17_PROVIDERS_MODELS_SETTINGS.md#persistence` and `18_TOKENIZER_AND_CONTEXT.md`, are added as additive
registry growth (F4), and are absent from a build without the assistant. This document covers the pre-assistant groups
below.

## Appearance group

| Setting | Control | Values | Notes |
|---|---|---|---|
| Theme | segmented / swatches | Liquid Glass, Material, Minimal | DD-28; drives tokens (`10_THEMING.md`) |
| Color mode | segmented | Auto, Light, Dark | DD-29; Auto follows OS live |
| Default open mode | segmented | Reading (Viewer), Editor | DD-27; applied to every file-system open (OS/association, drag-and-drop, workspace tree, Open dialog); default **Editor**. Not new files. |

## Editor group

| Setting | Control | Values | Notes |
|---|---|---|---|
| Autosave | toggle | on / off | DD-12; existing files only |
| Live preview | toggle | on / off | debounced; may pause for large files (DD-20) |
| Line numbers | toggle | on / off | Monaco gutter |
| Word wrap | toggle | on / off | soft wrap |
| Default action scope | segmented | Whole document, Selection | **Stage 3** assistant default scope (DD-43); the runtime selection-if-present rule still overrides (`14_LLM_ASSISTANT_OVERVIEW.md#scope-selection-vs-document`). Inert until the assistant exists. |
| Font size | select | 13 / 14 / 16 px | editor font size |

## Markdown group

| Setting | Control | Values | Notes |
|---|---|---|---|
| Standard | segmented | Minimal, GFM, Full | DD-14; parsing + rendering (`04_MARKDOWN_STANDARDS.md`) |
| Format on save | toggle | on / off | DD-18 |
| Lint on save | toggle | on / off | DD-18 |
| Bullet marker | segmented | `-`, `*`, `+` | canonical `-` (DD-18) |
| Emphasis | segmented | `_ _`, `* *` | canonical `_` (DD-18) |
| Heading style | select | ATX (`#`), Setext | canonical ATX (DD-18) |

## Export group

| Setting | Control | Values | Notes |
|---|---|---|---|
| PDF styling | segmented | Current theme, Clean document | DD-24; `07_PDF_EXPORT.md#styled-vs-clean` |

## Content privacy group

The **Content & privacy** group. The **Background network**, **Telemetry / analytics**, and **LLM
requests** rows are informational, read-only affirmations of the non-negotiable constraints — they are
not user-adjustable; only **External images / CSS** is a user choice, and **Diagnostic logs** is an
action button.

| Setting | Control | Values | Notes |
|---|---|---|---|
| External images / CSS | segmented | Ask, Always allow, Always block | DD-22; `09_ASSETS_AND_SECURITY.md#remote-content-policy` |
| Background network | read-only, off | (disabled) | no update checks, telemetry, or asset/CDN fetches — off and not toggleable (DD-32 as revised, DD-33) |
| Telemetry / analytics | read-only, off | (disabled) | never collected (DD-33) — not toggleable |
| LLM requests | read-only, informational | "on-demand" | **Stage 3**: outbound only to your configured provider, only on user action; a local provider stays on-device (DD-32 as revised, DD-54; `14_LLM_ASSISTANT_OVERVIEW.md#privacy-and-network`) |
| Diagnostic logs | action | "Open logs folder" | logs written locally, never sent (DD-33) |

## Language group

| Setting | Control | Values | Notes |
|---|---|---|---|
| UI language | select | English (only shipped) | DD-35; i18n-ready (`13_I18N.md`) |

## Persistence

All settings persist in the SQLite **key-value** store via `internal/settings` (generic
`settings(key, value, type)` table, DD-10). New scalar preferences need no schema migration. Because
instances are multi-process (DD-08), the DB uses WAL + `busy_timeout` for safe concurrent access
(DD-13); a lock contention retries transparently (EC-SET-1). Window size, per-document view mode, and the
**application-level window/UI-layout state** — folder-sidebar visibility (and width), the view
arrangement (Editor / Split / Preview) and pane visibility, and the assistant assistant-sidebar visibility —
are persisted alongside settings under `ui.*`/`window.*` keys (DD-60/DD-61;
`02_Architecture/05_STATE_AND_PERSISTENCE.md#window-state`). Layout state is written **through on change**
and restored when a new window or the app launches; across multiple windows the **last window to change a
value wins**, not the last to close (DD-61). A corrupt or newer-than-expected schema resolves to safe
defaults or a hard startup error per the persistence policy (EC-SET-2).

## Defaults

| Setting | Default |
|---|---|
| Theme | Material |
| Color mode (appearance) | Auto |
| Default open mode | Editor |
| Autosave | On |
| Live preview | On |
| Line numbers | On |
| Word wrap | Off |
| Default action scope (Stage 3) | Whole document |
| Font size | 14 px |
| Markdown standard | GFM |
| Format on save | Off |
| Lint on save | On |
| Bullet marker | `-` |
| Emphasis | `_` |
| Heading style | ATX (`#`) |
| PDF styling | Current theme |
| External images / CSS | Ask |
| UI language | English |

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
- **EC-THEME-3** — Invalid/missing persisted theme or appearance → fall back to defaults.
