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
| `@monaco-editor/react`, `monaco-editor` | The source editor engine — Monaco for v1 (DD-20), wrapped by the `CodeEditor` component. Handles large files; syntax-highlighted Markdown source (DD-09). |

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
| `remark-footnotes` | Footnote syntax (where not already covered by GFM). | Full |

The Minimal (CommonMark) tier uses react-markdown's base plugins only. `logic/markdown/renderer.ts`
maps standard → plugin set (`02_Architecture/01_MODULE_INVENTORY.md`).

## 3. Format & lint (Markdown)

Format (pretty-print) and Compact (conservative whitespace-tighten) are **frontend operations**
(DD-16, DD-18); Lint surfaces consistency findings as editor squiggles + a status-bar count (DD-17).

| Package | Purpose |
|---|---|
| `prettier` (+ its Markdown parser) | "Format" pretty-print: pad tables, normalise markers, wrap. |
| `remark` | remark processor entry for programmatic transforms. |
| `remark-parse`, `remark-stringify` | Parse ↔ serialize for "Compact" and canonical-style stringify (bullet `-`, emphasis `_`, ATX headings — DD-18). |
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
| `react-to-print` *(or an equivalent thin print-window helper)* | Trigger a print-scoped render of the current document; the OS print dialog produces the PDF. If a bespoke print-window approach is simpler under Wails, it may replace this dep — decided in the export story. |

The print stylesheet (theme-styled vs clean, DD-24) lives in `ui/styles/` — not an npm dep.

## 5. State, UI primitives, i18n, utils

| Package | Purpose |
|---|---|
| `@reduxjs/toolkit`, `react-redux` | State management — one slice per feature. The store is a **projection** of the Go-owned application model, not a source of truth (DD-62/DD-63): thunks dispatch commands (thunk → adapter → wailsjs → Go) and slices reconcile backend `state:patch` events. |
| `radix-ui` (Primitives) | Behaviour + accessibility for Dialog, DropdownMenu, ContextMenu, Tabs, Switch, Select, Popover, Toast, Tooltip. Visuals come from the token layer, not Radix themes. |
| `uuid` | Client-side correlation ids (e.g. agent run ids, toast/notification ids). Tab/document ids are minted by the backend model (DD-62), not the frontend. |
| i18n layer — **`i18next`** *(or a tiny custom `t()` layer)* | All user-facing strings routed through i18n; English-only in v1, adding a locale = a new resource file, no code change (DD-35). A minimal custom layer is acceptable if i18next is heavier than needed — decided in the i18n story. |

## 6. Dev / tooling

| Package | Purpose |
|---|---|
| `vite`, `@vitejs/plugin-react` | Build + dev server; `vite build` produces `frontend/dist` embedded by Go. |
| `typescript` | Strict type-checking (`tsc --noEmit` gate). |
| `eslint` (+ React/hooks plugins, `typescript-eslint`) | Linting. |
| `prettier` (+ `prettier-plugin-organize-imports`) | Formatting (also used at runtime for Markdown "Format", §3). |
| `jest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jest-environment-jsdom`, `jest-axe` | Unit/behavioural tests with a11y queries. |
| `@playwright/test` / `playwright` | `verify:ui` + `verify:smoke` responsive/interaction gates. |
| `lefthook` | Git hook installer (`04_Build_and_Release/03_CI_AND_HOOKS.md`). |

## 7. Must-bundle-for-offline assets

These carry non-JS assets (fonts/CSS/workers) that **must ship inside the app** — never fetched from a
CDN at runtime (DD-32). Bundling is a Vite concern (import the CSS/fonts so they land in
`frontend/dist`):

- **KaTeX fonts + `katex.min.css`** — import the CSS and ensure the font files are emitted as bundled
  assets. A missing font at runtime would silently degrade math rendering with no network fallback.
- **highlight.js theme CSS** — the chosen light/dark highlight themes are imported and tokenised, not
  linked from a CDN.
- **Mermaid** — bundled; it renders entirely client-side. Confirm no runtime font/CDN fetch in the
  Mermaid config (use bundled fonts).
- **Monaco** — its workers/assets are served from the bundle by the Vite Monaco setup, not a CDN.

Any asset that cannot be bundled is a blocker for that feature under the offline rule.

## 8. Explicitly excluded

| Excluded | Replaced by |
|---|---|
| `next` (Next.js) | **Vite + React** (DD-04). GoMarkEdit is a Wails desktop app; there is no Next.js server, routing, or static-export step. Next/PWA/service-worker machinery does not apply. |
| `browser-fs-access` | **Native Wails dialogs** (`internal/docs` via `runtime.OpenFileDialog` / `SaveFileDialog`). File I/O goes through the Go backend, not a browser file-picker shim. |

Utility packages unrelated to Markdown (e.g. `sql-formatter`, `qrcode`, `cron-parser`,
`js-md5`, `jsonpath-plus`, `smol-toml`) are **not** carried — GoMarkEdit ships only the
Markdown/editor/render/format/lint stack it needs.
