# GoMarkEdit UI Mockup

**`gomarkedit-mockup.html`** is the **single source of truth** for the GoMarkEdit UI. It is one
self-contained, offline HTML file that renders the whole app and every state, in all three themes and
appearances. Open it in any modern browser. There are intentionally **no other mockup files** — this one
file supersedes the earlier per-theme / per-feature mockups to eliminate visual drift.

## What it contains

- **Themes × appearances** — Liquid Glass, Material, Minimal × Auto / Light / Dark, switched from the top
  bar. Selecting a theme defaults to its **native appearance** (Glass→Dark, Material→Light, Minimal→Light)
  so each theme shows at its intended best; Appearance is still overridable. Tokens are normative and
  pinned in `../01_Product/10_THEMING.md#canonical-theme-tokens`.
- **Screens** — a top **Screen selector** jumps to every app state: Editor (Split / Editor-only /
  Preview-only), Reading (Viewer), sidebar/assistant hidden; the File / Settings / View / About **menus**;
  a **context menu**; the **assistant** (quick actions, agentic chat with tool-call chips + apply-diff
  card, selection scope + token-fit meter); **dialogs** (Settings with Appearance / Editor / Markdown /
  AI·Providers / AI·Context / Content&privacy / Language tabs, Keyboard shortcuts, About); **notifications**
  (toasts, external-content banner, drag-and-drop overlay, folder-conflict prompt); and a **Design tokens**
  reference view.
- **All widgets** — menu bar, folder-tree sidebar (filtered), tabs, formatting toolbar, editor/preview
  split, right assistant sidebar, status bar, drop overlay, etc. — in one shared, token-driven layout.

## Deep-linking a specific state

The URL hash encodes `#<theme>-<mode>/<screen>`, so spec clauses can link an exact state:

- `gomarkedit-mockup.html#glass-dark/editor-split` — the editor in Liquid Glass (dark).
- `gomarkedit-mockup.html#material-light/settings-ai-providers` — the AI Providers settings tab.
- `gomarkedit-mockup.html#material-light/assistant-chat` — assistant chat with a proposed-edit diff.
- `gomarkedit-mockup.html#material-light/drop-prompt` — the drag-and-drop folder-conflict prompt.

`<theme>` ∈ `glass|material|minimal`, `<mode>` ∈ `auto|light|dark`, `<screen>` is any Screen-selector id
(e.g. `editor-split`, `reading`, `menu-file`, `context-menu`, `assistant-chat`, `assistant-selection`,
`settings-appearance`, `settings-ai-providers`, `settings-ai-context`, `shortcuts`, `about`, `toasts`,
`banner`, `drop-overlay`, `drop-prompt`, `tokens`).

## Role in the spec

UI stories cite `mockups/gomarkedit-mockup.html` (optionally with a state hash) as the **visual
acceptance reference**. The file is frozen with the spec: changing the UI means changing this file *and*
the clause it backs, never drifting one from the other. The normative token values remain
`../01_Product/10_THEMING.md#canonical-theme-tokens`.

## What changed on 2026-07-25

The mockup was brought back into agreement with the specification after a review found it drifting in
both directions — carrying tokens the token table did not name, and drawing features the prose forbade.

- **Every token this file uses is now named in `../01_Product/10_THEMING.md`.** Seven syntax colours
  that existed only here (`--c-h`, `--c-b`, `--c-em`, `--c-q`, `--c-c`, `--c-fn`, `--c-code`) were
  promoted to their normative names in the `--md-*` family. Six families that existed in neither were
  added to both: `--hl-*` (fenced-code highlighting), selection, focus ring, scrollbar, the `--z-*`
  stacking scale, and motion. There are no longer any raw `z-index` numbers.
- **Colour emoji are gone** (DD-69). Fifteen of them were acting as icons; a colour emoji is a bitmap
  that cannot take a token colour and renders differently on each platform. They are now an inline
  monochrome SVG sprite that inherits `currentColor`.
- **The tab dot encodes dirty, not active.** It previously showed faint on inactive tabs and accent on
  the active one — so a clean active tab looked unsaved and a dirty background tab looked fine.
- **Removed, because the specification refuses them:** Rename… and Delete… from the tree context menu
  (ADR-0033 — creating files and folders stays), the Partial button on the edit-proposal card, the
  persistent "Ollama connected" status indicator (it implies polling, which DD-32 forbids — it now reads
  as the result of the last call), and the two About-menu help surfaces. "Reveal in Finder" is now
  "Reveal in file manager", which is true on all three platforms.

## What the file now covers

44 screens, verified to render in all six palettes with no horizontal overflow (264 combinations).

**Widths.** A **Width** control in the harness sets the app frame to **375 / 768 / 1280**, so all three
are demonstrable without resizing the browser. What each shows:

| | 768 | 375 |
|---|---|---|
| Assistant region | hidden | hidden |
| Sidebar | 46 px icon rail | overlay, opened by the ☰ in the title bar |
| Editor + preview | side by side | stacked |
| Toolbar | list/link groups fold into the `»` overflow menu | plus the text buttons and the view segmented control |
| Menu bar | in the title bar | folded into the overflow menu |
| Status bar | drops the provider | drops provider, autosave, encoding, EOL, counts and caret |

The status bar drops in **one fixed order** (`../01_Product/02_EDITOR_AND_VIEWER_MODES.md#status-bar`),
so an item is never in two different places at two widths. Problems and Reading are never dropped.

**States added on 2026-07-25**, grouped as they appear in the Screen selector:

- **Empty** — the launcher (no tabs open, which is the first screen of *every* launch since there is no
  session restore), the empty workspace tree, a filter that matched nothing, and the **reserved-but-empty
  assistant region** that every phase before the assistant actually looks like.
- **Busy** — a gated long operation with progress and an in-place Cancel, the paused-preview banner with
  its manual refresh, the problems list behind the status-bar count, and the diff view.
- **Prompts** — Save / Discard / Cancel, the aggregate quit dialog listing every dirty document, and the
  external-change prompt with the difference shown inside it.
- **Menus 2** — the tab context menu, the editor context menu, the toolbar overflow menu, and a
  focus-ring demonstration.
- **Settings** — every group is now deep-linkable, including the **Export** and **Diagnostics** groups,
  which the specification defined and this file did not have at all.

## Still missing

Nothing structural. Two smaller things a story may want and this file does not draw:

- **The tab-reorder insertion indicator** — `../01_Product/03_FILES_TABS_WORKSPACE.md` specifies a drop
  indicator, a reduced-opacity drag ghost and Esc-to-cancel. Static markup shows the menu but not the
  gesture.
- **Loading placeholders** — Monaco booting, a large tree enumerating. The Mermaid one is drawn; these
  two are momentary states that a still image communicates poorly.

Both are noted rather than drawn deliberately: a mockup is a reference for what a surface *looks like*,
and a gesture mid-flight is better specified in prose than faked in HTML.
