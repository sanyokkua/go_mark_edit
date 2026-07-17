---
paths:
  - "frontend/src/**/*.ts"
  - "frontend/src/**/*.tsx"
---

# TypeScript / React frontend

**Authority:** `specification/00_Foundation/04_DESIGN_DECISIONS.md` (DD-04, DD-62, DD-63, DD-64),
`specification/06_Process_and_Traceability/01_MODULE_INVENTORY.md` (frontend modules),
`specification/02_Architecture/03_FRONTEND_REACT.md` (incl. `#state-ownership`),
`docs/adr/0014-backend-authoritative-state.md`. Frontend source lives under `frontend/src/`.

Stack: **React 19 + Vite + TypeScript (strict)**, rendered in the embedded webview.

## The frontend holds no authoritative state (DD-62/DD-63)

The frontend is a **thin view/controller over the Go-owned model** — it is **MVC's View/Controller**, with
the Go backend (`internal/appmodel`) as the Model and single source of truth (DD-62). It holds **no
authoritative application state**:

- **Render projection state.** Components read the Redux **projection** (a view-model cache hydrated via
  `GetState` and reconciled by backend `state:*` events, DD-63; see `ts-redux-adapter.md`) — not a local
  source of truth for documents, tabs, workspace, or UI/layout.
- **Emit commands.** A user interaction dispatches a **command** to the backend (via a store thunk →
  `logic/adapter`), which mutates the model and emits the resulting `state:patch`; the UI re-renders from
  it. Components never own model truth or optimistically fork it.
- **Only the visible editor buffer is webview-owned.** The active Monaco buffer is a working copy that
  updates the webview immediately and **debounce-syncs** to Go via `UpdateBuffer` (DD-64), flushed on
  blur / tab switch / close / save. The backend stays authoritative for content/dirty/autosave/save and
  **never echoes buffer text back into the focused editor** (which would move the cursor). Inactive
  documents' content is never held in the webview. Other ephemeral webview state (transient focus/scroll,
  dialog-open flags) is scaffolding only, never a second source of truth.

## DO

- Write **function components** typed `React.FC<Props>` (or `(props: Props) => JSX.Element`) with an
  explicit `Props` interface. Type every public function's params and return.
- Render from the **projection** and mutate via **commands** — a component reads store selectors and
  dispatches command thunks; it never treats local component/store state as authoritative model truth
  (DD-63).
- Keep TypeScript **strict**: no `any`. Prefer `unknown` + a narrowing guard when a type is genuinely
  open; model envelope errors through `parseError` (`logic/utils`).
- Style with **CSS Modules** (`Component.module.css`) reading `var(--...)` tokens; see
  `ts-theming-tokens.md`.
- Keep presentational components (`ui/components/`) free of store/adapter imports; wire data in
  `ui/widgets/`. Shared components (`CodeEditor`, `MarkdownView`, `MermaidBlock`) keep their token-driven
  theming. `CodeEditor`'s `onChange` debounce-pushes the buffer to Go and flushes on blur (DD-64).
- Route all user-facing strings through the `i18n` `t()` layer (DD-35).

## DON'T

- **Don't hold authoritative model state in the frontend** — no local-truth store of documents, tabs,
  workspace, or UI/layout; those live in `internal/appmodel` (DD-62). Don't mutate them optimistically
  ahead of the backend's `state:patch`.
- **Don't keep document content in the webview** beyond the visible Monaco buffer, and don't read that
  buffer as a source of truth for anything but the debounced `UpdateBuffer` sync (other views read the
  backend's derived state, DD-64).
- No `any`, no `@ts-ignore`/`@ts-expect-error` to silence a real type error, no non-null `!` to dodge a
  guard.
- No inline `style={{...}}` for static styling -- use a CSS Module class. A single dynamic one-off
  (e.g. a computed `width`/`transform`) is the only acceptable inline style.
- No hardcoded colors, hex, or `rgb()` in TSX/CSS -- tokens only.
- No importing from `wailsjs/` in a component -- go through `logic/adapter/` (see `ts-redux-adapter.md`).

## Authoring checklist

- [ ] Component renders **projection** state and mutates the model only via **commands** — no
      authoritative local model state (DD-62/DD-63).
- [ ] Only the visible Monaco buffer is webview-owned; it debounce-syncs to Go and flushes on
      blur/switch/close/save; no inactive-doc content held; no buffer echoed into the focused editor (DD-64).
- [ ] Component is a typed function component with an explicit `Props` interface.
- [ ] No `any`/`@ts-ignore`; `tsc --noEmit` clean for touched files.
- [ ] Styling via CSS Modules + tokens; no static inline styles, no hardcoded colors.
- [ ] User-facing strings go through `t()`.
- [ ] No direct `wailsjs/` import.
