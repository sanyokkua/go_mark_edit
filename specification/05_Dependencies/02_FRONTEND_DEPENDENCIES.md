**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md` (DD-04, DD-14, DD-16..20, DD-23, DD-32, DD-35), `02_Architecture/01_MODULE_INVENTORY.md`, `02_Architecture/03_FRONTEND_REACT.md`, `05_Dependencies/03_DEPENDENCY_POLICY.md`

# Frontend Dependencies

The `frontend/package.json` dependency set. GoMarkEdit's frontend is **React 19 + Vite + TypeScript**
(DD-04), rendered in the embedded webview. The runtime deps form a proven Markdown pipeline chosen for
GoMarkEdit; a couple of alternatives are **excluded** because GoMarkEdit is a Wails app, not a
Next.js web app. Everything the renderer needs at runtime must be **bundled for offline** (DD-32) —
no CDN, ever.

## Table of Contents

1. [Core runtime](#1-core-runtime)
2. [Markdown rendering pipeline](#2-markdown-rendering-pipeline)
3. [Format & lint (Markdown)](#3-format--lint-markdown)
4. [Export / print](#4-export--print)
5. [State, UI primitives, i18n, utils](#5-state-ui-primitives-i18n-utils)
6. [Dev / tooling](#6-dev--tooling)
7. [Must-bundle-for-offline assets](#7-must-bundle-for-offline-assets)
8. [Explicitly excluded](#8-explicitly-excluded)

## 1. Core runtime

| Package | Purpose |
|---|---|
| `react`, `react-dom` | UI runtime (React 19, DD-04). |
| `@monaco-editor/react`, `monaco-editor` | The source editor engine — Monaco for v1 (DD-20), wrapped by the `CodeEditor` component. Handles large files; syntax-highlighted Markdown source (DD-09). **Must be wired as described in §7 — the default loader fetches Monaco from a CDN.** |
| `lucide-react` | The icon set (DD-69). Monochrome SVG icons that inherit `currentColor`, so every icon takes its colour from a token. Tree-shaken — only imported icons ship. |

## 2. Markdown rendering pipeline

The renderer is **react-markdown + remark/rehype** (DD-19), with a `components` override that
intercepts ` ```mermaid ` fences into an async `MermaidBlock`. Plugin sets are selected per Markdown
standard (Minimal / GFM / Full, DD-14).

| Package | Purpose | Standard tier |
|---|---|---|
| `react-markdown` | Core Markdown → React renderer. | all |
| `remark-gfm` | GitHub-Flavored Markdown (tables, task lists, strikethrough, autolinks). | GFM, Full |
| `remark-math` | Parse `$…$` / `$$…$$` math into nodes. | Full |
| `rehype-katex` | Render math nodes via KaTeX. | Full |
| `katex` | Math typesetting engine (+ its fonts — see §7). | Full |
| `rehype-highlight` | Code-block syntax highlighting. | GFM, Full |
| `highlight.js` | Highlight engine + themes (see §7). | GFM, Full |
| `mermaid` | Diagram rendering for ` ```mermaid ` fences via the async `MermaidBlock`. | GFM, Full |
| `remark-frontmatter` | Parse/round-trip YAML/TOML frontmatter blocks. | Full |
| `remark-directive` | Admonitions / directive containers (`:::note`). | Full |
| `rehype-raw` | Reparse raw HTML into the tree. **Full only** — Minimal and GFM escape raw HTML, which is react-markdown's default and needs no package. | Full |
| `rehype-sanitize` | Apply the allowlist from `01_Product/19_SANITIZATION_AND_CSP.md`. Runs **after** `rehype-raw`. Its stock schema strips KaTeX's MathML and highlight.js's `className`, so it is always configured with the extension that document specifies — otherwise Full renders *less* than GFM. | Full |

The Minimal (CommonMark) tier uses react-markdown's base plugins only. `logic/markdown/renderer.ts`
maps standard → plugin set (`02_Architecture/01_MODULE_INVENTORY.md`).

## 3. Format & lint (Markdown)

Format (pretty-print) and Compact (conservative whitespace-tighten) are **frontend operations**
(DD-16, DD-18); Lint surfaces consistency findings as editor squiggles + a status-bar count (DD-17).

| Package | Purpose |
|---|---|
| `remark` | remark processor entry for programmatic transforms. |
| `remark-parse`, `remark-stringify` | Parse ↔ serialize for **both** Format and Compact. `remark-stringify` is the only serializer (ADR-0031): its `bullet` / `emphasis` / `strong` / `setext` / `fence` / `incrementListMarker` options are what make DD-18's user-overridable canonical style implementable. Prettier has no option for any of them and is **not** a runtime dependency. |
| `remark-lint` | Lint runner. |
| `remark-preset-lint-consistent` | Baseline consistency preset. |
| `remark-lint-unordered-list-marker-style` | Enforce the canonical list marker (`-`). |

Additional `remark-lint-*` rules (emphasis style, heading style) are added as the Format/Lint story
specifies. `logic/format/` and `logic/lint/` own these (`01_Product/06_FORMAT_AND_LINT.md`).

## 4. Export / print

PDF export uses the **webview print path** (`window.print()` against a print-scoped copy of the
rendered preview) — DD-23. v1 does not add paginated-layout controls.

| Package | Purpose |
|---|---|
| *(none — no print dependency)* | Export mounts its own off-screen print root and calls `window.print()`. `react-to-print`'s value is cloning a node into an iframe and copying stylesheets; under Wails a print root we control gives the same result with no dependency and no stylesheet-copying edge cases. `01_Product/07_EXPORT.md#print-scope` owns the mechanism. |

