**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `02_Architecture/01_SYSTEM_ARCHITECTURE.md`, `02_Architecture/04_WAILS_INTEGRATION.md`, `02_Architecture/06_ERROR_HANDLING.md`, `01_Product/05_RENDERING_AND_EXTENSIONS.md`, `01_Product/10_THEMING.md`, `06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `08_Decisions/ADR-0002`, `08_Decisions/ADR-0003`, `08_Decisions/ADR-0005`

# Frontend (React / TypeScript)

The frontend is React 19 + Vite + TypeScript, rendered inside the embedded webview (DD-04). It is
organized as a strict UI stack (`ui/widgets → ui/components → ui/primitives → ui/styles`) over a logic
layer (`logic/{store,adapter,theme,markdown,format,lint,hooks,utils}`, `i18n`, `dev/bridge-mock`). The
adapter layer is the single seam to the Go backend; everything else is pure TypeScript/React. The
frontend is a **view/controller over the Go-owned model** and holds no authoritative state: its store is
a projection reconciled from backend `state:*` events, and UI actions are commands (DD-62/DD-63;
`#state-ownership`).

## Table of Contents

1. Structure
2. Adapter layer
3. Store
4. State ownership
5. Theme
6. Components
7. Bridge mock
8. Markdown pipeline

## Structure

```
frontend/src/
  ui/
    styles/       tokens.css (3 themes x light/dark), base.css, print.css
    primitives/   Radix wrappers: Dialog, DropdownMenu, ContextMenu, Tabs, Switch,
                  Segmented, Select, Popover, Toast, Tooltip
    components/   Button, IconButton, Icon, Chip, TreeItem, TabBar, Toolbar, StatusBar,
                  MenuBar, Banner, MarkdownView, MermaidBlock, CodeEditor
    widgets/      EditorView, PreviewView, ReaderView, FileExplorer, SettingsDialog,
                  ShortcutsDialog, AboutDialog, ExternalContentBanner, AppMenuBar
  logic/
    adapter/      wailsjs wrappers (appModel, docs, workspace, settings, recent, export, assets, app)
                  + unwrap / guardArity  — the ONLY layer importing wailsjs/
    store/        Redux Toolkit slices (see #store)
    theme/        resolveEffectiveTheme, applyTheme, initTheme, watchSystemTheme
    markdown/     renderer.ts: per-standard remark/rehype sets, components override, mermaid
    format/       format.ts: Format + Compact (Prettier / remark-stringify)
    lint/         lint.ts: remark-lint runner + marker mapping
    hooks/        useShortcuts, useFileOpenEvent, useAutosave, useSystemTheme, useToast
    utils/        parseError, path/url helpers
  i18n/           i18n init + locales/en.json + t()
  dev/bridge-mock/ dev-only Wails bridge mock + Vite plugin wiring
```

The dependency direction is one-way down the UI stack and inward to `logic/`. Widgets read the store and
dispatch thunks; components are presentational; primitives supply Radix behavior/a11y; tokens supply all
visual values. Only `logic/adapter/` may import from `wailsjs/`.

## Adapter layer

`logic/adapter/` is the sole importer of the generated `wailsjs/` bindings and the Wails runtime. It
exposes typed singletons per backend vertical (`appModelAdapter`, `docsAdapter`, `workspaceAdapter`,
`settingsAdapter`, `recentAdapter`, `exportAdapter`, `assetsAdapter`, `appAdapter`) and two helpers:

```ts
// unwrap: throws + auto-toasts on an envelope error; returns data otherwise.
export function unwrap<T>(res: { data?: T; error?: apperr.WireError }): T {
    if (res.error) {
        store.dispatch(notifyError(res.error)); // auto-toast (see 06_ERROR_HANDLING.md #toasts)
        throw res.error;
    }
    return res.data as T;
}

// guardArity: rejects immediately on an arg-count mismatch (a raw Wails call would hang forever).
export function guardArity<TArgs extends unknown[], TResult>(
    methodName: string,
    bound: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult>;
```

An adapter method wraps a bound binding with `guardArity`, awaits the `Result`, and returns
`unwrap(res)`. Components and thunks call the adapter — never `wailsjs/` — so the envelope contract and
error toasting are centralized. The adapter also subscribes to Wails events (e.g. `state:patch`,
export progress) and dispatches them into the store (`04_WAILS_INTEGRATION.md` `#lifecycle`; see
`#state-ownership` below).

