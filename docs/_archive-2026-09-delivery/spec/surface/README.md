# The surface

| Artifact | Fixes | Tier |
|---|---|---|
| `mockup.html` | Every screen and state, in three themes × two appearances × three widths | **A — binding** |

`mockup.html` is one self-contained offline HTML file. Open it in any browser. There is no build step
and it fetches nothing.

## Tier A — binding, and why

GoMarkEdit's interface renders in a webview. The mockup is HTML and CSS, and so is the application.
The mockup is therefore not an impression of the target — it *is* the target, expressed in the same
technology. A visible difference between the shipped app and this file is a defect in one of them, not
an expected translation loss.

This is stronger than the tier a mockup usually gets, and it is only justified because there is no
translation boundary. If the interface ever moved to a native toolkit, this would drop to Tier B and a
mapping table would be needed.

## Arbitration

**The mockup wins on shape. The feature file wins on behaviour.**

Shape is what exists, what it is called, what order it is in, what it looks like: which controls are
present, their grouping and reading order, the exact label text, the token values, which states exist.
If the app disagrees with the mockup about any of that, the app is wrong.

Behaviour is what happens, when, and why: what a control does, what the app does on failure, what is
persisted, what happens at a boundary. The mockup draws a state; it never explains one. If a feature
file disagrees with the mockup about behaviour, the mockup is a picture and the feature file governs.

## Deep-linking a state

The URL hash is `#<theme>-<mode>/<screen>`:

- `mockup.html#glass-dark/editor-split`
- `mockup.html#material-light/settings-ai-providers`
- `mockup.html#minimal-light/save-prompt`

`<theme>` is `glass`, `material` or `minimal`. `<mode>` is `auto`, `light` or `dark`. `<screen>` is one
of the 44 ids in the table below. Feature files link exact states this way.

Selecting a theme defaults it to its native appearance — Glass to dark, Material to light, Minimal to
light — so each theme is first seen at its intended best. Appearance can then be flipped.

## Widths

A **Width** control sets the app frame to 375, 768 or 1280 pixels, so all three are demonstrable
without resizing the browser.

| | 1280 | 768 | 375 |
|---|---|---|---|
| Assistant region | shown | hidden | hidden |
| Sidebar | full | 46 px icon rail | overlay, opened from the title bar |
| Editor and preview | side by side | side by side | stacked |
| Toolbar | all groups | list and link groups fold into the `»` overflow menu | plus the text buttons and the view control |
| Menu bar | in the title bar | in the title bar | folded into the overflow menu |
| Status bar | everything | drops the provider | drops provider, autosave, encoding, line ending, counts, caret |

The status bar drops items in one fixed order, so an item is never in two different places at two
widths. Problems and Reading are never dropped.

All 45 screens are verified to render in six palettes at three widths — **45 × 6 × 3 = 810
combinations** — with no horizontal overflow.

*(This paragraph read "44 screens … 264 combinations" until 2026-07-28. 264 was 44 × 6, with the three
widths dropped; the screen count has since gained `startup-failure`.)*

## Screen map

Every screen names the feature file that governs its behaviour.