The print stylesheet (theme-styled vs clean, DD-24) lives in `ui/styles/` — not an npm dep.

## 5. State, UI primitives, i18n, utils

| Package | Purpose |
|---|---|
| `@reduxjs/toolkit`, `react-redux` | State management — one slice per feature. The store is a **projection** of the Go-owned application model, not a source of truth (DD-62/DD-63): thunks dispatch commands (thunk → adapter → wailsjs → Go) and slices reconcile backend `state:patch` events. |
| `radix-ui` (Primitives) | Behaviour + accessibility for Dialog, DropdownMenu, ContextMenu, Tabs, Switch, Select, Popover, Toast, Tooltip. Visuals come from the token layer, not Radix themes. |
| Monaco `DiffEditor` (from `@monaco-editor/react`, already a dependency) | The reusable diff view (F9), consumed by Format review and by the assistant's edit proposals. Costs no additional bytes and brings keyboard navigation and the generated editor theme with it — preferred over adding a `diff` package. |
| `uuid` | Client-side correlation ids (e.g. agent run ids, toast/notification ids). Tab/document ids are minted by the backend model (DD-62), not the frontend. |
| i18n layer — **`i18next`** *(or a tiny custom `t()` layer)* | All user-facing strings routed through i18n; English-only in v1, adding a locale = a new resource file, no code change (DD-35). A minimal custom layer is acceptable if i18next is heavier than needed — decided in the i18n story. |

## 6. Dev / tooling

| Package | Purpose |
|---|---|
| `vite`, `@vitejs/plugin-react` | Build + dev server; `vite build` produces `frontend/dist` embedded by Go. |
| `typescript` | Strict type-checking (`tsc --noEmit` gate). |
| `eslint` (+ React/hooks plugins, `typescript-eslint`) | Linting. |
| `prettier` (+ `prettier-plugin-organize-imports`) | Formatting **this repository's own source**. It is a dev dependency only and is never shipped: the app's Markdown "Format" uses `remark-stringify` (§3, ADR-0031). |
| `jest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jest-environment-jsdom`, `jest-axe` | Unit/behavioural tests with a11y queries. |
| `@playwright/test` / `playwright` | `verify:ui` + `verify:smoke` responsive/interaction gates. |
| `lefthook` | Git hook installer (`04_Build_and_Release/03_CI_AND_HOOKS.md`). |

## 7. Must-bundle-for-offline assets