## Store

Redux Toolkit, one slice per feature (no cross-slice reducers). Slices:

`documents` · `tabs` · `workspace` · `settings` · `ui` · `theme` · `recent` · `lint` · `notifications`.

**The store is a projection of the backend model, not the source of truth (DD-62/DD-63;
`#state-ownership`).** Its slices are a **view-model cache** of `internal/appmodel`'s state: they are
hydrated once from `appModelAdapter.getState()` and thereafter reconciled by `state:*` events; reducers
mostly apply backend patches rather than invent state. Document **content is not stored here** — the
slice holds a document's metadata (path, dirty, encoding, counts) for rendering tabs/status, while the
canonical buffer lives in `internal/appmodel` (DD-64).

A UI interaction dispatches a **command** thunk (adapter → Go handler → envelope → `unwrap`); the backend
mutates the model and emits a `state:*` event that updates the projection — the thunk itself does not
optimistically own the result. Commands use `createAsyncThunk` with the three-generic signature and a
typed `rejectValue` carrying the envelope error, so components can branch on `WireError.code`:

```ts
// Command: ask the backend to save its authoritative buffer. No document content is read
// from the store — the backend owns it. Pending editor edits are flushed first (DD-64).
export const saveDocument = createAsyncThunk<
    void,                                        // Returned (state arrives via state:* event)
    { tabId: string },                           // ThunkArg
    { state: RootState; rejectValue: WireError }  // ThunkApiConfig
>('documents/save', async ({ tabId }, { rejectWithValue }) => {
    try {
        await appModelAdapter.flushBuffer(tabId); // push any debounced edit (DD-64)
        await docsAdapter.save({ tabId });        // backend saves its own canonical content
    } catch (e) {
        return rejectWithValue(parseError(e)); // logic/utils/parseError normalizes unknown → WireError
    }
});
```

Command → adapter → `wailsjs/` → Go handler → envelope → `unwrap` (`01_SYSTEM_ARCHITECTURE.md`
`#data-flow`); the resulting model change returns as a `state:patch` event. The store is created once and
imported by `unwrap`/`notifyError` for auto-toasting.

## State ownership

The frontend holds **no authoritative application state** (DD-63). The Redux store is a derived,
disposable **projection** of the Go-owned model (`02_BACKEND_GO.md#application-model`); the only state the
webview genuinely owns is **ephemeral view scaffolding** — the visible document's Monaco buffer (a working
copy, DD-64), transient focus/scroll, and dialog-open flags — and `localStorage` is used **only** for such
throwaway values, never as a second source of truth.

**Hydrate then reconcile.** On startup / window-open the adapter calls the query and seeds the projection;
thereafter it subscribes to backend `state:*` events and applies each patch:

```ts
// logic/adapter — hydrate once, then reconcile from backend events.
const snapshot = unwrap(await appModel.GetState());   // full AppState projection
store.dispatch(hydrateState(snapshot));
runtime.EventsOn('state:patch', (patch: AppStatePatch) => store.dispatch(applyStatePatch(patch)));
```

**Active buffer sync (DD-64).** `CodeEditor`'s `onChange` updates Monaco immediately and debounce-pushes
the text to the backend; the backend is authoritative and never echoes text back into the focused editor
(which would move the cursor). Other views (tab dirty dot, status-bar counts, preview source) render from
the backend's derived state delivered via `state:patch`:

```ts
const pushBuffer = useDebouncedCallback(
    (tabId: string, text: string) => appModelAdapter.updateBuffer(tabId, text), // command → model (DD-64)
    BUFFER_SYNC_MS,
);
// on blur / tab switch / close / save the pending push is flushed first (appModelAdapter.flushBuffer).
```

Because inactive documents' content lives only in Go, webview memory stays bounded to the visible
document (`02_BACKEND_GO.md#application-model`, `07_LARGE_FILES_AND_CONCURRENCY.md#large-file-strategy`).

## Theme

`logic/theme/` resolves the active appearance and applies it to `document.documentElement`. GoMarkEdit
drives **two** attributes so three
themes × light/dark coexist under one layout (DD-28, DD-29, DD-30; ADR-0005):

