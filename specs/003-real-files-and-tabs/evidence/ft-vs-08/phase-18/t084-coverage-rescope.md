# T084 — rescoping the five coverage sweeps to what is not already covered

**Requirement**: FR-FT-051, and the 2026-08-14 clarification recorded in `spec.md`.
**Measured**: 2026-08-14, by reading every assertion in `frontend/src/**/*.test.ts(x)`,
`frontend/e2e/*.test.ts`, `frontend/scripts/archtest.mjs` and the two parity manifests.

## The rule this file exists to satisfy

> Cover each state once where it can genuinely look or behave differently, skip combinations
> that only repeat an existing check, and **log every skip with the test that already covers
> it** — a silent reduction reads as full coverage when it is not. A skip with no named
> covering test is not a skip; it is a gap, and it fails the task closed.

So every state below is either **covered** (with the file, line and exact test name that
covers it) or **open** (and therefore real work). Nothing is dropped without a name.

## Result

**61 states across the five sweeps: 44 already covered outright, 16 partially covered,
1 not covered at all.** The five sweeps are rescoped to the **17 open items**.

| Sweep | Area | States | Covered | Partial | Not covered |
|---|---|---:|---:|---:|---:|
| T065 | launcher / prompts / notifications / save | 16 | 14 | 2 | 0 |
| T066 | theme and style tokens | 8 | 5 | 3 | 0 |
| T067 | responsive 768 / 375 | 11 | 6 | 5 | 0 |
| T073 | tabs / identity / toolbar | 20 | 13 | 6 | 1 |
| T074 | preview | 6 | 6 | 0 | 0 |
| **Total** | | **61** | **44** | **16** | **1** |

Two structural facts the accounting depends on:

- `frontend/e2e/real-files-parity.test.ts:1577`
  `test('T035 proves all 546 binding comparisons across three unchanged repetitions')` is a
  **single** test iterating `PARITY_MANIFEST`. Each of the additional state IDs
  (`frontend/e2e/parity/manifest.ts:54-92`) runs at all six palettes at its assigned width and
  has a guard assertion in the `establishState` switch (`real-files-parity.test.ts:745-960`)
  before its capture. "Covered by T035" therefore means state established + semantic guard
  asserted + three pixel comparisons against the binding.
- `frontend/scripts/archtest.mjs` has no `it()` names; its gates are the banner strings at
  `:158-162`.

---

## T065 — launcher, prompts, notifications, Save/Save As (14 of 16 covered)

| State | Skipped because it is already covered by |
|---|---|
| Launcher first-run | `src/ui/widgets/Launcher.test.tsx:30` `'Launcher first-run and six recent files'`; T035 state `launcher-first-run` |
| Launcher six-file | `src/ui/widgets/Launcher.test.tsx:30`; `e2e/real-files-parity.test.ts:1518` `'T057 pairs file-only launcher variants before any screenshot comparison'`; T035 `launcher-six-file` |
| Launcher empty | `e2e/real-files-and-tabs.test.ts:294` `'T051 keeps parity launchers isolated from the FT-VS-07 recent seed'` |
| Conflict — Reload | `src/App.test.tsx:768` `'Reload replaces the active same-document buffer from authoritative state'` |
| Conflict — Keep mine | `src/ui/widgets/DocumentTabs.test.tsx:313` `'ExternalChangePrompt decisions and invalidation'` |
| Conflict — Skip | `src/ui/widgets/ExternalChangePrompt.test.tsx:34`; `e2e/real-files-and-tabs.test.ts:85` `'FT-VS-04 shows the bounded external-change prompt and safe Skip decision'` |
| Close — Save | `src/ui/widgets/ClosePrompt.test.tsx:35`; `e2e/real-files-and-tabs.test.ts:153` `'FT-VS-06 close plan gathers a complete choice before any tab removal'` |
| Close — Discard | `e2e/real-files-and-tabs.test.ts:188` `'FT-VS-07 proves recents, reopen, launcher, and responsive status controls'` |
| Close — Cancel | `src/ui/widgets/ClosePrompt.test.tsx:50`; `e2e/real-files-and-tabs.test.ts:324` `'FT-VS-08 keeps the close prompt until an explicit choice is made'` |
| Normalization prompt | `src/ui/widgets/NormalizationPrompt.test.tsx:5` and `:34`; `src/App.test.tsx:834`; T035 `prompt-normalization` |
| Save notifications / toasts | `src/ui/primitives/Toast.test.tsx:134`; `src/App.test.tsx:726`; `e2e/real-files-and-tabs.test.ts:25` `'FT-VS-02 flushes the latest edit and reports one explicit Save confirmation'` |
| Reopen last file | `e2e/real-files-and-tabs.test.ts:188` |
| Recents list | `e2e/real-files-and-tabs.test.ts:188`; `e2e/launcher-binding.test.ts:152` `'T057 draws the launcher recents list from the binding'` |
| Open Folder unavailable | `src/ui/widgets/Launcher.test.tsx:30`; `e2e/real-files-and-tabs.test.ts:188` and `:294` |

