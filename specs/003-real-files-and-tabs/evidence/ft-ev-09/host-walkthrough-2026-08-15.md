# Current-host walkthrough of the freshly built binary — 2026-08-15

**Proves: SC-FT-011** — partially, and this is the closest single artifact to it. Added by T115,
which found SC-FT-011 named nowhere in the evidence tree or the test suite despite the substance
existing across several walkthroughs.

Covered here: the 40-document boundary, the 41st-document refusal, the 50 MiB refusal, and the
relaunch-without-session-restore claim. Covered in siblings rather than here: the 10 MiB pair
(`sc-ft-002/boundaries-2026-08-15.md`), the tab, close and autosave journeys
(`current-host-walkthrough.md`), and the default-open-mode journey
(`default-open-mode-2026-08-15.md`). **No single walkthrough covers the whole criterion.**

**The per-clause map now exists**: [`../sc-ft-011/walkthrough-clause-map.md`](../sc-ft-011/walkthrough-clause-map.md),
written by T158. Read it before citing this file for SC-FT-011 — it names nine covered clauses and
**two that nothing in the tree covers**: preserved _permissions_ after a real save (no artifact
checks a file mode; the `ls -la` listings carry one as an unexamined by-product), and the mapped
webview chrome compared against the same-browser result (`host-screenshots/README.md` explicitly
disclaims that comparison). It also records that clause 10's demonstrated/deferred/host-unverified
ledger does not exist — `grep -i host-unverified` over this whole directory returns nothing — and
that the single external-change resolution rests on the 2026-08-11 run, which names no commit and
predates five later host-found defects. The remainder is filed as **T186**.

Binary: `build/bin/GoMarkEdit.app`, rebuilt at 10:57 from commit `790375fb` — after the T104
autosave fix and after T107's classified-refusal fix. Host: darwin/arm64. Method: macOS screen
automation against the packaged application, with window-ID-scoped captures.

Supersedes nothing; extends `current-host-walkthrough.md` (2026-08-13) and
`walkthrough-2026-08-14-automated.md` with the checks those runs left owed.

## A trap worth recording before the results

The first `open build/bin/GoMarkEdit.app` **surfaced an eleven-hour-old process**, not the binary
just built. `ps -o lstart` showed it started at 00:11; the binary on disk was written at 10:57.
`open` raises an existing instance rather than launching a second one, and nothing on screen says
which build you are looking at.

Every observation below was taken only after quitting that instance and confirming the new
process's start time against the binary's mtime. **Check `ps -o lstart` against the binary mtime
before recording any host observation** — a stale instance looks exactly like a fresh one, and the
2026-08-14 run's conclusions would have been unaffected only by luck.

Quitting it also required a decision: the close prompt named `boundary-10mib-exact.md` as dirty.
**Discard all** was chosen deliberately — `boundaries-2026-08-15.md` depends on that fixture being
byte-exact at 10,485,760, and `Save all` would have written the walkthrough's typing into it.
Verified 10,485,760 before and after.

## Results

| Check                               | Observed                                                                                                  | Verdict                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------ |
| Startup, fresh build                | One Untitled tab, Split arrangement, `Autosave off` in the status bar                                     | **PASS**                 |
| Startup after a 40-document session | Still **one** Untitled tab — see below                                                                    | **PASS**                 |
| `New File` from the File menu       | Creates a tab each time; drove 1 → 40                                                                     | **PASS**                 |
| The 41st document                   | Refused. Toast: `Untitled` / **"The window already contains 40 documents."** / `Dismiss`                  | **PASS**                 |
| Opening 52,428,801 bytes            | Refused. Toast: `boundary-50mib-plus-one.md` / **"The document exceeds the 50 MiB limit."** / `Dismiss`   | **PASS**                 |
| Refused open leaves no recent entry | `boundary-50mib-plus-one.md` is absent from `Open Recent`, while the five files that did open are present | **PASS**                 |
| `File ▸ Exit`                       | Terminates the process; no prompt when the 40 untitled documents are all empty                            | **PASS**                 |
| `⌘N`                                | **Does nothing.** See the finding below                                                                   | **FAIL — filed as T110** |

Screenshots and their classification: `host-screenshots/README.md`.

## The 40-document limit, finally settled on the real binary

`boundaries-2026-08-15.md` could not close this. Its reasoning was sound and is worth restating:
the application surfaces no document total, the tab strip scrolls without one, the workspace panel
is not a document list, the layout is not persisted to `settings.db`, and — the decisive point —
**`New File` produced no visually distinguishable success or failure.**

