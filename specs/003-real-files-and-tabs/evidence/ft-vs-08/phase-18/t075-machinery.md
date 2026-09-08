# T075 — what it actually takes, and why it was not started

**Status**: **not started.** Deliberately, per the session rule that each piece
is either complete and green or fully reverted.
**Decision**: session decision 3 — leave `mockup.html` untouched and generate the
six reference captures at test time from it.

## The decision is already encoded

`spec.md` Clarifications, Session 2026-08-13 already records it: "Permit exactly
six reviewed Feature 003 reference-adapter status variants built from the
mockup's own status-bar primitives. The fixed 546 logical-case and
1,638-comparison contract is preserved, the raw immutable mockup source hash is
preserved, the mockup HTML/CSS is never edited, and a production-only
`comparisonAttempted: false` artifact MUST NOT be counted as a visual-parity
pass."

So T075 needs no further clarification. It needs implementation.

## Phase 18 removed the blocker

The six states are `status-saved`, `status-autosaved`, `status-unsaved-changes`,
`status-read-only`, `status-mixed-ending`, `status-large-file`. Before this
phase, production's status row drew a save status that **the binding does not
draw at all** (`mockup.html:837-845` has `.sb-std`, `.sb-caret`, `.sb-count`,
spacer, `.sb-enc`, `.sb-eol`, `.sb-autosave` and three deferred items — no save
status). Any paired capture was guaranteed to differ.

Removing that duplicate (session decision 5) means production's row now carries
the binding's item inventory exactly, which is the precondition for pairing
these six states at all. **That work is done and merged.**

## What remains, precisely

Reference variants are **Node-side string transforms**, not `page.evaluate` DOM
edits: `reference-server.ts` reads the mockup once and calls
`adaptReferenceHtml(html, variant, …)` per request. A status variant is
therefore a string rewrite of the `.statusbar` markup, in the shape of the
existing `adaptDeferredToolbarControls` / `adaptViewMenu` adapters.

Six files change:

| File | Change |
|---|---|
| `e2e/parity/reference-adapter.ts` | a `status-*` variant family, an `adaptStatusBar(html, state)` rewriting `.sb-eol`, `.sb-count`, `.sb-autosave` and the `.doc-name` suffix per state, an entry in `variantRules`, and the new constants added to the hand-listed `REFERENCE_ADAPTER_HASH` object |
| `e2e/parity/reference-adapter.test.ts` | `:53` asserts the variant list **exactly**; it fails until updated |
| `e2e/targeted-manifest.ts` | widen `family` (it has no `'editor-only'`), `activeScreen`, `referenceVariant`, `referenceSelector`, `actualSelector`, `regionId`, `openSurface` — seven closed unions — plus six entries and an integrity block |
| `e2e/targeted-parity.test.ts` | replace the production-only T063 body (`comparisonAttempted: false`) with the shared comparing body, and add the test-name and evidence-root branches |
| `e2e/parity/state-contract.ts` | `.sb-count` and `.sb-autosave` have **no** reference↔production selector mapping today; the six states need them |
| evidence tree | six new paired artifact sets |

## Two traps recorded so the next attempt does not pay for them

1. **`REFERENCE_ADAPTER_HASH` is a hand-listed JSON of every variant knob**
   (`reference-adapter.ts:468-482`). A new constant that is not added to that
   object is not covered by the hash, and the hash is what proves the adapter did
   not silently change.
2. **The reference server is reused across runs.** `playwright.config.ts` sets
   `reuseExistingServer: !process.env.CI` for port 4174, so a server started
   before an adapter edit keeps serving the **old** adaptation for the rest of
   the session. This cost a full mis-measurement in Phase 18: the Settings popup
   reported 2,554 pixels instead of 709 until the port-4174 process was killed.
   **Kill it after every `reference-adapter.ts` change.**

## Why it was not started

Estimated at six files, seven union widenings, a hash constant, and six paired
artifact sets — with an uncertain pixel outcome that would then need its own
attribution pass. That is not work that can be half-landed: a widened union with
no matching variant, or a T063 body switched to comparing with no reference to
compare against, leaves the suite in a worse state than finding it.

The session rule is explicit that a piece is either complete and green or fully
reverted, and that the repository must always be returned working. Starting this
with insufficient time remaining would have violated both.
