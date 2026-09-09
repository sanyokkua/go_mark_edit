# Walkthrough of the built binary — 2026-08-13

**Build**: `just build` → `build/bin/GoMarkEdit.app`, exit 0, self-signed, 11.3s.
**Host**: macOS (darwin, arm64), current host only.
**Method**: the real application driven through its actual controls — pointer and
keyboard — not the mock bridge and not `dev-ui`. Every claim below was observed
on screen.

## Journeys

| #   | Journey                         | Result                                                                                                                                                                                                       |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Startup**                     | Window opens with one `Untitled` tab, Split arrangement, live preview. All four menus present.                                                                                                               |
| 2   | **Edit**                        | Typed Markdown into the editor; preview re-rendered live; tab gained its dirty dot; caret and word count updated to `Ln 3, Col 33` / `8 words`.                                                              |
| 3   | **Settings**                    | Menu opens; theme swatches, Appearance, Default open mode, Markdown standard, three save toggles, All settings….                                                                                             |
| 4   | **Autosave toggle**             | Clicking the **visible switch** flips it on↔off, and the projection round-trips: the status bar moved `Autosave on` → `Autosave off` → `Autosave on`.                                                        |
| 5   | **Deferred settings**           | `Format on save` and `Lint on save` render visibly unavailable; `Autosave` renders fully enabled.                                                                                                            |
| 6   | **View menu**                   | Opens with Toggle Sidebar (⌘\), Toggle Assistant (unavailable), Editor/Split/**Preview** with Split ticked, Line numbers, Word wrap, Distraction-free reading (unavailable), Full screen (F11).              |
| 7   | **Theme switch**                | Liquid Glass → Minimal repaints the entire surface: backdrop, accents, toggles, tab strip, status bar.                                                                                                       |
| 8   | **Many tabs**                   | Grew to **15 tabs**. Tabs keep their full width and the strip fills edge to edge rather than shrinking them.                                                                                                 |
| 9   | **Tab switching**               | Returning to tab 1 restored its content, its **per-document Split arrangement**, and its caret position — while other tabs stayed Editor-only.                                                               |
| 10  | **Close a tab**                 | Closing a dirty tab raises `Save changes before closing?` naming the target, with Cancel / Discard / Save.                                                                                                   |
| 11  | **Close plan prompt dismissal** | See below — including a correction to an overstated claim.                                                                                                                                                   |
| 12  | **Quit**                        | `Save changes before quitting?` with Cancel / Discard all / Save all. Cancel returned to the window with all tabs intact; Discard all exited the process cleanly, with no `GoMarkEdit` process left running. |

## The close-app trap — correction to an overstated claim

**This section originally claimed the supersede fix was proven on the real
binary. On review that claim was wrong, and it is withdrawn.**

The sequence performed was:

1. Tab 1 held unsaved changes; its close control raised the prompt, listing
   `Untitled` as the target. The plan was collecting.
2. `Escape` did nothing.
3. A click outside the box made it disappear.
4. Closing a _different_ tab then succeeded, 15 → 14, and quitting raised the
   quit prompt normally.

Step 3 was read as "the plan was abandoned". It was not. `ClosePrompt.tsx:48`
wired the backdrop to `choose('cancel')`, so **the outside click resolved the
plan as Cancel** — a clean resolution the previous code also allowed. Steps 3
and 4 would therefore have passed before the fix too.

**What actually proves the supersede fix is the unit evidence**, which was
verified by stashing the production change and confirming the test fails without
it:

```
--- FAIL: TestPrepareCloseSupersedesAnAbandonedPlan
    close_plan_test.go:417: quit PrepareClose = {Data:<nil> Error:0x...},
        want the newest request to win
```

The live walkthrough exercised the close and quit prompts end to end, including
Cancel returning to the window intact and Discard all exiting cleanly. It did
not exercise abandonment, and it is now harder to: see below.

## What the walkthrough did find — a real keyboard defect

Step 2 was the genuine discovery. `Escape` did nothing, and the cause is
structural rather than incidental.

`ModalShell` handled `Escape` in `trapFocus`, a React `onKeyDown` on the dialog
element, so it only fired while focus was **inside** the dialog. A
`keepFocusInside` guard was supposed to hold focus there, but it listens for
`focusin` — and clicking any non-focusable area, including the backdrop, moves
focus to `<body>` **without firing `focusin`**. Focus escaped silently, the
dialog's key handler went deaf, and the box became impossible to dismiss from
the keyboard. Constitution VI requires every surface to be keyboard-usable.

Reproduced in Playwright: with the backdrop click no longer dismissing the box,
`Escape` afterwards failed there too — the same defect, now visible to an
automated test.

**Fixed** by binding `Escape` to the document for as long as the modal is open,
and removing it from `trapFocus`, which keeps only its Tab handling. This
applies to every dialog built on `ModalShell`, not just the close prompt.

## And a decision applied: an outside click no longer answers the question

Per the decision taken on review, a click outside the close prompt now does
**nothing**. This box asks whether to keep unsaved work, and a stray click is
the least deliberate gesture a user can make — it should not be the one that
answers. `Escape` cancels, and Cancel takes focus when the box opens, so it
remains fully answerable from the keyboard.

`FT-VS-08` covers all three: Cancel is focused on open, an outside click leaves
the box and the tab untouched, and `Escape` cancels.

**A side effect worth noting:** removing the backdrop path removes one of the
ways a plan could be abandoned, which makes the supersede fix _less_ likely to
be needed — and correspondingly harder to trigger by hand. It remains the right
defence for the paths that stay, such as a renderer error or a window closing
mid-prompt, and its unit evidence stands.

## One observation withdrawn

~~The title-bar `+` control does not create a tab.~~ **Withdrawn — this was a
misidentification on my part, corrected on review.** The two controls at the
trailing end of the menu row are **Toggle Sidebar** and **Toggle Assistant**
(`ShellMenuRow.tsx:743-763`). The second renders an assistant icon that reads
as a `+` at this size; it is `disabled` because the Assistant is a deferred
feature, and it carries the `action.unavailable` tooltip. It is _meant_ to be
present and inert, so the whole control inventory is visible while the
Assistant is still to come. `ShellMenuRow.test.tsx:442-480` already asserts it
is disabled. **Not a defect.**

Item 1 is logged as follow-up work and is fixed in this phase; item 2 required
no change.

## What this walkthrough does not cover

- **Open and Save to disk.** Both route through a native file dialog, which is
  an OS-owned surface outside the application's own controls. `FT-VS-02` covers
  the Save path end-to-end in Playwright, including the committed status
  reaching the title bar.
- **The empty-workspace launcher.** Reaching it needs all 15 tabs closed one at
  a time. It is covered by `launcher-binding.test.ts`, which asserts the shipped
  panel's computed styles against the binding and was verified to fail without
  the fix.
- **Palettes other than Liquid Glass and Minimal**, and widths other than the
  window's own. Covered by the parity matrix.