**Closed 2026-08-14** in `frontend/src/App.test.tsx` and `frontend/src/ui/widgets/DocumentTabs.test.tsx`:
1. **Save As outcome** — routing, bridge shape and mock-model adoption are asserted
   (`ShellMenuRow.test.tsx:331`, `logic/adapter/services.test.ts:57`,
   `dev/bridge-mock/appModel.test.ts:402`), but **nothing asserts the post-commit UI**: the
   adopted path in the identity heading, the tab relabel, the confirmation toast.
2. **Recovery (resync) prompt** — T035 `resync-recovery` asserts only that the close dialog is
   visible, not the recovery-specific copy or outcome.

---

## T066 — theme and style tokens (5 of 8 covered)

| State | Skipped because it is already covered by |
|---|---|
| All six palettes across converged slices | `src/ui/styles/tokens.test.ts:310` `'suppliesEveryAppearanceContractTokenAcrossAllSixPalettes'`; `e2e/appearance.test.ts:49`; `e2e/window-shell.test.ts:345` T026 shell matrix |
| Colour tokens | `src/ui/styles/tokens.test.ts:338`, `:93`, `:101`, `:318` |
| Border tokens | `src/ui/styles/tokens.test.ts:359` `'routes every current appearance surface through palette tokens'`; `:108` |
| Focus ring tokens | `src/ui/styles/tokens.test.ts:310` and `:139`; `e2e/window-shell.test.ts:605`; `e2e/interactive-states.test.ts:60` |
| Absence of literal colours | `scripts/archtest.mjs:69-127` (`archtest (frontend) — colour literals`); `src/ui/styles/tokens.test.ts:359` and `:40` |

**Closed 2026-08-14** in `frontend/src/ui/styles/tokens.test.ts`, which now gates all four tokens across
all six palettes, asserts elevation and typeface differ per family (FR-FT-053) and asserts the
unavailable opacity does not (FR-FT-056). Each was the same defect — a token asserted in **one** palette where the
all-six-palette gate would catch a palette-specific regression:
3. **Shadow tokens** — `--win-shadow` / `--context-menu-shadow` are absent from
   `requiredPaletteTokens`; the exact value is asserted for `material` only
   (`DocumentTabs.test.tsx:131`).
4. **Disabled-state tokens** — `--disabled-opacity` asserted at `material-light` only
   (`tokens.test.ts:151`); no rendered disabled surface asserted per palette.
5. **Typography tokens** — `--font` differs per theme (`tokens.css:32/224/233/242`) but is not
   in `requiredPaletteTokens`; no per-palette font-family assertion.

---

## T067 — responsive behaviour at 768 and 375 (6 of 11 covered)

`editor-stage.test.ts` and `window-shell.test.ts` both iterate `[1280, 768, 375]` × 3 themes ×
3 modes, which is why most of this sweep is already paid for.

