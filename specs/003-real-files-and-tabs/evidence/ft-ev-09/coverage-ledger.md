# Feature 003 coverage ledger — the four approved 2026-08-09 decisions

**Produced**: 2026-08-15. **Owner tasks**: T044 (reconciliation) and T098 (this artifact).
**Scope**: aggregate traceability only. This ledger takes over no FR or SC.

T044 requires this ledger to make five claims. Four are proved below. **The fifth cannot be made
as worded**, and saying so is the reconciliation — see "The 18-clause claim".

---

## The four decisions, named together

All four come from `spec.md` Session 2026-08-09 (`spec.md:158-177`). They are labelled CL-15
through CL-18 in requirement text but the session itself does not number them, which is why they
have been cited scattered across four `ft-vs-08` files and never in one place until now.

| ID | The approved decision |
| --- | --- |
| **CL-15** | Achieve binding-mockup parity by **changing production UI**, not by normalizing the harness. Do not edit the mockup, replace the reference, widen masks, increase tolerance, or normalize away genuine production layout drift. |
| **CL-16** | Render document identity in the top in-app menu row and remove the separate vertical identity row; keep the divider resizable but **overlaid so it consumes no layout width**; render the 28 px status bar below the editor content, outside the main document content area. |
| **CL-17** | Match the **empty workspace frame only**. No populated folder tree, no workspace enumeration. Keep the Assistant surface **zero-width** and defer all Assistant and provider behaviour. |
| **CL-18** | **Do not change ordinary startup** to support parity. Preserve normal startup behaviour unchanged and seed the populated multi-document fixture **only on the deterministic parity route**. |

A fifth question in the same session resolves the T045 editor-region metric *against* CL-17: the
zero-Assistant contract is preserved and the reference mapping revised to an explicit
zero-Assistant adapter region. It is a consequence of CL-17, not a fifth decision.

---

## Claim 1 — the empty workspace and zero-width Assistant boundary (CL-17)

**Proved, in the artifact that enforces it.**

`frontend/e2e/parity/reference-adapter.ts:5` declares
`REFERENCE_ZERO_ASSISTANT_CLASS = 'no-assistant'`, and every variant's `excludedRegions` table
(`reference-adapter.ts:736-748`) lists `['workspace', 'assistant', 'rich-rendering', 'monaco']`.
The adapter activates the mockup's own `.app.no-assistant` class rather than editing the mockup,
which is what the session's fifth answer permits and CL-15 requires.

`monaco` is in that list because **T101** put it there: the Monaco interior exclusion was named in
`spec.md` and `plan.md` but held only by construction — no component selector reached it — so
nothing mechanically enforced it. It is now declared where it is enforced.

The deferred half is proved behaviourally, not by assertion:
`FR-FT-049 keeps every deferred surface unavailable rather than absent or working`
(`frontend/e2e/offline-and-controls.test.ts:194`) passes, with
`evidence/ft-vs-08/offline-and-controls/deferred-boundary.json` retained. Note the deferral is
enforced through the **action registry** (`availability.kind`), not through whether a handler
happens to be wired — the distinction that let `Format on save` and `Lint on save` ship enabled
while marked `laterDeferred`.

## Claim 2 — unchanged normal startup versus parity-only fixture startup (CL-18)

**Proved structurally, which is stronger than a screenshot.**

The populated fixture is not conditionally *styled* on the parity route; it is not *constructed*
off it. `frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts:336-341`:

```ts
function parityFixtureEnabled(): boolean {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('parity-case')
  );
}
```

and the document set derived from it (`:355-362`):

```ts
  return parityFixtureEnabled()
    ? [parityReleaseDocumentId, paritySpecDocumentId]
    : [initialDocumentId];
```

Without a `parity-case` query parameter the window opens with exactly one untitled document —
ordinary startup. The same gate govern recents (`seededRecentFiles()`, `:291-318`), which returns
`[]` for every parity route so that a parity launcher can never inherit an end-to-end seed.

That last property is not left to inspection. `T051 keeps parity launchers isolated from the
FT-VS-07 recent seed` (`frontend/e2e/real-files-and-tabs.test.ts:294`) navigates to
`/?ft-vs-07&parity-case=primary:empty:1280:glass-light` — both flags at once — and proves the
parity route wins. It passes in the 2026-08-15 run.

**One boundary of this claim, stated plainly**: all of the above is the *mock* bridge, which serves
`just dev-ui` and every Playwright run. It is the surface where a parity fixture could leak into
ordinary startup, so it is the right place to prove CL-18. It is not evidence about the packaged
binary's startup, which is walked separately (see "What this ledger does not cover").

## Claim 3 — same-browser production drift classified apart from native-host differences

**Proved, and the classification is load-bearing rather than decorative.**

`evidence/ft-vs-08/phase-18/residual-attribution.md` attributes residual pixels per key. Two
findings from it and its successors define the split this claim requires:

| Class | What it is | Evidence |
| --- | --- | --- |
| **Same-browser production drift** | A real difference between production and the binding, reproducible in one browser across runs. This is the only class CL-15 permits fixing in production. | The `appearance-glass-light` 31,440-pixel difference (Settings dialog vs Settings popup) — deterministic across runs, diagnosed, and resolved by the Phase 19 rescope. |
| **Capture non-determinism** | Not drift at all. 155 of 217 attributed pixels were capture noise, and 31% of production parity captures were non-deterministic before `a0283a3d` made capture wait for the region to settle. | `b5f4b361`, `2cbf95fa`, `384a2b00` |
| **Composited-layer artefact** | A pixel difference with no style or bounds difference. Making an element a scroll container costs ~332 deterministic pixels confined to glyphs, because Chromium drops LCD subpixel antialiasing on composited scrollable areas. | Recorded in `AGENTS.md`; the reason `.application-frame`, not `window.innerHeight`, is the clamping reference. |
| **Native-host difference** | Anything only observable in the packaged Wails webview. | Walked in `current-host-walkthrough.md`, `native-binary-walkthrough-2026-08-11.md`, `walkthrough-2026-08-14-automated.md`, `sc-ft-002/boundaries-2026-08-15.md` |

The reason this split matters is CL-15: only the first class may be fixed by changing production.
Treating capture noise or a layerisation artefact as drift would mean changing production UI to
chase a difference that does not exist — which is the failure mode CL-15's second sentence forbids.

## Claim 4 — no approved decision, UI gap, or deferred boundary left unproven

Reconciled against the current task state rather than the state when T044 was written:

| Obligation | Status |
| --- | --- |
| CL-15 production-side parity, no harness normalization | Held. The mockup, masks, tolerance, coordinate handling and comparator are unchanged; the rescope withdrew a *contract*, not a measurement. `parity/README.md` marks the withdrawn reports. |
| CL-16 identity row, overlay divider, 28 px status bar | Held; measured in `phase-17/t045-editor-region-geometry.md` and the targeted parity keys. |
| CL-17 empty workspace, zero-width Assistant | Held — Claim 1. |
| CL-18 unchanged normal startup | Held — Claim 2. |
| Deferred-surface boundary | Held — `offline-and-controls.test.ts:194`, passing. |
| Stale aggregate counts | **Two remain.** See below. |

---

## The 18-clause claim — why it cannot be made as worded

T044 requires this ledger to "report 18 clarified clauses". **No measurement of this specification
has ever produced 18.**

| Source | Figure | Measured `- Q:` clauses in `spec.md` at that time |
| --- | ---: | ---: |
| `plan.md:836` ("14 clarified clauses") | 14 | — |
| T044, introduced in `e95a0818` (2026-08-11) | 18 | **26** (Session 2026-08-07: 21, Session 2026-08-09: 5) |
| This ledger, 2026-08-15 | — | **42** across five sessions |

Today's count, per session: 2026-08-07 **21**, 2026-08-09 **5**, 2026-08-12 **1**, 2026-08-13
**5**, 2026-08-14 **10** — **42**.

So the two mandated figures disagree with each other (14 vs 18) and neither matched the document
when it was written. T044's own Outcome clause says a **"stale aggregate count"** prevents
completion. That clause is self-applying here: the stale count is the one T044 itself mandates.

**This ledger therefore reports the measured figure, 42, and does not assert 18.** Reporting 18
would be writing a number to satisfy a checklist — the precise failure this feature has already
been bitten by more than once.

**Recommended resolution (owner decision, not taken here)**: amend T044's wording and
`plan.md:836` to state the clause count as measured, or replace both with a rule that the ledger
reports the count it measures. Until one of those happens, T044 cannot be closed on this claim,
and it is left open for that reason alone.

---

## What this ledger does not cover

Named so that nothing here reads as broader than it is.

- **Host screenshots and the real-bridge separation note** (T037, T100) do not exist. Screen access
  for the walkthrough was requested on 2026-08-15 and **declined**, so no host capture was taken
  and none was obtained by any other route. The offline and deferred-boundary halves of T037 are
  genuinely proven and retained; the separation note and screenshots are not.
- **SC-FT-002 timings** (T105) — the explicit-save measurement is owed and is being produced by the
  native-evidence harness rather than by screen automation, which cannot measure it.
- **Fixture B's timing** (T106) depends on that harness. Every other T106 obligation is closed:
  all four size boundaries on the real binary (`sc-ft-002/boundaries-2026-08-15.md`) and the
  40-document limit at the interface (`sc-ft-002/capacity-refusals-2026-08-15.md`).
- **`just verify 003-real-files-and-tabs` after T035–T037 are green** — T035 and T036 are green;
  T037 is not, for the reason above.
