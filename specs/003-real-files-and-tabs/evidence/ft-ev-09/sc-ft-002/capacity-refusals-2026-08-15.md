# The 40-document cap at the interface, and the refusal message FR-FT-005 requires — 2026-08-15

Follows `boundaries-2026-08-15.md`, which closed all four size boundaries on the real binary and
left two things owed: the 40-document limit at the interface level, and confirmation of the two
FR-FT-005 message observations (F-1, F-2).

Both are now settled. **F-1 was not an observation artifact — it was a production defect**, and the
same defect is why the 40-document limit could not be asserted at the interface either. One root
cause, one fix, two obligations closed.

## The defect

The Go backend writes exactly the messages the specification asks for:

| Refusal | Site | Message |
| --- | --- | --- |
| over 50 MiB | `internal/file/document_reader.go:211` | `The document exceeds the 50 MiB limit.` |
| 41st document | `internal/appmodel/file_lifecycle.go:184` | `The window already contains 40 documents.` |

Both are `apperr.ClassifiedCapacityLimit` with `apperr.RemediationCancel`, and both cross the Wails
boundary intact — `apperr.OpenResult.Error *ClassifiedError` carries a `message` field
(`internal/apperr/results.go:506-513`), the generated binding types it
(`frontend/wailsjs/go/models.ts:323-343`), and the adapter preserves it
(`frontend/src/logic/adapter/index.ts:184-200`).

The frontend then threw it away. Every entry handler read only its success field:

| Path | Site before the fix |
| --- | --- |
| New | `frontend/src/App.tsx:386-398` — reads `result.data`; `result.error` never inspected |
| Open | `frontend/src/App.tsx:399-411` — reads `result.activeBuffer` only |
| Open Recent | `frontend/src/App.tsx:412-424` — reads `result.activeBuffer` only |
| Reopen last | `frontend/src/App.tsx:426-438` — reads `result.activeBuffer` only |
| `+` tab control | `frontend/src/ui/widgets/DocumentTabs.tsx:583-586` — `void (onNewDocument(…))`, result discarded outright |

The save path had this right all along (`App.tsx:970-971` branches on
`status === 'conflict' || status === 'refused'`). The open path had no counterpart.

Corroborating searches across `frontend/src` before the fix: `50 MiB`, `50 MB`, `52428800`,
`exceeds` and `too large` each returned **zero hits**, and `capacity-limit` returned exactly one —
the type-union member at `frontend/src/logic/store/appModelTypes.ts:198`, never produced and never
consumed.

### Why nothing caught it

The behavioural suites drive the seeded parity route, where nothing refuses. The mock bridge
implemented **no capacity check at all** — `NewDocument` and `OpenDocument`
(`frontend/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts`) appended unconditionally — so no
browser test could reach a refusal even in principle. The Go tests assert the model contract and
stop at the boundary. Nothing in between ever asked whether the message arrived.

This is T104's defect class with the arrow reversed. T104 was *the frontend never calls the
backend*; this is *the frontend receives the backend's answer and discards it*.

### The fix

- `frontend/src/logic/store/classifiedNotification.ts` (new) — `reportClassifiedError` extracted
  from `DocumentTabs.tsx` so both surfaces share it, with a `capacity-limit` arm added to the code
  map. It dispatches `notifyToast`, which passes `error.message` through verbatim, **not**
  `notifyError`, whose `localizedErrorCopy` (`notificationsSlice.ts:48-58`) replaces the message
  with generic catalog copy keyed by code — and the catalog has no string naming either limit.
- `frontend/src/App.tsx` — all four entry handlers now report `result.error`.
- `frontend/src/ui/widgets/DocumentTabs.tsx` — the `+` control reports its own refusal on the
  adapter-fallback branch. The two branches are mutually exclusive, so no click raises two toasts.

## What proves it

Four tests, each confirmed to fail before the fix and pass after.

| Test | File | Asserts |
| --- | --- | --- |
| `FR-FT-004 surfaces the 40-document refusal raised by the new-tab control` | `frontend/src/ui/widgets/DocumentTabs.test.tsx` | one toast, code `capacity-limit`, message `The window already contains 40 documents.` |
| `FR-FT-005 reports the 50 MiB open refusal with the limit named` | `frontend/src/App.test.tsx` | one toast, code `capacity-limit`, message `The document exceeds the 50 MiB limit.` |
| `FT-VS-09 refuses the forty-first document and names the limit` | `frontend/e2e/real-files-and-tabs.test.ts` | 40 tabs → click `New tab` → **still 40 tabs**, plus a visible message containing `40 documents` |
| `FT-VS-09 refuses an over-50-MiB file and names the limit` | `frontend/e2e/real-files-and-tabs.test.ts` | tab count unchanged, plus a visible message containing `50 MiB` |

