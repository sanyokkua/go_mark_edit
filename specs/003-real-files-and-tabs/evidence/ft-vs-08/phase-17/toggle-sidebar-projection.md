# Toggle Sidebar: the backend is right, the patch is delivered, the projection drops it

**Requirement**: FR-WS-011, FR-WS-012, Constitution — the Go backend owns the
application model and the store is a projection.
**Status**: **fixed and verified against the real backend.** The cause was not
the revision guard. A fifth measurement, holding the revision fixed and varying
only the payload shape, refuted that hypothesis and localised the defect to the
patch's `orderedDocumentIds: null`. Both recorded resolutions were dropped
unapplied; the revision guard is unchanged and correct.
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

## Measurement 5 refutes the revision hypothesis

Measurements 1–4 are sound observations, but 4 compared a real patch against a
synthetic one that differed in **two** ways — its revision _and_ its payload
shape — and attributed the difference to the revision. Holding the revision
fixed and varying only the shape reverses the conclusion.

Against the running backend, three patches emitted in sequence:

```
{revision: 20, ui:{sidebarWidth:320}}                          → applied   (320px)
{revision: 21, ui:{sidebarWidth:321}, orderedDocumentIds:null} → THREW, not applied
{revision: 22, ui:{sidebarWidth:322}}                          → applied   (322px)

TypeError: patch.orderedDocumentIds is not iterable
```

Revision 21 is strictly greater than the store's revision and is still lost,
while 20 and 22 apply. The revision guard is not involved. Independently: after
a fresh load the store's `ui.revision` and the backend's revision agree exactly,
and a synthetic patch at the _same_ revision as a dropped real one applies.

## The line

`frontend/src/logic/store/documentsSlice.ts`:

```ts
if (patch.orderedDocumentIds !== undefined) {
  state.orderedIds = [...patch.orderedDocumentIds]; // ← throws on null
}
```

`apperr.AppStatePatch` is the one patch field tagged without `omitempty`:

```go
OrderedDocumentIDs []string `json:"orderedDocumentIds"`
```

so every layout-only patch really does arrive carrying `orderedDocumentIds:
null` — a value the TypeScript `AppStatePatch` declares impossible. `null`
passes a `!== undefined` guard, and spreading it throws.

The throw is what makes this invisible. All slice reducers share one dispatch,
so an exception in `documentsSlice` aborts the whole action and the `ui` section
travelling in the same patch never reaches `uiSlice`. A documents-shaped field
silently discards a layout change, and nothing anywhere reports a problem.

This is not specific to the sidebar. Any patch carrying `ui` alongside a null
tab order is lost the same way; the sidebar is simply the one with a visible
control.

## Why `just dev-ui` could never show this, precisely

The mock bridge always sends `orderedDocumentIds: [...]` — an array, never null
(`frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts`). The defect
needs the real wire shape, so no amount of mock-bridge testing could surface it.
This is a concrete instance of the divergence recorded in
`docs/delivery/plan/KNOWN_ISSUES.md`.

## What was fixed here, and what was not

**Fixed:** `frontend/src/App.tsx` discarded the command's rejection entirely
(`void dispatch(setWorkspaceVisible(visible))`), where the width path beside it
reverts its optimistic value and surfaces `latestLayoutFailure`. The visibility
path now surfaces a refusal through `notifyError`. That is correct hardening and
was requested, but **it is not the cause here** — the command resolves; the patch
is simply dropped afterwards.

**Fixed:** the wire shape is normalised at the bridge, in
`frontend/src/logic/adapter/appModelAdapter.ts` — the one module architecturally
permitted to see the wire, and the module that already null-normalises command
results (`orderedDocumentIds: [...(result.orderedDocumentIds ?? [])]`). Patches
were the asymmetry: they were forwarded raw. A patch's optional fields that the
declared type never admits as null are now dropped when the wire nulls them, so
the declared `AppStatePatch` shape is true for every consumer. An empty array is
preserved — that is the last document closing, not an absent field.
`activeDocumentId` is excluded, because null is its documented way of saying
there is no active document.

`documentsSlice` additionally tests the shape (`Array.isArray`) rather than
`!== undefined`, so a malformed tab order degrades to "field absent" instead of
taking every other slice's share of the dispatch down with it.

**Dropped, not applied:** both recorded resolutions to the revision guard. They
addressed a mechanism measurement 5 rules out. The premise behind them — that
the shared counter lets a genuine layout patch arrive at or below `uiSlice`'s
revision — is false: the backend stamps every patch from one monotonic counter
that it increments before each emit (`documentPatchLocked` increments inside the
patch builder, which is why a call-site count of `publishLocked` against
`revision++` misleads), so a later patch always carries a strictly higher
revision. Changing the guard would have altered a correct invariant without
touching the defect.

**Not changed:** the settings projection. It does not consume `applyStatePatch`
at all — `AppStatePatch` has no settings field, and `settingsSlice` is
bootstrapped by a direct adapter call and updated through `acknowledge*`
actions. It shares no revision counter and cannot exhibit this defect, so there
was no site to fix there.