These carry non-JS assets (fonts/CSS/workers) that **must ship inside the app** — never fetched from a
CDN at runtime (DD-32). Bundling is a Vite concern (import the CSS/fonts so they land in
`frontend/dist`):

- **UI fonts — Roboto and Inter**, as woff2 subsets under `frontend/src/ui/fonts/`, declared with
  `@font-face` and imported at the app entry. `01_Product/10_THEMING.md` gives Material Roboto and
  Minimal Inter, and neither can be assumed present on a user's machine. Unbundled, two of the three
  themes silently fall back to the same system stack and stop being distinguishable — a checkable
  failure, which `EC-THEME-5` and the visual gate's non-serif assertion detect.
- **KaTeX fonts + `katex.min.css`** — import the CSS **at the app entry**, not inside the preview
  module, so maths styling does not depend on a lazily-loaded chunk having arrived. Vite emits the
  ~60 font files as bundled assets. A missing font at runtime would silently degrade math rendering
  with no network fallback.
- **The highlight stylesheet is generated, not imported.** Do **not** import a stock
  `highlight.js/styles/*.css` — it would hard-code colours outside the token system. The build emits a
  token→`hljs-*` stylesheet from the `--hl-*` family (ADR-0029). Shipping `rehype-highlight` with no
  stylesheet at all — which is what both reference implementations do — renders every code block in one
  colour while paying the full parsing cost.
- **Mermaid** — bundled, and loaded through a **dynamic `import('mermaid')`** so its ~1 MB lands in its
  own chunk rather than the entry bundle; a user who never opens a diagram should not pay for it at cold
  start. Confirm no runtime font/CDN fetch in the Mermaid config.
- **Monaco** — the default `@monaco-editor/react` loader resolves `vs/` from
  `https://cdn.jsdelivr.net/npm/monaco-editor@…`, which under this app's CSP produces a **silently blank
  editor pane**. It is not a theoretical risk: a shipped reference implementation has that URL in its
  production bundle and its offline service worker never caches it. The wiring is therefore normative:

  ```ts
  import * as monaco from 'monaco-editor';
  import { loader } from '@monaco-editor/react';
  loader.config({ monaco });        // before the first <Editor> mounts; bypasses the AMD loader
  ```

  Workers come from Vite's `?worker` suffix with an explicit `MonacoEnvironment`. GoMarkEdit edits
  **Markdown only**, so it needs exactly one — `monaco-editor/esm/vs/editor/editor.worker?worker` — not
  the five-worker TypeScript/JSON/CSS/HTML boilerplate. This requires `worker-src 'self' blob:` in the
  CSP (`03_NonFunctional/03_SECURITY_AND_PRIVACY.md`).

Any asset that cannot be bundled is a blocker for that feature under the offline rule.

**Two gates make this section true rather than aspirational** (`04_Build_and_Release/03_CI_AND_HOOKS.md`):

1. After `vite build`, assert that **no file in `frontend/dist` contains** `jsdelivr`, `unpkg`, `cdn.`
   or `googleapis`, and that the KaTeX fonts, the generated highlight stylesheet, the UI fonts and the
   Monaco worker chunk are all present.
2. Run the Playwright "the editor is taller than 200px" check **with the network aborted**. The same
   assertion passes trivially against a live network and is a genuine offline regression test without
   one.

## 8. Explicitly excluded

| Excluded | Replaced by |
|---|---|
| `next` (Next.js) | **Vite + React** (DD-04). GoMarkEdit is a Wails desktop app; there is no Next.js server, routing, or static-export step. Next/PWA/service-worker machinery does not apply. |
| `browser-fs-access` | **Native Wails dialogs** (`internal/docs` via `runtime.OpenFileDialog` / `SaveFileDialog`). File I/O goes through the Go backend, not a browser file-picker shim. |

Utility packages unrelated to Markdown (e.g. `sql-formatter`, `qrcode`, `cron-parser`,
`js-md5`, `jsonpath-plus`, `smol-toml`) are **not** carried — GoMarkEdit ships only the
Markdown/editor/render/format/lint stack it needs.
