---
name: markdown-rendering-pipeline
description: >-
  Use when changing the Markdown renderer, the standard-level mapping
  (Minimal/GFM/Full), Mermaid/math/syntax highlighting, sanitization, or the
  Format/Compact/Lint operations. Triggers: editing `frontend/src/logic/markdown/renderer.ts`,
  `logic/format/format.ts`, `logic/lint/lint.ts`, or `ui/components/MarkdownView`/`MermaidBlock`;
  wiring `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `rehype-highlight`,
  `rehype-sanitize`; adding a plugin for a standard level; a KaTeX/Mermaid/highlight asset that
  must be bundled offline; `dangerouslySetInnerHTML`; a debounced preview; canonical bullet/emphasis/
  heading defaults; an EC-RENDER-*/EC-FMT-*/EC-LINT-* edge case.
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
references:
  - references/plugin-sets.md
  - references/mermaid-and-sanitization.md
  - references/format-compact-lint.md
  - references/troubleshooting.md
assets:
  - assets/standard-plugin-matrix.md
---

# Markdown Rendering Pipeline

The frontend pipeline that turns Markdown source into sanitized HTML for the preview and reader,
plus the on-demand Format / Compact / Lint operations. Everything here is a **webview / TypeScript**
concern — nothing crosses to Go except through the guarded `internal/assets` handler for local
document images. Components never import `wailsjs/` directly; if this pipeline ever needs backend
data, it goes through `logic/adapter/` like everything else, but in practice it needs no backend
at all.

## When to use

- Wiring or reordering remark/rehype plugins, or changing which plugins a standard level enables.
- Adding or fixing Mermaid, KaTeX math, or syntax-highlighting rendering.
- Changing sanitization, the `components` override, or how remote/local document assets resolve.
- Editing Format, Compact, or Lint behavior, canonical style defaults, or on-save wiring.
- Touching preview debounce / large-file pause behavior.

### When NOT to use

- Backend document I/O, encoding, dialogs → `internal/docs/` (a different rule set).
- Theme tokens / appearance → use the **theming-tokens** skill.
- Writing the proving tests → use the **testing-wails-app** skill.
- The Wails bridge / adapter boundary → `logic/adapter/` (`ts-redux-adapter.md`).

## Source of truth

- Spec: `specification/01_Product/05_RENDERING_AND_EXTENSIONS.md` (Pipeline, GFM, Math, Highlighting,
  Mermaid, Components override, Sanitization, Preview debounce, Edge cases EC-RENDER-1..7),
  `specification/01_Product/04_MARKDOWN_STANDARDS.md` (levels + Plugin mapping table),
  `specification/01_Product/06_FORMAT_AND_LINT.md` (Format, Compact, Lint, Lint rules, On-save,
  Canonical style, EC-FMT-*/EC-LINT-*), `specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md`
  (preview/reader debounce), `specification/02_Architecture/03_FRONTEND_REACT.md`.
- Design decisions: `DD-14` (standard→plugin set), `DD-16` (Format/Compact), `DD-17` (Lint),
  `DD-18` (canonical style + on-save), `DD-19` (react-markdown pipeline + Mermaid override),
  `DD-20` (debounce), `DD-22` (remote-content policy), `DD-32` (offline/bundled), `ADR-0003`.
- Governing rules: `.claude/rules/ts-markdown-pipeline.md`, `.claude/rules/offline-and-privacy.md`,
  `.claude/rules/ts-react-frontend.md`.
- Modules (from `01_MODULE_INVENTORY.md`, the only valid module source): `frontend/src/logic/markdown/`
  (`renderer.ts`), `frontend/src/logic/format/` (`format.ts`), `frontend/src/logic/lint/` (`lint.ts`),
  `frontend/src/ui/components/` (`MarkdownView`, `MermaidBlock`, `CodeEditor`).

## Workflow

1. **Locate the change.** Read the relevant spec section plus the `DD-` id above; confirm the
   module path in `01_MODULE_INVENTORY.md`. Expected outcome: you know exactly which file
   (`renderer.ts` / `format.ts` / `lint.ts` / a `ui/components` wrapper) to touch, before editing
   anything.
2. **Standard → plugin mapping.** If the change touches which plugins a Minimal/GFM/Full standard
   enables, derive the set in the single place the mapping lives — see
   `references/plugin-sets.md` for the DD-14 table, the full `pluginsFor` implementation, and the
   `MarkdownView` consumption snippet. Keep `rehype-sanitize` last, always.
3. **Mermaid / sanitization / offline assets.** If the change touches diagram rendering, the
   sanitize schema, `dangerouslySetInnerHTML`, or any bundled vs. remote asset — see
   `references/mermaid-and-sanitization.md` for the full async `MermaidBlock` implementation, the
   sanitize-schema requirements, the DD-32 offline/bundling rule, and the DD-22 remote-content
   policy (Ask / Always allow / Always block).
4. **Format / Compact / Lint.** If the change touches the on-demand editing operations, canonical
   style defaults, on-save ordering, or preview debounce — see
   `references/format-compact-lint.md` for the DD-16/17/18 operations table, the `lint.ts`
   findings-to-Monaco-markers code, and the DD-20 debounce/large-file-pause behavior.
5. **Make the change in exactly one place** (e.g. the standard→plugin map, or the sanitize schema)
   — never scatter equivalent logic as `if (standard === …)` branches across components.
6. **Scoped tests first:** `npx jest frontend/src/logic/markdown` — expected: green, each test
   names the AC it proves.
7. **`just check`** — expected: format-check, lint, `tsc --noEmit`, and the full Jest suite pass.
8. **`just verify-ui`** — expected: Playwright renders a GFM table / KaTeX / `.hljs` / `.gme-mermaid
   svg` across widths and both modes with **zero console errors / overflow**.
9. **`just verify-smoke`** — expected: interaction flows (type → debounced preview, Format, Lint)
   pass.
10. **`just trace` then `just trace-check`** — expected: zero orphans; every EC-RENDER/EC-FMT/EC-LINT
    id you touched maps to a proving test.

If a symptom shows up during any of these steps (script crash, sanitize bypass, jank, wrong
plugin firing), check `references/troubleshooting.md` before improvising a fix — most rendering
bugs map to one of a small, known set of causes.

## Reference Index

| Reference file | Load when |
|---|---|
| `references/plugin-sets.md` | Adding/removing a plugin, changing what a standard level enables, touching `pluginsFor` or `MarkdownView`'s plugin wiring |
| `references/mermaid-and-sanitization.md` | Touching `MermaidBlock`, the sanitize schema, `dangerouslySetInnerHTML`, bundled assets, or remote/local document-asset policy |
| `references/format-compact-lint.md` | Touching Format, Compact, Lint, canonical style defaults, on-save ordering, or preview debounce/large-file pause |
| `references/troubleshooting.md` | A rendering/format/lint bug doesn't have an obvious cause, or you need the full EC-RENDER/EC-FMT/EC-LINT id index |

## Mandatory validation

- [ ] Plugin set derived from the standard in **one** place (`renderer.ts`); Minimal/GFM/Full per
      the table in `references/plugin-sets.md`.
- [ ] Mermaid fences routed through the async `MermaidBlock` (`startOnLoad:false`, parse→render,
      cancel-on-unmount, theme from `data-mode`).
- [ ] `rehype-sanitize` present and **last**; `dangerouslySetInnerHTML` only for sanitized Mermaid SVG.
- [ ] KaTeX / Mermaid / highlight assets bundled; **zero** runtime network fetch; remote doc assets
      gated by the DD-22 content policy.
- [ ] Preview debounced; large-file pause honored; Monaco unchanged for v1.
- [ ] Format/Compact/Lint use canonical `-`/`_`/`#`; Compact stays conservative; on-save Format→Lint order.
- [ ] `just check`, `just verify-ui`, `just verify-smoke`, `just trace-check` all green.