| Screen id | What it shows | Behaviour owned by |
|---|---|---|
| `editor-split` | Editor and preview side by side | `../product/writing-in-the-editor.md` |
| `editor-only` | Editor filling the document area | `../product/writing-in-the-editor.md` |
| `preview-only` | Preview filling the document area | `../product/reading-a-document.md` |
| `reading` | Reading mode — all chrome hidden | `../product/reading-a-document.md` |
| `empty` | The launcher: no document open. Every launch starts here | `../product/the-app-window.md` |
| `no-sidebar` | Sidebar collapsed | `../product/the-app-window.md` |
| `no-assistant` | Assistant region collapsed | `../product/the-app-window.md` |
| `assistant-reserved` | The reserved but empty right region — what every phase before the assistant looks like | `../product/the-app-window.md` |
| `startup-failure` | The whole window when the app cannot start: `GoMarkEdit could not start` · `GoMarkEdit could not initialize its local settings. Please try again.` · Retry. Not an overlay — there is no shell behind it | `../product/the-app-window.md` |
| `focus` | The focus ring on each control type | `../constraints.md#every-action-is-reachable-by-keyboard` |
| `tokens` | The design-token reference | `../product/themes-and-appearance.md` |
| `menu-file` | The File menu | `../product/opening-and-saving-files.md` |
| `menu-settings` | The Settings menu, including the theme swatches | `../product/themes-and-appearance.md` |
| `menu-view` | The View menu | `../product/the-app-window.md` |
| `menu-about` | The About menu | `../product/the-app-window.md` |
| `context-menu` | The file-tree context menu | `../product/a-folder-of-notes.md` |
| `tab-menu` | The tab context menu | `../product/working-in-tabs.md` |
| `editor-menu` | The editor context menu | `../product/writing-in-the-editor.md` |
| `toolbar-overflow` | The `»` overflow menu at narrow widths | `../product/formatting-text.md` |
| `empty-tree` | A folder with no Markdown files in it | `../product/a-folder-of-notes.md` |
| `filter-empty` | A tree filter that matched nothing | `../product/finding-things.md` |
| `problems` | The lint findings list behind the status-bar count | `../product/tidying-markdown.md` |
| `diff-view` | The before-and-after diff | `../product/tidying-markdown.md` |
| `paused-preview` | Live preview paused for a large document, with manual refresh | `../product/reading-a-document.md` |
| `busy` | A long operation with progress and an in-place Cancel | `../constraints.md#a-long-operation-is-visible-and-cancellable` |
| `save-prompt` | Save / Discard / Cancel on closing a modified document | `../product/opening-and-saving-files.md` |
| `quit-prompt` | Quitting with several modified documents, each listed | `../product/opening-and-saving-files.md` |
| `reload-prompt` | The file changed on disk, with the difference shown | `../product/opening-and-saving-files.md` |
| `drop-overlay` | "Drop to open" while dragging files over the window | `../product/dragging-files-in.md` |
| `drop-prompt` | Dropping a folder while one is already open | `../product/dragging-files-in.md` |
| `banner` | The remote-content banner in the preview | `../product/images-and-remote-content.md` |
| `toasts` | Success, warning and error notifications | `../constraints.md#every-error-message-is-distinct-and-actionable` |
| `shortcuts` | The keyboard shortcuts dialog | `../product/keyboard-shortcuts.md` |
| `about` | The About dialog | `../product/the-app-window.md` |
| `settings-appearance` | Settings → Appearance | `../product/themes-and-appearance.md` |
| `settings-editor` | Settings → Editor | `../product/writing-in-the-editor.md` |
| `settings-markdown` | Settings → Markdown | `../product/choosing-a-markdown-standard.md` |
| `settings-privacy` | Settings → Content and privacy | `../product/images-and-remote-content.md` |
| `settings-language` | Settings → Language | `../product/language-and-text.md` |
| `settings-export` | Settings → Export | `../product/exporting-a-document.md` |
| `settings-diagnostics` | Settings → Diagnostics | `../product/settings.md` |
| `settings-ai-providers` | Settings → AI · Providers | `../product/connecting-an-ai-provider.md` |
| `settings-ai-context` | Settings → AI · Context | `../product/how-much-fits-in-context.md` |
| `assistant-chat` | Assistant chat with tool-call chips and an apply-diff card | `../product/chatting-about-a-document.md` |
| `assistant-selection` | Assistant with a selection scope and the token-fit meter | `../product/how-much-fits-in-context.md` |

## Two states this file deliberately does not draw

Both are specified in prose instead, because a still image communicates a gesture poorly and a faked
one is worse than none.

**The tab-reorder insertion indicator.** Dragging a tab shows a vertical insertion line at the position
the tab will land in, and the dragged tab itself renders at reduced opacity. Pressing Escape during the
drag cancels it and the tab returns to its original position. `../product/working-in-tabs.md` governs it.

**Loading placeholders.** Two momentary states: the editor area while Monaco is still initialising, and
the file tree while a large folder is being enumerated. Both show the same skeleton treatment used for
the Mermaid placeholder, which *is* drawn. `../constraints.md#every-list-has-an-empty-state` covers the
requirement that they exist.

## Keeping it honest

Every token the mockup uses is named in `../product/themes-and-appearance.md`, and every token named
there is used here. A token in one and not the other is a defect in both.

Corrections carried over from the previous specification, recorded so nobody re-derives them:

- The old `specification/INDEX.md` said the mockup had 23 screens. It has 44.
- The old roadmap row for Phase 10 promised "PDF or HTML" while the phase title said only "as a PDF".
  There is no HTML export: `../product/exporting-a-document.md#pdf-is-the-only-export` settles it.

Six defects in this file were fixed on 2026-07-28. Because the mockup is Tier A, a control it draws for
a feature that does not exist is a defect in the mockup, not a feature the product owes:

- **Settings → Export drew an "HTML export" row** with Standalone and Fragment options. HTML export was
  drift from an earlier migration and is not a capability. The row was removed; the group now holds PDF
  styling alone.
