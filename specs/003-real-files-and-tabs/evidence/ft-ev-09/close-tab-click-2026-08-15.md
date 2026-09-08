# T111 — `File ▸ Close Tab` by click on the real binary

Date: 2026-08-15. Branch `feature/v1-implementation--003-t111-close-tab-click`, based on
`258d1d32`. Host: darwin 25.5.0. Baseline captured at `258d1d32`, clean tree, every gate `clean`,
**0 failing tests, 2 pre-existing findings** (`DocumentIdentity.tsx` and `Launcher.tsx`,
`react-refresh/only-export-components`).

## Headline

**T111's reported symptom did not reproduce, and its recorded prime suspect is refuted. A real
defect in the same row was found, confirmed on the host, and fixed.**

- `File ▸ Close Tab` by click closed the tab in **6 of 6** attempts across five distinct states,
  including the "stable two-tab state" T111 names.
- The one state where the click *is* inert is **zero documents** — the launcher, reached by closing
  the last tab. There `Close Tab` rendered **enabled**, beside `Save` and `Save As…` which greyed
  correctly, and the click did nothing with no message. That is the enabled-while-inert class T110
  left open, and it is what this task fixes.

## 1. Stale-instance guard

`open` raises an existing process, so a walk can describe a build that is not in the tree.

| | |
|---|---|
| binary mtime | `build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit` — **2026-08-15 14:38:23** |
| process start | pid 60079 — **Sat Aug 15 14:38:46 2026** |

Process start is later than the binary, so this is not a raised older instance. The binary was
built from unmodified production source: at build time the only edits in the tree were
`internal/appmodel/close_plan_test.go` and `frontend/src/ui/widgets/ShellMenuRow.test.tsx`, neither
of which is compiled into the app. Autosave **off** throughout.

## 2. The prime suspect is refuted, by reading rather than by walking

T111 records the suspect as `ApplicationShellMenu` binding a stale `tabSetRevision` from its own
`useAppSelector` while the accelerator binds a fresh one, so a plan refused on a stale expected
revision would be silently discarded. That cannot be what happened:

- `ShellMenuRow.tsx:423-436` builds the ⌘W entry's `dispatchContext` as
  `{applicationFocused: true, documentId, sessionDocumentId, writable}`.
- `ShellMenuRow.tsx:519-525` builds the click's context as **the same four fields plus `invoke`**.
- Both resolve `invoke` through the same `fileActionInvoker` (`:337-363`), which for `close-tab`
  returns the single `onCloseDocument` prop constructed at `App.tsx:245-253`. No `useMemo` wraps
  it, so both surfaces close over the same render's `tabSetRevision`.

Click and keystroke are byte-identical from `dispatchAction` downward. A stale-revision refusal
would therefore have refused **both**, and `⌘W` demonstrably worked. Whatever T110 observed, it was
not this.

Two further reasons to retire it: the dev bridge mock already honours the revision faithfully
(`AppModelHandler.ts:1250-1257`), so Chromium passing is not evidence the check was skipped there;
and no refusal was observed on the host in any of the six closes below.

## 3. The A1 walk — unmodified `258d1d32`

| # | Starting state | Action | Result |
|---|---|---|---|
| 1 | 2 tabs (⌘N from 1) | `File ▸ Close Tab` | **closed** → 1 tab |
| 2 | 3 tabs | `File ▸ Close Tab` | **closed** → 2 tabs |
| 3 | 2 tabs, active switched to tab 1 **by clicking the tab** | `File ▸ Close Tab` | **closed** → 1 tab |
| 4 | 2 tabs — `fixture-a.md` + `Untitled` | `File ▸ Close Tab` | **closed** `Untitled` → `fixture-a.md` remains, titled `gomarkedit-walkthrough / fixture-a.md · Saved` |
| 5 | 1 tab (`fixture-a.md`) | `File ▸ Close Tab` | **closed** → 0 documents, launcher `Start a document` |
| 6 | 2 tabs, window resized to **≈640px** (the narrow render site) | `File ▸ Close Tab` | **closed** → 1 tab |

Row 6 matters because the narrow popup is a different render site — `ShellMenuRow.tsx:918-926`, a
plain `<button onClick>` portalled to `document.body` — rather than the wide Radix
`DropdownMenu.Item onSelect` at `:726`. Both dispatch through `dispatchFileAction`; both work.

`File ▸ New File` worked in the same session, which retires the "Radix `onSelect` does not fire in
WKWebView" contingency and matches what `tasks.md:1127` already recorded.

### The one failing state — zero documents

From row 5's launcher state, with `activeDocumentId` null:

- `Save` and `Save As…` rendered **greyed**, correctly.
- `Close Tab` rendered **fully enabled**, at the same brightness as `Exit`, advertising `⌘W`.
  Confirmed at magnification.
