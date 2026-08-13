# Toggle Sidebar: the backend is right, the patch is delivered, the projection drops it

**Requirement**: FR-WS-011, FR-WS-012, Constitution — the Go backend owns the
application model and the store is a projection.
**Status**: **root cause localised and reproduced against the real backend.** Not
yet fixed; the fix needs a decision about the projection's revision guard.
**Branch**: `feature/v1-implementation--003-t071-settings-parity`.

Reported from the running application: pressing Toggle Sidebar does nothing.

## Why `just dev-ui` could never show this

`just dev-ui` serves the frontend against a mock bridge. Under it the control
works: the grid goes to `0px 1fr 0px`, the workspace takes `hidden`, and the
divider unmounts. The defect only appears against the real Go backend, which
`wails dev` provides at `http://localhost:34115` — a real backend the browser can
drive, which is how everything below was measured.

## Four measurements, narrowing it to one line

**1. The backend is correct.** A Go test drove `SetUILayout` five times against a
real SQLite-backed layout repository, alternating the value the way a user
presses the control:

```
press 0: requested false, projected false, patches 1
press 1: requested true,  projected true,  patches 2
press 2: requested false, projected false, patches 3
press 3: requested true,  projected true,  patches 4
press 4: requested false, projected false, patches 5
```

Every press persisted, projected the requested value, and emitted a patch.

**2. The command succeeds in the real application.** Calling the binding
directly from the running webview resolves cleanly:

```
await window.go.appmodel.AppModelHandler.SetUILayout({sidebarVisible: true})
→ RESOLVED {}
```

and `GetState()` then reports `ui.sidebarVisible: true` at revision 5 — while the
DOM still carries `data-workspace-visible="false"`. The backend and the view had
disagreed, with the backend right.

**3. The event is delivered, with the right payload.** A raw listener attached in
the running application received exactly one patch when the control was pressed:

```
{ revision: 5, ui: { sidebarVisible: true } }
```

So the emit, the transport and the payload are all sound.

**4. The store applies patches — but not that one.** Emitting a synthetic patch
identical in shape, differing only in revision, applies immediately and
completely:

```
EventsEmit('state:patch', { revision: 9999, ui: { sidebarVisible: true, sidebarWidth: 260 } })
→ data-workspace-visible="true", grid-template-columns "260px 1020px 0px", --shell-left-width 260px
```

The subscription, the reducer, the selector and the render are all working. The
real patch at revision **5** was discarded and the synthetic one at **9999** was
not.

## The line

`frontend/src/logic/store/uiSlice.ts`:

```ts
.addCase(applyStatePatch, (state, action) => {
  const patch = action.payload;
  if (patch.revision <= state.revision) return;   // ← drops the real patch
```

`uiSlice` keeps its own `revision` and advances it on **every** patch, not only
UI-bearing ones, and `hydrateProjection` seeds it from the snapshot. The backend
increments one shared counter for document and layout patches alike, and the
window emits debounced geometry writes of its own (`windowWidth: 1279`,
`windowHeight: 711` were both persisted here). So the counter `uiSlice` compares
against is advanced by traffic that carries no `ui` at all, and a genuine layout
patch can arrive already at or below it — at which point the control is inert and
nothing anywhere reports a problem.

This is not specific to the sidebar. Any UI-layout patch can be lost the same
way; the sidebar is simply the one with a visible control.

## What was fixed here, and what was not

**Fixed:** `frontend/src/App.tsx` discarded the command's rejection entirely
(`void dispatch(setWorkspaceVisible(visible))`), where the width path beside it
reverts its optimistic value and surfaces `latestLayoutFailure`. The visibility
path now surfaces a refusal through `notifyError`. That is correct hardening and
was requested, but **it is not the cause here** — the command resolves; the patch
is simply dropped afterwards.

**Not fixed:** the revision guard. Two candidate resolutions, and choosing
between them is a design decision about the projection contract rather than a
local edit:

1. **Track revisions per slice section.** `uiSlice` advances its own revision only
   when a patch actually carries `ui`, so unrelated document traffic cannot
   overtake it.
2. **Make the guard a staleness check on the payload, not the envelope.** Apply
   any patch carrying `ui` whose revision exceeds the last revision *that carried
   ui*, keeping the envelope revision purely for ordering.

Option 1 is the smaller change and keeps the backend authoritative. Both need the
same question answered for `documentsSlice` and `settings`, which share the
counter, so the fix should be made once for all sections rather than patched into
`uiSlice` alone.

## A second, separate observation

The persisted `sidebarWidth` in this environment is `0`, so even with visibility
restored the workspace renders zero-wide. That is consistent state, not a bug,
but it means "make it visible" and "give it width" are two different commands —
worth confirming the control's intent covers both before the guard is changed.