That last clause was not a limitation of the instrument. It was the defect. Before T107 the
refusal was silent, so at capacity the menu item simply did nothing observable. With the message
restored, the cap demonstrates itself: drive `New File` until a toast appears, and the toast names
the limit. No counting required.

The count is nonetheless pinned three ways. The 41st refusal fired after exactly 40 successful
creations and not before; the message states the number the backend holds; and
`TestOpenRefusesFortyFirstWithoutMutation` (`internal/appmodel/open_lifecycle_test.go:102`) proves
the model contract including the no-patch-emitted clause.

**This is the strongest form of the evidence** — stronger than the Playwright case in
`capacity-refusals-2026-08-15.md`, which can only reach the bridge mock. Here the real Go
`maxOpenDocuments` refused, and the real Wails webview rendered it. Both are retained: the browser
case runs in the gate on every change, the host walk proves the gate is measuring the real thing.

## FR-FT-005's message, and the resolution of F-1

`boundaries-2026-08-15.md` recorded F-1 as an observation rather than a defect, because failing to
see something is weaker evidence than the T104 disk measurement was. That caution was right, and
the answer is now positive in both directions: the message was absent then, it is present now, and
the code path that was missing is named in T107.

The remediation renders as message-only dismissal, which is what the classified-error table
prescribes for `capacity-limit`, and both toasts name only the safe basename — no full path, no raw
OS error text.

**F-2 is unchanged and remains a defect**: a read-only document still shows the bare word
`Read-only` with no reason. It is filed as T108, not fixed, because the status row is
parity-governed.

## Session is not restored; settings are

Quitting with 40 documents open and relaunching returns **one** Untitled document
(`01-startup-after-forty-documents.png`). The arrangement (Split) and `Autosave off` do come back.

That is the correct split and it is worth stating because it is easy to get backwards: FR-FT-049
forbids session restore, while settings persistence is required. The 2026-08-14 addendum's autosave
fix is visible here — `Autosave off` survived a restart, which is what T104 wired.

This is also CL-18 on the real binary. The coverage ledger proves "ordinary startup unchanged"
structurally from the mock bridge's fixture gating, which is the surface where a parity fixture
could leak; this is the same claim observed on the packaged application, where no parity route
exists at all.

## New finding — `⌘N` does not create a document

The File menu advertises `⌘N` beside `New File`. On the real binary it does nothing.

Distinguished from a harness artifact three ways: the `+` tab control and the `File ▸ New File`
item both create documents reliably in the same session, with the same click mechanism; keystrokes
demonstrably reach the application, since the 2026-08-14 run drove an explicit `⌘S` that committed
a write; and the failure is total rather than flaky — 39 consecutive presses produced no document,
with the editor focused and unfocused.

Filed as **T110**. Not fixed in this session because the cause is not yet located and the fix
belongs with whoever owns the shortcut registry.

### Correction 2026-08-15 (T110) — the second of those three arguments was circular

The middle argument above is withdrawn. It reasons that keystrokes reach the application "since
the 2026-08-14 run drove an explicit `⌘S` that committed a write" — but that write is exactly the
observation T110 asks to re-examine, and it was **not** an explicit save. `⌘S` had no listener
either; the write was the one-second Go autosave, which is also why the label read `Autosaved`.
Using it to prove keystroke delivery assumed the conclusion.

The claim itself is nevertheless **true**, and is now proved by a key with no autosave confound.
On the binary rebuilt from `4e141037` (built 12:33:29, process started 12:34:38, so not a stale
instance), pressing `⌘,` opened the Settings menu and `⌘\` was likewise live, while seven `⌘N`
presses in the same session produced no document. `⌘,` is an already-wired shell action in
`createShellActionCatalogue`; `⌘N` was not in that catalogue. Same webview, same keyboard, same
modifier — so `⌘`-modified keydown does reach JS, and the only difference between the two keys was
whether anything listened. That retires the possibility that WKWebView was swallowing the modifier
and confines the defect to the frontend.

Corroborated independently in the browser: with the T110 fix stashed, `FT-VS-10` fails with
`[data-notification-code="save-success"]` resolving to **0 elements** after `⌘S` — no explicit
save is emitted at all. The first two and the third of the original arguments stand unchanged.

## What this walkthrough does not cover

- Timings — see `sc-ft-002/explicit-save-timings-2026-08-15.md`.
- The 10 MiB pair and the 50 MiB-exact boundary — already closed in `boundaries-2026-08-15.md` and
  not re-walked.
- Any parity or pixel claim.