## Gotchas

- `rehype-sanitize` missing or not last in the rehype list is the #1 way raw HTML/script gets
  through — see `references/troubleshooting.md` for the full symptom table.
- Never reference a CDN (`cdn`, `unpkg`, `jsdelivr`, Google Fonts `<link>`) at runtime — every
  rendering asset is bundled (DD-32); this is a repo-wide offline invariant, not a suggestion.
- Math/tables rendering as literal text at a lower standard level is **expected behavior**
  (EC-RENDER-6), not a bug — don't force plugins on below the level that owns them.
- Compact must stay conservative: never touch significant whitespace inside fenced/indented code
  (EC-FMT-3).
- The plugin mapping and the sanitize schema each live in exactly one file — resist the urge to
  special-case a standard level inside a component.

## Spec references

- `specification/01_Product/05_RENDERING_AND_EXTENSIONS.md`
- `specification/01_Product/04_MARKDOWN_STANDARDS.md`
- `specification/01_Product/06_FORMAT_AND_LINT.md`
- `specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md`
- `specification/02_Architecture/03_FRONTEND_REACT.md`
- `specification/06_Process_and_Traceability/01_MODULE_INVENTORY.md`
- `.claude/rules/ts-markdown-pipeline.md`, `.claude/rules/offline-and-privacy.md`