```ts
export function resolveEffectiveTheme(mode: 'auto' | 'light' | 'dark'): 'light' | 'dark' {
    if (mode === 'dark' || mode === 'light') return mode;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: 'liquid-glass' | 'material' | 'minimal', effective: 'light' | 'dark'): void {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);   // which token set
    root.setAttribute('data-mode', effective); // light | dark within it
}

export function initTheme(theme: ThemeId, mode: ThemeMode): 'light' | 'dark';
export function watchSystemTheme(mode: ThemeMode, onChange: (eff: 'light' | 'dark') => void): () => void;
```

`watchSystemTheme` subscribes to `prefers-color-scheme` and updates live while mode is `auto` (DD-29);
it returns an unsubscribe. Editor and preview themes are unified — one selection drives both. All colors
resolve from `var(--…)` tokens in `ui/styles/tokens.css`; no component hardcodes a color.

## Components

Three components are the visual core of the app:

- **`CodeEditor`** — a thin Monaco wrapper (DD-20; ADR-0002). Exposes an `onEditorMounted` callback
  yielding the `IStandaloneCodeEditor`, plus `wordWrap`, `minimap`, `languageId="markdown"`, `height`,
  and `onChange`. Monaco handles very large files; live preview is what must be throttled
  (`07_LARGE_FILES_AND_CONCURRENCY.md`).
- **`MarkdownView`** — renders through `logic/markdown` (see `#markdown-pipeline`) with the standard-
  aware plugin set and the `components` override.
- **`MermaidBlock`** — async component that intercepts ` ```mermaid ` fences and renders the diagram;
  bundled Mermaid, no CDN (DD-32).

All other components are presentational and token-driven; behavior/a11y come from `ui/primitives`
(Radix). The reading mode (`ReaderView`) hides all chrome (DD-30).

## Bridge mock

`dev/bridge-mock/` lets the UI run without the Go backend for fast frontend iteration. A Vite plugin
(`enforce: 'pre'`) redirects `wailsjs/` handler and runtime imports to mock modules, active **only** in
plain `npm run dev` — never in `npm run dev -- --mode wails` (real bridge) or production builds:

```ts
function bridgeMockPlugin(): Plugin {
    return {
        name: 'vite-plugin-bridge-mock',
        enforce: 'pre',
        resolveId(id) {
            const h = id.match(/wailsjs\/go\/(?:[^/]+)\/(\w+Handler)$/);
            if (h) return path.resolve(__dirname, `src/dev/bridge-mock/go/main/${h[1]}.ts`);
            if (/wailsjs\/runtime$/.test(id)) return path.resolve(__dirname, 'src/dev/bridge-mock/runtime/index.ts');
            return undefined;
        },
    };
}
// isMockMode = mode !== 'wails' && mode !== 'production'
```

`just dev-ui` runs this mock target; `just dev` runs the real `wails dev` bridge. Mock handlers return
plausible `Result` envelopes so the whole store/adapter/UI path exercises the same contract as
production.

## Markdown pipeline

`logic/markdown/renderer.ts` centralizes the render configuration, made
standard-aware (DD-14, DD-19; ADR-0003). Base pipeline: **react-markdown + remark-gfm + remark-math +
rehype-katex + rehype-highlight**, with a `components` override that intercepts ` ```mermaid ` fences
into the async `MermaidBlock`:

```ts
const markdownComponents: Components = {
    code({ className, children, ...rest }) {
        const lang = /language-(\w+)/.exec(className ?? '')?.[1];
        if (lang === 'mermaid') return <MermaidBlock src={String(children).trim()} />;
        return <code className={className} {...rest}>{children}</code>;
    },
};
```

The active plugin set is selected by the Markdown-standard setting (DD-14):

| Standard | remark | rehype |
|---|---|---|
| **Minimal (CommonMark)** | — | `rehype-highlight` |
| **GFM** (default) | `remark-gfm` | `rehype-highlight` |
| **Full** | `remark-gfm`, `remark-math`, footnotes, directives/admonitions, frontmatter | `rehype-katex`, `rehype-highlight` |

All assets (KaTeX fonts, Mermaid, highlight themes) are bundled; the pipeline makes no network request
(DD-32; `03_NonFunctional/04_OFFLINE.md`). Remote *document* assets are governed by the content policy
and the guarded asset server, not by this pipeline (`09_ASSETS_AND_SECURITY.md`). Sanitization,
preview debounce, and the standard→plugin mapping are specified normatively in
`01_Product/05_RENDERING_AND_EXTENSIONS.md`.