| State | Skipped because it is already covered by |
|---|---|
| Menubar | `e2e/editor-stage.test.ts:16` `T019 …keeps the Editor stage reachable`; `:138` `T070 …keeps popup ownership and geometry safe`; `src/ui/widgets/ShellMenuRow.test.tsx:613` |
| Toolbar overflow menu | `e2e/editor-stage.test.ts:442` `T055 …`; `src/ui/widgets/EditorChrome.test.tsx:208` and `:73` |
| Tabs / toolbar | `e2e/editor-stage.test.ts:16` and `:320` |
| Editor / status | `e2e/editor-stage.test.ts:320`; `e2e/real-files-and-tabs.test.ts:188`; `src/ui/widgets/AppShell.test.tsx:299` |
| Control reachability | `e2e/editor-stage.test.ts:16` and `:442`; `e2e/window-shell.test.ts:475` `T040 Settings popup stays operable inside the ${width}px viewport` |
| Overlay behaviour | `e2e/editor-stage.test.ts:138`; `e2e/window-shell.test.ts:519` `T041 …restores the connected ${width}px Settings opener` |
| No unintended page scroll | `e2e/editor-stage.test.ts:16`, `:320`, `:442`; `e2e/appearance.test.ts:49` |

**Closed 2026-08-14** by `frontend/e2e/narrow-width.test.ts` (20 tests) and one added case in
`frontend/src/ui/widgets/EditorChrome.test.tsx`:
6. **Prompts at 768** — every prompt parity state is assigned width 375; nothing exercises a
   prompt at 768.
7. **Launcher at 768** — asserted as a CSS media-query *string* (`Launcher.test.tsx:11`), never
   rendered or measured at 768.
8. **Preview at 768/375** — bounding-box order only (`editor-stage.test.ts:320`); no
   narrow-width preview interaction.
9. **Toolbar drop order** — `EditorChrome.test.tsx:208` asserts the `overflowAt768` /
   `overflowAt375` buckets exist, not **which** groups land in each. This is the gap that let
   Bold, Italic, Strikethrough, Inline code and all three headings go missing from the narrow
   overflow entirely.
10. **No unintended wrapping** — asserted at 1280 for the status bar only
    (`targeted-parity.test.ts:1492`); not at 768/375, not for other rows.

Item 9 was the one that mattered most, and it is now mutation-proven: deleting the text and heading
groups from `.overflowAt375` — the exact regression that shipped — fails both new tests with the
precise seven missing ids. The 768 bucket was measured live rather than assumed:
`bullet-list, numbered-list, task-list, quote, link, image, table`, with no arrangement radios and no
application menus, because `.overflowAt375` and `.applicationOverflowItems` are `display: none` above
376px.

Four measured facts recorded while closing these, none of them defects: `New tab` and the overflow
`<summary>` compute `white-space: normal` and have no break opportunity, so the no-wrap rule is
applied only to labels longer than one character; parity routes re-lay-out the close prompt
(`position: absolute; max-height: none`), so containment is asserted on the ordinary route instead; a
paused preview pane has no box at all, because `EditorView.module.css:47-53` gives it
`display: contents` while the paused bar spans the grid; and the close prompt's DOM order is
`Cancel, Discard, Save`, deliberately placing the dismissing choice where focus lands.

---

## T073 — tabs, document identity, toolbar (13 of 20 covered)