## Verified against the real backend

`wails dev`, four presses of the real control, alternating:

```
press 0: backend rev 14 sidebarVisible false → data-workspace-visible "false"  agrees
press 1: backend rev 15 sidebarVisible true  → data-workspace-visible "true"   agrees
press 2: backend rev 16 sidebarVisible false → data-workspace-visible "false"  agrees
press 3: backend rev 17 sidebarVisible true  → data-workspace-visible "true"   agrees
```

Every patch still arrived carrying `orderedDocumentIds: null`; the backend was
not changed and remains authoritative.

## A second, separate observation — decided and closed

**Decision (product owner, this session):** dragging the divider to zero _means
hide_, and showing the workspace again uses the binding width. A workspace that
is visible at zero width is not a state the application should be able to reach.

Both halves are implemented as single backend commands, in
`frontend/src/logic/store/uiLayoutCommands.ts`:

- `setWorkspaceWidth(0)` sends `{sidebarVisible: false, sidebarWidth: 0}`. The
  divider clamps at 0 and the separator advertises `aria-valuemin={0}`, so zero
  stays reachable — it now reads as "put the workspace away" rather than
  producing a pane nobody can see.
- `setWorkspaceVisible(true)` sends `{sidebarVisible: true, sidebarWidth: 216}`
  when the acknowledged width is 0, and `{sidebarVisible: true}` otherwise. A
  workspace that has never been sized carries no acknowledged width at all and
  is left alone — the shell already renders that case at the binding width.

216 is the binding's own value (`mockup.html:254`, `.sidebar{width:216px…}`),
now exported once as `WORKSPACE_BINDING_WIDTH` and consumed by both the shell's
fallback and the restore, so the two cannot drift apart. The alternative —
restoring the width the user had before collapsing — was declined; it would need
a "previous width" the backend does not store.

### Why the backend changed too

`SetUILayout` debounces continuous fields by 250ms and applies discrete ones at
once, so the combined command opened the workspace at its old width of 0 and
widened it a quarter of a second later — a weak reprise of the symptom the
restore exists to remove. A width arriving _with_ a visibility change is one
discrete intent, not the stream a drag produces, so it is no longer held back
(`internal/appmodel/service.go`). A width sent on its own is still debounced,
which the existing `TestSetUILayoutDebouncesWorkspaceWidthUntilAcknowledged`
continues to prove.

### Verified against the real backend

Starting from the recorded broken state (`layout.workspace.visible=false`,
`layout.workspace.width=0`):

```
collapse: 216 → 200 → 136 → 72 → 8 → at 0 the workspace hides
          backend: sidebarVisible false, sidebarWidth 0

show:     one patch at 7ms: { sidebarVisible: true, sidebarWidth: 216 }
          DOM: data-workspace-visible "true", --shell-left-width 216px
```

One patch carrying both fields, so there is no interval at which the workspace
is visible with no width.

### How the zero got there

Worth recording, because it changes what the case is. The persisted `0` was
_dragged_, not shipped: the dev database held
`layout.workspace.width = {value: 0, sequence: 426}`, and a sequence that high is
what a long drag produces, one write per debounced step. The production database
held `255` at sequence 249. So this was an ordinary user action reaching a state
the spec had not considered, not a bad default.

The backend already had the habit this decision generalises: `restoreLayout`
discards a persisted window width below 375 and a height below 480, letting the
default apply. Only the workspace width accepted `>= 0`.

## The original observation, as recorded before the decision

The persisted `sidebarWidth` in this environment is `0`, so even with visibility
restored the workspace renders zero-wide. Verified after the fix: the grid stays
`0px 1280px 0px` and `--shell-left-width` stays `0px` while
`data-workspace-visible` correctly flips.

What the authorities say:

- The spec treats the two as independent persisted properties:
  "`Ctrl/Cmd+\` shows and hides the sidebar" and "the edge is draggable and the
  width is persisted" (`docs/delivery/spec/product/a-folder-of-notes.md`,
  _The sidebar's visibility and width persist_). It is silent on visible-at-zero.
- The binding fixes the sidebar's own width at **216px**
  (`docs/delivery/spec/surface/mockup.html:254`, `.sidebar{width:216px…}`), which
  is the same value `AppShell` already falls back to (`sidebarWidth ?? 216`).
  That fallback is nullish-only, so a _persisted_ `0` beats it.
- Zero is reachable by design, not corruption: the divider drag clamps with
  `Math.max(0, …)` and the separator advertises `aria-valuemin={0}`.

So making Toggle Sidebar also write a width would be inventing behaviour the
spec does not license, and is left undone pending a decision. Recommended
default if one is wanted: on restoring visibility to a workspace whose
acknowledged width is `0`, issue the existing `setWorkspaceWidth` command with
the binding's 216px, so the restore is still one backend-owned command and the
projection stays a projection. The alternative — a presentation-only floor in
`AppShell` — is cheaper but would make the rendered width disagree with the
acknowledged state, which is the failure mode this whole document is about.
