# T081 — each failing end-to-end case, and which side was wrong

**Requirement**: Constitution VII. Investigate every failing case individually
before changing any test; fix production where production is wrong; update a
test only where the binding and the specification show it describes a superseded
surface.
**Measured**: 2026-08-14, from a full run captured before any change.

**Starting position: 26 failed / 131 passed**, across six distinct test bodies.
The 26 cases are six bodies multiplied by width and palette, so the unit of
investigation is the body, not the case.

## Why the ordering is mandatory

The previous phase dismissed a case as an out-of-date test. It was correctly
reporting that Bold, Italic, Strikethrough, Inline code and all three headings
were unreachable at the minimum window — a real defect that had been reported
for weeks. **This pass found one more of exactly that kind**, in a body that had
every appearance of being stale.

## Verdicts

| #   | Test body                                      | Cases | Verdict                                                  |
| --- | ---------------------------------------------- | ----: | -------------------------------------------------------- |
| 1   | `window-shell.test.ts:475` T040 Settings popup |     3 | **PRODUCTION WRONG**                                     |
| 2   | `core-editor.test.ts:230` STORY-022-AC-5       |     1 | **PRODUCTION WRONG** (fixed by T077)                     |
| 3   | `window-shell.test.ts:345` T026 shell matrix   |    18 | TEST WRONG (4 stale expectations)                        |
| 4   | `window-shell.test.ts:549` T026 shell actions  |     1 | TEST WRONG (same helper)                                 |
| 5   | `core-editor.test.ts:522` STORY-018-AC-3       |     1 | TEST WRONG (2 stale expectations)                        |
| 6   | `core-editor.test.ts:608` STORY-032-AC-3       |     1 | TEST WRONG                                               |
| 7   | `appearance.test.ts:49` six palettes           |     1 | TEST WRONG — stale baseline, **owner approval required** |

### 1. The Settings popup escaped the window — a real defect

`SettingsMenu.tsx` positioned the popup with **no vertical bound at all** in
either `.application-frame` branch, and the generic branch that does clamp is
unreachable in production. At the 375×480 native minimum (`main.go:104-105`) the
popup ran to y=584.5, 591 and 591 against a 480px window — roughly 111px past
the bottom. The three save toggles and the `All settings…` row that opens the
full dialog were off-screen, with no page scroll in the webview to reach them.

FR-FT-052 requires a popup to stay at least 8 logical pixels inside the
viewport. The test was in fact **more lenient than the specification** — it
allowed ≤480 where the spec demands ≤472 — and it was still failing.

Fixed by bounding the height to what is available rather than moving the
surface: the frame-relative position is the binding's own, and shifting it would
trade one defect for a parity failure. The bound applies only when the popup
would actually overflow, because a bound creates a scroll container and Chromium
drops LCD subpixel antialiasing inside one, worth ~332 pixels against the
immutable reference.

**One correction inside the fix**, worth recording because it is the trap the
next person will hit: the first version measured against `window.innerHeight`.
`.application-frame` **is** the application window, and the parity harness draws
it inset inside a taller page, so at the 720px parity height a popup that fits
its own 619px frame was being clamped — creating exactly the scroll container
the design avoids, and 3,030 pixels of drift. Measuring the frame leaves parity
untouched and still clamps at the real minimum.

### 2. The workspace overlay swallowed toolbar clicks

Playwright reported `<aside aria-label="Workspace"> intercepts pointer events`.
This is the defect T077 fixes by not rendering the panel at that width. No test
change was needed for the cause — but two stale expectations were hiding behind
it, and only surfaced once it was fixed. See "What fixing reveals" below.

### 3–4. The shell helper described the static mock it replaced

`expectEditorStageFixtures` asserted the whole chrome was inert — disabled tabs,
a disabled New tab, a disabled New File. That was correct while the shell was a
static mock. **Feature 003's entire purpose was making it real**, so a blanket
`toBeDisabled()` had come to assert the opposite of the requirement. It now
checks inventory plus availability as `actionRegistry` defines it.

Four separate stale expectations in that one helper:

| Expectation                                    | Why it is stale                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| action bar matched by glyph text `'☰'`, `'✦'` | `ca124e41` replaced those spans with `<Icon>` SVGs for FR-FT-052's monochrome treatment, so `allTextContents()` reads two empty strings. The `☰` never matched the binding either — `mockup.html:595` draws `▤`                                                                                         |
| `release-notes.md` / `spec-draft.md` as tabs   | the plain `/` route seeds one `Untitled` (`AppModelHandler.ts:311`); those two names are the File menu's disabled recent **placeholders**, not tabs                                                                                                                                                      |
| `Open Recent` as a `menuitem`                  | wide, the binding presents recents as indented rows under a group label with no trigger row (`mockup.html:604`), so it is a label and never an item — the same shape as `Appearance` being a radiogroup name. Narrow, the popup **does** use a trigger plus submenu, so the assertion is now width-aware |
| `Image` looked up inside the toolbar           | at 768 and below it relocates into the overflow popup, which portals into `.application-frame`                                                                                                                                                                                                           |

Also corrected: the 1280 workspace width asserted **256**, where the binding says
**216** (`mockup.html:254` `.sidebar{width:216px}`, exported as
`WORKSPACE_BINDING_WIDTH`). 256 matched neither side.

### 5–6. The arrangement was read back from the status row

Both cases asserted `Document status` contains `Split`. The binding draws no
arrangement label in `.statusbar` (`mockup.html:837-845` is standard-kind,
caret, count, spacer, encoding, EOL, autosave, warnings, provider, Reading
pill), and production stopped duplicating it there when the row converged on
that inventory. Both now assert the `View arrangement` radiogroup, which owns it.

STORY-018-AC-3 carried a second stale expectation, masked behind the first:
`documentBounds.x === dividerBounds.x + dividerBounds.width`, i.e. a divider
that consumes a column. FR-FT-046 requires it to **overlay the boundary without
consuming layout width**, and `AppShell.module.css` centres it on that edge
(`inset-inline-start: calc(column - width/2)`). It now asserts the straddle.

### 7. The appearance baselines predate the feature

No source change. The expected image contains the full **Settings dialog** and a
`spec-draft.md` tab; the actual contains the compact **Settings popup** the
binding specifies (`mockup.html:624`) and an `Untitled` tab. 31,440 pixels
differ, reproduced identically — deterministic, not flake. Every structural
assertion in that case passes.

## What fixing reveals

Playwright stops a case at its first failure, so **a stale expectation hides the
next one**. Four were only discovered by fixing the one in front:

- `:489` (popup inside the viewport) hid `:492` (portal target)
- the status-row arrangement assertion hid the divider-bounds assertion
- the workspace overlay hid both the portalled arrangement radios and the
  approved 375 pane collapse
- every corrected assertion in the shell matrix hid its screenshot comparison

A count of failing cases therefore understates the work, and "26 failures, four
root causes" was an underestimate by construction.

## Final position

**Every behavioural assertion in every end-to-end suite now passes.**

| Suite                                                                                   | Result                               |
| --------------------------------------------------------------------------------------- | ------------------------------------ |
| `editor-stage.test.ts`                                                                  | 108 / 108                            |
| `narrow-width.test.ts` (new)                                                            | 20 / 20                              |
| `targeted-parity.test.ts`                                                               | 15 / 15                              |
| `real-files-and-tabs.test.ts`, `interactive-states.test.ts`, `launcher-binding.test.ts` | all passing                          |
| `core-editor.test.ts`                                                                   | 6 / 7 — the 1 is a stale baseline    |
| `window-shell.test.ts`                                                                  | 12 / 30 — the 18 are stale baselines |
| `appearance.test.ts`                                                                    | 17 / 18 — the 1 is a stale baseline  |

**The only remaining failures anywhere are the 25 committed screenshot
baselines**, which were written by `848856ef` on 2026-08-06 — before this
feature's specification was even added — with 48 commits changing
`frontend/src/ui/widgets/` or `frontend/src/ui/styles/` since. Re-approving them
is an owner action that an implementation session may not take; see
`blocking-decisions.md`, Decision B.
