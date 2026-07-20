# Theme Resolution and Application

How `logic/theme/` resolves an appearance to a concrete mode, applies it to the DOM, watches the
OS live, and how the unified editor+preview theme and reading-mode chrome-hiding build on top of it.

## The core rule

Resolve `auto` to a concrete `light`/`dark` **before** calling `applyTheme` — **never** leave
`data-mode="auto"` on the DOM. Subscribe to `prefers-color-scheme` changes **only while appearance
is `auto`**, and re-resolve live when the OS toggles (**EC-THEME-1**). Both `data-theme` and
`data-mode` are set on `document.documentElement` — **never an inner div** — so portals and
overlays (which React/Radix render at `<body>`, outside the app's own DOM subtree) inherit the
theme correctly instead of rendering unstyled.

## `frontend/src/logic/theme/index.ts`

```ts
// frontend/src/logic/theme/index.ts
export type ThemeName = 'glass' | 'material' | 'minimal';
export type Appearance = 'auto' | 'light' | 'dark';
export type EffectiveMode = 'light' | 'dark';

export function resolveEffectiveTheme(appearance: Appearance): EffectiveMode {
  if (appearance === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return appearance;
}

export function applyTheme(theme: ThemeName, mode: EffectiveMode): void {
  const root = document.documentElement;          // NEVER an inner div — portals must inherit
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-mode', mode);           // 'auto' already resolved above
}

export function watchSystemTheme(onChange: (mode: EffectiveMode) => void): () => void {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => onChange(e.matches ? 'dark' : 'light');
  mql.addEventListener('change', handler);        // subscribe ONLY while appearance === 'auto'
  return () => mql.removeEventListener('change', handler); // return the unsubscribe
}
```

There is also an `initTheme` entry point (referenced by the module inventory and the spec) that
runs this resolve → apply sequence once at startup, reading the persisted theme/appearance from
settings before any UI paints, so the app never flashes an unstyled or wrong-theme frame.

### Call-site pattern

```ts
// on startup, and whenever the user changes theme/appearance in Settings:
const mode = resolveEffectiveTheme(appearance);
applyTheme(theme, mode);

// only while appearance === 'auto', keep a live subscription and tear it down otherwise:
let unsubscribe: (() => void) | null = null;
if (appearance === 'auto') {
  unsubscribe = watchSystemTheme((liveMode) => applyTheme(theme, liveMode));
} else {
  unsubscribe?.();
  unsubscribe = null;
}
```

Getting this ordering backwards — applying before resolving, or subscribing unconditionally
regardless of appearance — is the single most common defect in this area; see
`troubleshooting.md` for the exact symptom this produces.

## Unified editor + preview theming (DD-29)

A **single** theme+appearance selection drives **both** the editor and the preview/reader — there
is no separate "editor theme" setting. Monaco's editor colors, the preview typography, code-
highlight colors, and Mermaid SVG fills all read from the **same** token set, so the whole window
stays visually consistent. When wiring a new themed surface (a new Monaco theme definition, a new
Mermaid render target, a new highlight.js style), source its colors from the active `--…` tokens —
do not give it an independent palette.

## Reading / Viewer mode chrome (DD-30, EC-THEME-2)

Reading mode is the distraction-free reading state (`specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md`).
It hides **all** chrome — menu bar, folder sidebar, tab bar, formatting toolbar, and status bar —
via a `.reader` class / tokens layered over the **same shared layout**, **not** by unmounting or
rebuilding the layout tree:

```css
.reader { background: var(--bg); color: var(--ink); }
.reader .app-chrome { display: none; }   /* hide chrome via tokens/class, not layout surgery */
```

The theme still applies while reading — switching theme or appearance mid-read restyles the reader
**live** (**EC-THEME-2**), because the reader reads the same root-level `data-theme`/`data-mode`
tokens as the rest of the app. If a theme/appearance change requires special-casing the reader
separately from the rest of the UI, that is a sign the chrome-hiding was implemented as a separate
render tree instead of a CSS-level `.reader` overlay — back out and use the class/token approach.

## Portals inherit from root

Because `data-theme`/`data-mode` live on `document.documentElement`, any element rendered outside
the normal React tree — a Radix `Portal`, a native `<dialog>`, a toast container appended to
`<body>` — still resolves `var(--…)` correctly, since CSS custom property inheritance follows the
DOM tree from the document root, not the React component tree. Setting either attribute on an
inner wrapper `<div>` instead breaks this for every portal-rendered surface (see
`troubleshooting.md`).
