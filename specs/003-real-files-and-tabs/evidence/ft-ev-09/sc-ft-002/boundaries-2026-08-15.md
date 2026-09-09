# FR-FT-005 size boundaries on the real binary — 2026-08-15

Binary: `build/bin/GoMarkEdit.app`, rebuilt from the T104 fix. Method: macOS screen automation
against the real packaged application. Fixtures byte-exact in
`~/Documents/gomarkedit-walkthrough/`, verified unchanged after the run.

Autosave was switched **off** for the writability probe so the 10 MiB fixture could be edited
without a write reaching disk — a control that only became available once T104 landed.

## What FR-FT-005 and SC-FT-004 require

Exactly 10 MiB writable; 10,485,761 through 52,428,800 read-only with a visible reason; 52,428,801
or more refused before partial model insertion with a message naming the 50 MiB limit;
classification reads no more than 52,428,801 bytes; live preview pauses above 2 MiB.

## Results

| Fixture                      |      Bytes | Required                      | Observed                                                                                                                                                               | Verdict                                                        |
| ---------------------------- | ---------: | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `boundary-10mib-exact.md`    | 10,485,760 | writable                      | Opens. Typing is accepted — caret moves to Ln 3 Col 205766, title bar goes to `Unsaved changes`. Disk left byte-exact because autosave was off and no save was issued. | **PASS**                                                       |
| `boundary-10mib-plus-one.md` | 10,485,761 | read-only                     | Opens. Title bar reads `Read-only`. **File → Save and Save As… are greyed out** while `New File` and `Open File…` remain white in the same menu.                       | **PASS**                                                       |
| `boundary-50mib-exact.md`    | 52,428,800 | read-only                     | Opens. Title bar reads `Read-only`.                                                                                                                                    | **PASS**                                                       |
| `boundary-50mib-plus-one.md` | 52,428,801 | refused, no partial insertion | **No tab is created.** The tab strip stays at its previous three tabs and the active document is unchanged.                                                            | **PASS on the refusal** — see the finding below on the message |
| Preview above 2 MiB          |          — | paused                        | Every boundary file shows `Live preview is paused — this document is over 2 MB.` `fixture-b.md` at 62,826 bytes shows live preview instead.                            | **PASS**                                                       |

### The refusal was verified with a positive control

A file failing to open and a dialog failing to select a file look identical from outside. Straight
after the refusal, the **same** menu-and-dialog sequence was run against `fixture-b.md`
(62,826 bytes) and it opened normally as a new tab with live preview. The sequence works;
therefore the absence of a tab at 52,428,801 bytes is a genuine refusal, not a harness failure.

## Two findings

**F-1 — no message naming the 50 MiB limit was observed.** FR-FT-005 requires the refusal to carry
"a message naming the 50 MiB limit". The refusal itself is correct and fails closed, but no toast,
banner or dialog appeared. The attempt was repeated with a 4-second observation window as well as a
25-second one, in case a transient toast was being missed; nothing was seen either time. The
application log holds no entry for the attempt. **Not conclusively a defect** — a toast too brief
for the observation, or one rendered outside the captured region, cannot be excluded — but nothing
positively confirmed the message either.

**F-2 — no visible reason for the read-only state was observed.** FR-FT-005 requires read-only to
open "with a visible reason". The read-only _state_ is clearly visible (title bar `Read-only`,
Save and Save As disabled), and the only banner on screen explains the **preview** pause, not the
read-only capability. The status bar's `Document details` control did not expand a visible region
when clicked, so if the reason lives there it could not be confirmed.

Both are recorded as observations needing confirmation rather than as defects, because in each case
the failure to see something is weaker evidence than the T104 disk-write measurement was.

## The 40-document limit — not confirmed at the UI level

This check is **not** closed by this run, and the reason is the method rather than the product.

Screen automation could not establish the document count: the application surfaces no document
total anywhere, the tab strip scrolls without one, `New File` produces no visually distinguishable
success or failure, the workspace panel is not a document list, and the layout is not persisted to
`settings.db` where it could be counted. A clean-restart attempt to count from a known anchor of one
document was interrupted when another application took focus mid-batch.

**The cap is nonetheless well covered at the model level, and those tests pass:**

- `TestOpenRefusesFortyFirstWithoutMutation` — opens `maxOpenDocuments` real files, then asserts the
  41st returns `OpenStatusRefused` with `ClassifiedCapacityLimit`, that the document count and order
  are unchanged, **and that no patch was emitted** — which is exactly FR-FT-040's "refused before
  partial state change".
- `TestNewDocumentRefusesStaleOrFortyFirst`
- `TestPendingReservationCountsTowardLimit`

What remains owed is the _interface-level_ confirmation on the real binary. Screen automation is the
wrong instrument for it; a Playwright case on the deterministic parity route, which can read the
document count directly from the DOM, would settle it cheaply.
