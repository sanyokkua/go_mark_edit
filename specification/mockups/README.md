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