- **The File menu showed `Export to PDF… Ctrl P`.** That is the pre-2026-07-25 binding. `Ctrl/Cmd+P` is
  quick-open and Export moved to `Ctrl/Cmd+Shift+E` — which this same file's shortcuts dialog already
  showed correctly, so it disagreed with itself. The menu now matches the registry.
- **AI · Context drew a `Warn` / `Chunk` pair** for "If document exceeds context". Chunking was cut from
  v1 — see the `Not this` section of `../product/how-much-fits-in-context.md` — and the control is not
  shipped, because a segmented control with one option is not a choice. The row is now a read-only
  statement of the single behaviour.
- **AI · Context drew a `Sliding window` / `Summarize` pair** for "Chat history strategy". Summarising was
  cut for the same reason and is now the same read-only statement.
- **The provider pane drew three test buttons.** `../../adr/0034-assistant-execution-contract.md` and
  `../../plan/phase-11-ai-provider.md` require **four**. The missing one was **Test tools**, which is the
  one that tells you whether the model can drive the assistant at all — the most consequential of the
  four to be missing. It has been added.
- **A footnote cited a theming document under the deleted `specification/01_Product/` tree**, by a path
  and anchor that no longer resolve anywhere. It now reads
  `../product/themes-and-appearance.md#theme-identity-is-stable`.

Three additions on the same date, where the mockup was silent and the specification was not:

- **The frameless window's own chrome.** The title bar now carries `--wails-draggable: drag` with
  `no-drag` on every interactive child, and the app frame carries the **eight resize zones** — a 6-pixel
  band per edge and a 12-pixel corner square. A frameless Wails window does not reliably get the
  platform's resize borders (`../../plan/KNOWN_ISSUES.md` §13), so the app draws its own; the zones being
  absent from a Tier A mockup is the same defect as the specification not naming them.
  `../product/the-app-window.md#the-window-has-its-own-resize-zones` governs them.
- **The model filter, twice.** AI · Providers and the assistant's header chip both gained a filter box, a
  `N of M shown` header and a clear control — `../product/connecting-an-ai-provider.md#every-model-picker-filters`.
- **`--z-resize` (`20`)** joined the stacking scale, between `--z-sticky` and `--z-dropdown`. The resize
  zones must sit above the title bar they overlap and below an open menu, and nothing in this file picks
  a numeric `z-index`.

## Screens this file does not draw yet

**Phase 09 adds three.** The command palette, quick-open and the Outline tab are specified in
`../product/finding-things.md` and drawn nowhere here — the screen map above has `filter-empty` and the
sidebar the Outline tab will sit in, and nothing else from that phase. Because this file is Tier A,
drawing them is a **deliverable of Phase 09**, done before the screens are built rather than after.
`../../plan/phase-09-find-anything.md` records it as such.

## Where the shipped app and this file currently disagree

Recorded 2026-07-28. This file is Tier A, so where it disagrees with the code on **shape**, the code is
what changes — but only when a story says so, and not all of these have one yet.

- **The Phase 02 appearance controls are transitional, and this file does not draw them.** STORY-058
  shipped `SettingsMenu.tsx` and `AppearanceDialog.tsx` — a compact swatch row and a minimal dialog,
  the two smallest controls that make theme selection a real user journey. What this file draws at
  `#material-light/menu-settings` and `#material-light/settings-appearance` is the **Phase 03**
  target: the full Settings menu and the complete Appearance pane inside the settings shell.
  The divergence is deliberate and it is not a defect in either. Phase 03 replaces the Phase 02
  controls with what is drawn here, so this file is **not** being redrawn to match a state that is
  scheduled to disappear — drawing the transitional shape would create a second thing to un-draw
  later.
- **The ten missing tokens.** `#material-light/tokens` shows the complete token reference, including
  `--canvas`, `--elevated`, `--surface-2`, `--surface-3`, `--stroke`, `--stroke-soft`, `--muted`,
  `--faint`, `--hover` and `--user-bubble`. None of them exists in `frontend/src/ui/styles/tokens.css`
  yet. This file is right and the code is wrong; **STORY-062** closes it.
  See `../../plan/KNOWN_ISSUES.md` items 6 and 14.
- **The startup-failure copy.** `startup-failure` above, and
  `../product/the-app-window.md`, both give `GoMarkEdit could not start` and `GoMarkEdit could not
  initialize its local settings. Please try again.` The shipped
  `frontend/src/i18n/locales/en.json` says `The application could not start. Try again.` The
  specification is normative, so the code is the defect — recorded as
  `../../plan/KNOWN_ISSUES.md` item 16 and resolved by Phase 03, which is where bootstrap and this
  screen are next touched. Neither side was changed on 2026-07-28.
