---
paths:
  - "frontend/src/logic/**"
---

# TypeScript Redux + adapter boundary

**Authority:** `specification/00_Foundation/04_DESIGN_DECISIONS.md` (DD-62, DD-63, DD-64),
`specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership`,
`specification/02_Architecture/01_SYSTEM_ARCHITECTURE.md#data-flow`,
`specification/02_Architecture/02_BACKEND_GO.md#application-model`, `docs/adr/0014-backend-authoritative-state.md`,
`specification/02_Architecture/01_MODULE_INVENTORY.md` (`logic/store/`,
`logic/adapter/`). The adapter layer lives in `logic/adapter/{envelope.ts,bridgeGuard.ts,services.ts,index.ts}`.

Data flow: **component -> Redux thunk (command) -> `logic/adapter` singleton -> `wailsjs/` binding -> Go handler**,
and the `apperr.*Result` envelope back, followed by a backend **`state:*`** event that reconciles the store.

## The store is a projection, not a source of truth (DD-62/DD-63)

The Go backend (`internal/appmodel`) is the **single source of truth** for the whole live application model
— open documents + canonical content, the tab set + active tab, the workspace ref, and all UI/layout state
(DD-62). The Redux store is a **derived, disposable projection / view-model cache** of that model (DD-63):

- **Hydrate once** from the backend via the `GetState` query on startup / window-open, then **reconcile**
  from backend `state:*` events (`state:patch`) — reducers mostly apply backend patches rather than invent
  state.
- **Dispatch commands, not local-truth mutations.** Every UI interaction is a command thunk to the backend
  (`OpenDoc`/`CloseTab`/`SetActiveTab`/`ReorderTabs`/`UpdateBuffer`/`SetDocView`/`OpenWorkspace`/`SetUILayout`/…);
  the backend mutates the model and emits the resulting `state:patch`. There is **no optimistic local
  ownership** of model data — the projection updates when the event arrives.
- **Hold no document content.** The store keeps only document **metadata** (path, dirty, encoding, counts,
  view state) for rendering tabs/status. The canonical buffer lives in `internal/appmodel`; the only text
  the webview owns is the **visible Monaco buffer**, which debounce-syncs to Go via `UpdateBuffer` and is
  flushed on blur/switch/close/save (DD-64). Inactive documents' content is never held in the store.
- **`localStorage` for ephemeral only** — transient view scaffolding (dialog-open flags, throwaway UI
  hints), never a second source of truth for model data.

## DO

- One **slice per feature** (`documents`, `tabs`, `workspace`, `settings`, `ui`, `theme`, `recent`,
  `lint`, `notifications`) in `logic/store/`, composed in `store/index.ts` — each a **projection** of the
  corresponding backend model section, reconciled by `state:patch`.
- Hydrate the projection once and subscribe to `state:*` in the adapter:

  ```ts
  const snapshot = unwrap(await appModel.GetState());     // full AppState projection (DD-63)
  store.dispatch(hydrateState(snapshot));
  runtime.EventsOn('state:patch', (patch: AppStatePatch) => store.dispatch(applyStatePatch(patch)));
  ```

- Model a UI interaction as a **command** thunk; the returned state arrives via `state:patch`, not the
  thunk's fulfilled payload. Type thunks with the **three generics + `rejectValue`**:

  ```ts
  // Command: save the backend's authoritative buffer. No content is read from the store — the backend
  // owns it. Pending editor edits are flushed first (DD-64).
  export const saveDocument = createAsyncThunk<void, { tabId: string }, { rejectValue: WireError }>(
    'documents/save',
    async ({ tabId }, { rejectWithValue }) => {
      try {
        await appModelAdapter.flushBuffer(tabId);  // push any debounced edit (DD-64)
        await appModelAdapter.saveDoc({ tabId });   // backend saves its own canonical content
      } catch (e) {
        return rejectWithValue(parseError(e));
      }
    },
  );
  ```

- Debounce-sync the visible Monaco buffer to the backend and flush before any action that reads it:

  ```ts
  const pushBuffer = useDebouncedCallback(
    (tabId: string, text: string) => appModelAdapter.updateBuffer(tabId, text),  // command → model (DD-64)
    BUFFER_SYNC_MS,
  );
  // on blur / tab switch / close / save → appModelAdapter.flushBuffer(tabId) first.
  ```

- Put **all** `wailsjs/` imports in `logic/adapter/` only. Wrap each generated binding once with
  `guardArity(name, bound)` (rejects on arg-count mismatch instead of hanging), expose handler
  **singletons** (incl. `appModelAdapter` owning `getState`/commands/`updateBuffer`/`flushBuffer`), and
  centralize envelope handling in `unwrap()`:

  ```ts
  export function unwrap<T>(res: { data?: T; error?: WireError }): T {
    if (res.error) { store.dispatch(notifyError(res.error)); throw res.error; }
    return res.data as T;
  }
  ```

## DON'T

- **Never treat the store as authoritative for model data.** Don't mutate documents/tabs/workspace/UI as
  local truth, and don't optimistically write model state a command hasn't confirmed via `state:patch`.
- **Never store document content in a slice** (only metadata). The canonical buffer lives in
  `internal/appmodel`; only the visible Monaco buffer lives in the webview and it syncs to Go (DD-64).
- Don't echo backend buffer text back into the focused editor — the backend never sends it, and a
  `state:patch` must never move the cursor/selection.
- Don't put anything but **ephemeral** view scaffolding in `localStorage`; it is never a second source of
  truth.
- **Never import `wailsjs/` from a component, a slice, a thunk, a hook, or a util** -- only `logic/adapter/`.
- Don't hand-roll envelope unwrapping at call sites -- use `unwrap`/`tryUnwrap`.
- Don't call a generated binding without `guardArity` (Wails v2 sends no response frame on arity
  mismatch and the promise hangs forever).
- Don't add Redux/Zustand-style cross-slice reach-in; thunks own async, reducers stay pure.

## Authoring checklist

- [ ] Slice is a **projection** of `internal/appmodel`: hydrated via `GetState`, reconciled by `state:*`
      events; no authoritative model state invented locally (DD-62/DD-63).
- [ ] UI interaction is dispatched as a **command** (not a local-truth mutation); resulting state arrives
      via `state:patch`.
- [ ] No document **content** in any slice — only metadata; the visible Monaco buffer debounce-syncs via
      `updateBuffer` and is flushed on blur/switch/close/save (DD-64).
- [ ] `localStorage` holds ephemeral view scaffolding only, never model truth.
- [ ] New backend call added to an adapter as a `guardArity`-wrapped singleton method.
- [ ] Thunk uses `<T, Arg, { rejectValue: WireError }>` and returns via `unwrap`/`rejectWithValue`.
- [ ] No `wailsjs/` import outside `logic/adapter/`.
- [ ] Slice is feature-scoped and registered in `store/index.ts`.