- Clicking it did **nothing**: no close, no message, no console error.
- `⌘W` in the same state also did nothing, and — importantly — **did not close the window**.
  It is simply never registered (`ShellMenuRow.tsx:426`, the `invoke === undefined` filter), so
  `useShellShortcuts` never calls `preventDefault` and the key falls through to a Wails darwin menu
  that binds only `AppMenu()` and `EditMenu()` (`internal/application/native_menu.go:8-14`) and
  therefore has no ⌘W. Harmless, but only by accident.

Root cause: `App.tsx:246` passes `onCloseDocument` as `undefined` when `activeDocument` is
undefined, and `fileActionDisabled` never consulted `fileActionInvoker`, so the row advertised an
availability it could not honour.

### A method correction worth recording

The plan predicted the popup would **stay open** on the inert click, because
`setFileOpen(false)` sat below the `invoke === undefined` return. It closed. That discriminator is
invalid for the wide popup: it is a Radix `DropdownMenu.Item`, and Radix dismisses the menu after
`onSelect` regardless of what the handler does. The discriminator holds only for the narrow
`<button onClick>` site. The fix hoists the close above the return anyway, so the narrow site
cannot strand an open menu.

## 4. Why no test layer could see it

Neither existing layer can reach the state at all:

- `ShellMenuRow.test.tsx` always passed `onCloseDocument`, so the undefined case was unrepresentable
  in the harness. `renderMenuRowWithFileActions` now takes `closeDocument: false`.
- The Playwright suite drives the mock bridge, whose `activeDocumentId` is
  `orderedDocumentIds[0] ?? initialDocumentId` (`AppModelHandler.ts:365`) — never null. No browser
  case can reach zero documents.
- The Go tests stop at the model boundary.

This is the test-double-fidelity class again: the state exists only on the host.

## 5. What changed

| Change | File | Why |
|---|---|---|
| `fileActionDisabled` consults `fileActionInvoker` through an explicit id set | `ShellMenuRow.tsx:59-76, 365-390` | The confirmed defect. A row whose handler is absent now greys. The `exit`/`onQuit === undefined` clause is folded in — it was the same rule spelled twice. |
| Popup dismissal hoisted above the `invoke === undefined` guard | `ShellMenuRow.tsx:502-513` | The narrow site does not self-dismiss; the guard must not strand an open menu. |
| Close-plan refusals report through `reportClassifiedError` | `App.tsx:544-564, 596, 641, 676` | T107's treatment, third arrow. See §6. |

`internal/application/native_menu.go`, `useShellShortcuts.ts`, `shellActions.ts` and
`actionRegistry.ts` are **unchanged**. `close-tab`'s registry availability is deliberately left as
`available()` — the contextual case already lives in `getActionAvailability`'s `TAB_ACTIONS` arm,
and marking the entry deferred would grey it permanently and break the File-popup parity contract.

### Why the `preventDefault` coupling is safe

`fileShortcutActions` filters on `invoke === undefined` **before** constructing the entry
(`ShellMenuRow.tsx:426`), so `registered(id) ⇒ invoke ≠ undefined ⇒ the new clause is false`. The
new clause can only be true for an id that was never registered, and an unregistered id is never
reached by `useShellShortcuts.ts:37-41`. A greyed row therefore cannot swallow a keystroke that
should fall through. Pinned by `T111 leaves Mod+W unclaimed when no close callback is bound`.

## 6. The close-plan refusal was reported, but message-stripped

Independent of the host observation, and demonstrable from code plus the new Go tests:
`processClosePlanResult` reported refusals through `reportWriteError` → `notifyError`, whose
`prepare` unconditionally replaces title and message with `localizedErrorCopy`
(`notificationsSlice.ts:48-58`) keyed by code. `conflict` has no catalog entry, so it collapsed
onto `io`. Go's two distinct refusals —

- `"The tab set changed; close must be retried."` (`internal/appmodel/close_plan.go:44`)
- `"The tab set changed while autosave work drained."` (`:88`)

— both reached the user as **"The file operation could not be completed."** Measured, not argued:
with the fix stashed, `T111 surfaces the close plan refusal with the backend message intact` fails
with exactly that substitution.

Adding a `conflict` catalog entry would **not** have fixed it — it would substitute a *different*
generic sentence and still merge the two. `reportClassifiedError` passes `error.message` through
verbatim, which is why T107 chose it.

Scope: the three close-plan arms only (`App.tsx:596`, `:641`, `:676`). `reportWriteError`'s other
callers — native close `:553`, conflict resolution `:860`/`:887`, save `:1030`/`:1045`/`:1060`,
external conflict `:1160` — keep their copy contract.

## 7. Tests

**Go — `internal/appmodel/close_plan_test.go`.** Neither staleness branch had any coverage; neither
message appeared in any `_test.go`.