| State | Skipped because it is already covered by |
|---|---|
| Tab selected | T035 `tab-active` (asserts `aria-selected="true"` on first tab, zero others) |
| Tab inactive | T035 `tab-inactive` |
| Tab dirty | `src/ui/widgets/DocumentTabs.test.tsx:289` `'renders real dirty state and full canonical path tooltips'`; T035 `tab-dirty` |
| Tab autosave-in-flight | `src/ui/widgets/DocumentTabs.test.tsx:299` `'mutes the dirty dot only while the backend reports a write in flight'`; T035 `tab-autosave-in-flight` |
| Tab blocked-by-conflict | `src/ui/widgets/DocumentTabs.test.tsx:429` `'queued conflict tabs render blocked-by-conflict'`; T035 `tab-blocked-conflict` |
| Tab identical-basename | `src/ui/widgets/tabLabel.test.ts:27`; T035 `tab-identical-basename` |
| Tab adjacent-after-close | T035 `tab-adjacent-after-close` |
| Tab contained-overflow | `src/ui/widgets/DocumentTabs.test.tsx:81`; `e2e/editor-stage.test.ts:16`; T035 `tab-contained-overflow` |
| Tab 40-document | T035 `tab-40-document` (`toHaveCount(40)` at 375) |
| Close action | `e2e/real-files-and-tabs.test.ts:153`; `e2e/editor-stage.test.ts:320` |
| Reorder action | `src/ui/widgets/DocumentTabs.test.tsx:262` and `:245`; `src/ui/widgets/TabContextMenu.test.tsx:32`; `e2e/real-files-and-tabs.test.ts:53` |
| Live region | `src/ui/primitives/LiveRegion.test.tsx:5`; `e2e/real-files-and-tabs.test.ts:53` (asserts `position 1 of 2`) |
| Hostile / long labels | `src/ui/widgets/tabLabel.test.ts:37`, `:48`, `:56`; T035 `label-long-localized`, `path-hostile-disambiguated`, `label-short` |
| Document identity not-saved | `src/ui/widgets/DocumentIdentity.test.tsx:52` and `:92`; T035 `identity-not-saved` |

**Closed 2026-08-14** in `frontend/src/ui/widgets/DocumentTabs.test.tsx` (10 new tests). This was the
largest cluster and held the feature's only NOT COVERED item:
11. **Focus / roving tabindex in the tab strip** — **NOT COVERED.**
    `src/ui/widgets/DocumentTabs.tsx:505` sets `tabIndex={active ? 0 : -1}`; no test anywhere
    asserts tab `tabindex` or focus movement within the tablist.
12. **Keyboard navigation** — only `next-tab` is pressed (`real-files-and-tabs.test.ts:53`);
    `previous-tab` (`Ctrl+PageUp`) is never exercised, and no Arrow/Home/End within the tablist.
13. **Copy-path action** — menu presence only (`DocumentTabs.test.tsx:220`); never invoked, no
    outcome asserted.
14. **Reveal action** — menu presence only; never invoked, no outcome asserted.
15. **Tab read-only** — T035 `tab-read-only` asserts the **status bar** reads Read-only;
    nothing asserts a read-only affordance on the tab itself.
16. **Tab detached** — T035 `tab-detached`'s only guard is an `aria-label` filename match; no
    detached-specific assertion.

---

## T074 — preview (6 of 6 covered — this sweep is closed by existing tests)

| State | Skipped because it is already covered by |
|---|---|
| Preview paused | `src/ui/widgets/PreviewPane.test.tsx:125` `'T064 presents source-backed paused preview chrome above the pane content'`, `:96`, `:174`; T035 `preview-paused` |
| Preview refreshing | `src/ui/widgets/PreviewPane.test.tsx:143`; T035 `preview-refreshing` (asserts `aria-busy="true"`) |
| Preview refresh-failed + Retry | `src/ui/widgets/PreviewPane.test.tsx:204` `'keeps a failed refresh paused, classifies io-failure, and offers Retry'`; T035 `preview-refresh-failed` |
| Arrangement → Editor | `e2e/core-editor.test.ts:627` `'STORY-018-AC-4 verifies view-mode and View-menu interaction'` |
| Arrangement → Split | `e2e/core-editor.test.ts:627`; `e2e/interactive-states.test.ts:146` `'T076 keeps every arrangement option reachable and exactly one checked'` |
| Arrangement → Preview | `e2e/core-editor.test.ts:627`; `src/logic/store/docViewCommands.test.ts:66` |

**Open: none.** T074's states are each already exercised with a real assertion, at the level
the state can differ. Its remaining obligation is the parity artifact retention, which belongs
to T068's evidence contract rather than to a new sweep.

---

## What this reduction does not do

It does not reduce the unrestricted 546-key matrix, change any manifest count, or touch the
comparator, masks, tolerance, coordinate handling or the immutable source. It reduces only how
much **new** test-writing T065–T067, T073 and T074 require, by naming the test that already
does the job for each of the 44 covered states.