The two Playwright cases belong to the `chromium` project and run **once**; `repeatEach: 3` applies
only to the `parity` project, whose `testMatch` is `e2e/targeted-parity.test.ts`.

## What the Playwright cases do and do not prove — read this before citing them

**They do not prove the 40-document cap exists.** They cannot. `frontend/vite.config.ts:8-39`
substitutes the bridge mock for every `wailsjs/go/*` import whenever the mode is not `wails` or
`production`, and Playwright's web server runs plain `vite`. `window.go` never exists in a browser
run, so no browser test reaches Go.

**The cap is proven in Go**, and those tests pass: `TestOpenRefusesFortyFirstWithoutMutation`
(`internal/appmodel/open_lifecycle_test.go:102`) opens `maxOpenDocuments` real files and asserts the
41st returns `OpenStatusRefused` with `ClassifiedCapacityLimit`, that the document count and order
are unchanged, and that **no patch was emitted** — FR-FT-040's "refused before partial state
change". `TestNewDocumentRefusesStaleOrFortyFirst` and `TestPendingReservationCountsTowardLimit`
cover the New and reservation paths.

**What the Playwright cases prove is the half Go cannot**: that the interface honours a refusal
rather than discarding it. Neither layer closes the capacity clause alone.

For that stand-in to be worth anything the mock's refusal has to be shaped exactly as Go shapes it,
so the category, message and remediation were copied from the Go source rather than invented, and
the guard was placed on the distinct-insertion branch only — after the duplicate-identity focus
return — because FR-FT-004 requires Open to canonicalize and deduplicate *before* applying the
limit, leaving "focus an already-open tab" valid at capacity.

One deliberate inexactness, recorded rather than hidden: Go refuses on the stat'd file size, and
the mock holds no bytes, so the over-50-MiB fixture is recognised by path name
(`oversizeFixturePath`). That is a stand-in for the measurement, not the measurement. The real
boundary was measured on the built binary and is recorded in `boundaries-2026-08-15.md`:
52,428,800 opens read-only, 52,428,801 is refused with no tab created.

## Why this succeeded where screen automation could not

`boundaries-2026-08-15.md` recorded the reason the 40-document check stayed open: the application
surfaces no document total anywhere, the tab strip scrolls without one, `New File` produced no
visually distinguishable success or failure, the workspace panel is not a document list, and the
layout is not persisted to `settings.db` where it could be counted.

Every one of those is a limitation of reading the screen. Playwright reads the accessibility tree,
where each tab is a `role="tab"` node (`DocumentTabs.tsx:499-520`), so `getByRole('tab')` counts
them directly. The instrument was the problem, exactly as that note predicted.

There is also now something to see: before this fix, `New File` at capacity genuinely produced no
distinguishable outcome, because the refusal was silent. The observation was correct; it was
evidence of the defect.

## F-2 is also a defect, and is filed rather than fixed

The second observation — read-only opens with no visible reason — is likewise real. The read-only
*state* is visible in two places (`DocumentIdentity.tsx:40-42` and `StatusBar.tsx:98-113`), and both
render the bare word `Read-only` from `status.saveStatus.read-only` / `status.readOnlyWarning`.
Neither states why. The discriminating fields survive on the metadata and are projected —
`documentsSlice.ts:43` carries `sizeClass`, set to `large` at `file_lifecycle.go:345-348` — but no
component reads them for display. The only read-only explanation string that exists,
`save.readOnly`, fires when a Save is *attempted*, and Save is disabled for these documents.

It is filed as its own task rather than fixed here because the status row is under the parity
contract (`STATUS_ITEM_SELECTORS` in `frontend/e2e/parity/state-contract.ts`, which maps `.sb-count`
to `status-large-file`), so adding visible text there is a reference-adapter change and a re-measured
parity run, not a one-line fix.

## One further finding, latent

`frontend/src/logic/actions/actionDispatcher.ts:105-146` guards `document-mismatch` and
`unavailable`, then falls through to `{ status: 'mutated' }`. A `refused` open therefore reports
upward as a successful mutation. It is latent today — every caller discards the result except
`EditorView.tsx:262`, which checks it only for `refresh-preview`, a path that never sees an open
refusal — so it is filed rather than fixed, because widening the shared `ActionResult` union touches
six surfaces for no behaviour change.

## Still owed on T106

Fixture B's explicit-save timing, which depends on T105's method. Nothing else.