- `TestPrepareCloseRefusesAStaleTabSetRevision` — covers `close_plan.go:41-45`.
- `TestPrepareCloseRefusesARevisionThatMovedWhileAutosaveDrained` — covers `:86-91`.

Both assert category, **exact message** and remediation, because the frontend now renders those
strings verbatim and a category-only assertion would let a reword silently change what the user
reads. Passing 5×5 under `-race`.

Recorded honestly: these are **characterization coverage, not red-first** — both Go branches
already worked. The red-first tests are the frontend ones. The first draft of the drain test *did*
fail, and informatively: it fired the autosave clock first, which made the executor run **before**
`PrepareClose`, so bumping the tab set raced the *first* check and asserted the wrong branch. Not
firing the clock forces `flushAutosaveMode`'s `entry != nil && done == nil` arm
(`autosave.go:118`), so `PrepareClose` itself invokes the executor — making the executor call
positive proof that the first check already passed. Channels only, no sleeps.

`TestCloseReevaluatesRevisionAfterAutosaveDrain` is left alone; it asserts the *matching*-revision
path despite its name, and the two new tests cover the mismatching one.

**Frontend, all confirmed red before the fix and green after:**

| Test | File | Fails without |
|---|---|---|
| `T111 disables the File menu Close Tab row when no close callback is bound` | `ShellMenuRow.test.tsx` | B1 — the row rendered enabled |
| `T111 surfaces the close plan refusal with the backend message intact` | `App.test.tsx` | B3 — message became "The file operation could not be completed." |
| `T111 leaves Mod+W unclaimed when no close callback is bound` | `ShellMenuRow.test.tsx` | *(green both ways — a guard against a fix that hardcodes availability)* |

The disabled-row assertion reads the same triple the parity harness reads
(`disabled || aria-disabled || data-disabled`), so the two instruments cannot disagree.

## 7b. The A2 walk — the rebuilt binary

Binary rebuilt **14:54:10**, process started **14:54:16** — newer, so not a raised older instance.

| State | `Close Tab` | Beside it | Click |
|---|---|---|---|
| 1 document open | **enabled** | `Save`, `Save As…` enabled; `Export to PDF…` greyed (deferred) | **closes** → 0 documents |
| 0 documents (launcher) | **greyed** | `Save`, `Save As…` greyed; **`Exit` still enabled** | — |
| 1 document again (`New File`) | **enabled** again | as above | **closes** → 0 documents |

Verified at magnification in all three states. Before the fix, the launcher-state `Close Tab`
rendered at the same brightness as `Exit`; it now renders at `--disabled-opacity` with them.

`Exit` staying enabled throughout is the check that the folded `onQuit === undefined` clause did
not over-grey: `onQuit` is an unconditional `useCallback` (`App.tsx:1070`), so `exit` must never be
greyed by the new rule. It is not.

The row is now honest in both directions — it greys when it cannot act and re-enables when it can.

## 8. Gates

| Gate | Result |
|---|---|
| `just check` | **exit 0**; 547 frontend tests passed / 77 suites, every Go package `ok`. Diffed against the `258d1d32` baseline: no new findings, the same 2 pre-existing. |
| `just e2e-test` | **259 passed, exit 0** — exactly the baseline, in 5.2m. No `T026` flake. Parity accounting: 150/150 planned verifications attempted, 150 passed, 0 unaccounted. |

The File-popup parity contract was checked **before** touching `fileActionDisabled`:
`targeted-parity.test.ts:531-538` lists `close-tab` in `FILE_POPUP_IMPLEMENTED` and `:690-694`
fails if it is not `enabled`. The parity route cannot reach the greying condition, because the mock
sets `activeDocumentId = orderedDocumentIds[0] ?? initialDocumentId` (`AppModelHandler.ts:365`) and
never null. No edit to `frontend/e2e/parity/reference-adapter.ts` was needed or made, so
`REFERENCE_ADAPTER_HASH` is untouched.

## 9. Limits of this walk

- The failure T111 describes — an inert click **from a stable two-tab state** — was not reproduced
  and its stated mechanism is refuted. The T110 walk's binary was built from an uncommitted working
  tree at 13:27:50 and no longer exists, so its original observation cannot be re-examined
  directly. The honest reading is that the observation was real but the state was misattributed:
  the zero-document launcher is the only state in which this row is inert, and it is one `Close Tab`
  away from a one-tab state.
- No stale-revision refusal was observed on the host in six closes, so **B4 (a bounded retry on a
  conflicted close plan) was not built.** It would have been speculative; the plan made it
  conditional on observing the refusal, and the condition was not met.
- The `⌘W`-falls-through-to-the-host behaviour is safe only because Wails' darwin menu binds no
  ⌘W. That is a property of `native_menu.go` today, not a guarantee.
