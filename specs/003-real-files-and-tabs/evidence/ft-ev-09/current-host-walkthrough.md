# Walkthrough of the built binary — 2026-08-13

**Build**: `just build` → `build/bin/GoMarkEdit.app`, exit 0, self-signed, 11.3s.
**Host**: macOS (darwin, arm64), current host only.
**Method**: the real application driven through its actual controls — pointer and
keyboard — not the mock bridge and not `dev-ui`. Every claim below was observed
on screen.

## Journeys

| # | Journey | Result |
|---|---|---|
| 1 | **Startup** | Window opens with one `Untitled` tab, Split arrangement, live preview. All four menus present. |
| 2 | **Edit** | Typed Markdown into the editor; preview re-rendered live; tab gained its dirty dot; caret and word count updated to `Ln 3, Col 33` / `8 words`. |
| 3 | **Settings** | Menu opens; theme swatches, Appearance, Default open mode, Markdown standard, three save toggles, All settings…. |
| 4 | **Autosave toggle** | Clicking the **visible switch** flips it on↔off, and the projection round-trips: the status bar moved `Autosave on` → `Autosave off` → `Autosave on`. |
| 5 | **Deferred settings** | `Format on save` and `Lint on save` render visibly unavailable; `Autosave` renders fully enabled. |
| 6 | **View menu** | Opens with Toggle Sidebar (⌘\), Toggle Assistant (unavailable), Editor/Split/**Preview** with Split ticked, Line numbers, Word wrap, Distraction-free reading (unavailable), Full screen (F11). |
| 7 | **Theme switch** | Liquid Glass → Minimal repaints the entire surface: backdrop, accents, toggles, tab strip, status bar. |
| 8 | **Many tabs** | Grew to **15 tabs**. Tabs keep their full width and the strip fills edge to edge rather than shrinking them. |
| 9 | **Tab switching** | Returning to tab 1 restored its content, its **per-document Split arrangement**, and its caret position — while other tabs stayed Editor-only. |
| 10 | **Close a tab** | Closing a dirty tab raises `Save changes before closing?` naming the target, with Cancel / Discard / Save. |
| 11 | **Close plan abandoned** | See below — the session's primary fix. |
| 12 | **Quit** | `Save changes before quitting?` with Cancel / Discard all / Save all. Cancel returned to the window with all tabs intact; Discard all exited the process cleanly, with no `GoMarkEdit` process left running. |

## The close-app trap, proven against the real binary

Session decision 4 required proving this on the real backend rather than the
mock. The exact sequence performed:

1. Tab 1 held unsaved changes. Clicking its close control raised the close
   prompt, which listed `Untitled` as its target — the plan was **collecting**.
2. `Escape` did **not** dismiss the prompt. A click outside it **did** — and
   that path resolves nothing: no Save, no Discard, no Cancel reached the
   backend. **The plan was abandoned exactly as the defect requires.**
3. With that plan abandoned, closing a *different* tab **succeeded** — the tab
   count went 15 → 14.
4. Quitting then **raised the quit prompt** normally.

Under the previous code, steps 3 and 4 both returned `"Another close plan is
already collecting choices."` and the window could never be closed again. Both
now work, on the real bridge, in the built binary.

## Two observations recorded, not fixed

Neither is a regression from this phase; both are recorded rather than left
unsaid.

1. **`Escape` does not dismiss the close prompt.** An outside click does. For an
   unsaved-changes prompt the conservative behaviour is defensible, but
   Constitution VI requires every surface to be usable with the keyboard, and
   the sibling prompts in this application do close on `Escape`. Worth a
   decision: either wire `Escape` to Cancel, or state deliberately that this one
   prompt requires an explicit choice — in which case the *outside click* should
   arguably not dismiss it either, since that is the less deliberate gesture of
   the two.
2. **The title-bar `+` control does not create a tab.** It takes focus and draws
   a correct focus ring, but six clicks produced no new tab, while the tab-strip
   `+` creates one every time. Either it is bound to something not yet
   implemented, or it is inert.

Both are logged as follow-up work; neither blocks the journeys above.

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
