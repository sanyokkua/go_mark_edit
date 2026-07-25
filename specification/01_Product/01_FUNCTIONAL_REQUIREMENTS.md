**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `01_Product/03_FILES_TABS_WORKSPACE.md`, `01_Product/04_MARKDOWN_STANDARDS.md`, `01_Product/05_RENDERING_AND_EXTENSIONS.md`, `01_Product/06_FORMAT_AND_LINT.md`, `01_Product/07_PDF_EXPORT.md`, `01_Product/08_FILE_ASSOCIATIONS.md`, `01_Product/09_ASSETS_AND_SECURITY.md`, `01_Product/10_THEMING.md`, `01_Product/11_SETTINGS.md`, `01_Product/12_KEYBOARD_SHORTCUTS.md`, `01_Product/13_I18N.md`, `mockups/gomarkedit-mockup.html`

# Functional Requirements

This document is the top-level functional-requirement index for GoMarkEdit. Each `FR-*` section states
one binding requirement, its rationale, and acceptance notes, then defers detail to the feature
document that owns it. The master edge-case registry lives in [Edge cases](#edge-cases); feature
documents repeat their own subset. All requirements inherit the non-negotiable constraints of
`00_Foundation/04_DESIGN_DECISIONS.md` (offline-first with no background network, no telemetry, no
auto-update, token-driven theming, multi-instance).

## Table of Contents

1. [FR-Editor](#fr-editor)
2. [FR-Viewer](#fr-viewer)
3. [FR-Files](#fr-files)
4. [FR-Workspace](#fr-workspace)
5. [FR-Tabs](#fr-tabs)
6. [FR-Recent](#fr-recent)
7. [FR-Autosave](#fr-autosave)
8. [FR-Standards](#fr-standards)
9. [FR-Rendering](#fr-rendering)
10. [FR-Format-Lint](#fr-format-lint)
11. [FR-PDF](#fr-pdf)
12. [FR-Associations](#fr-associations)
13. [FR-Assets](#fr-assets)
14. [FR-Theming](#fr-theming)
15. [FR-Settings](#fr-settings)
16. [FR-Shortcuts](#fr-shortcuts)
17. [FR-i18n](#fr-i18n)
18. [Edge cases](#edge-cases)

## FR-Editor

**Requirement.** GoMarkEdit provides an Editor mode that shows the Markdown **source** with syntax
highlighting (Monaco, DD-20), a rich formatting toolbar whose actions operate on the current
selection or line, line numbers and word wrap toggles, and a live rendered preview (DD-09). No
WYSIWYG editing exists; the source is always the edited artefact.

**Rationale.** Authors want fast, predictable source editing with immediate visual feedback (goal G1).

**Acceptance notes.** Typing updates the editor's working buffer, which debounce-syncs to the backend
application model — the owner of canonical content and the dirty flag (DD-62/DD-64); toolbar/shortcut
formatting mutates only the selection/line; the preview updates within the debounce window. Full
behaviour in `02_EDITOR_AND_VIEWER_MODES.md#editor-mode`.

## FR-Viewer

**Requirement.** GoMarkEdit provides a Viewer (distraction-free reading) mode that renders the current
document and **hides all chrome** — sidebar, tabs, toolbar, menu bar, and status bar (DD-30) — leaving
only the rendered document in the active theme.

**Rationale.** Reading Markdown beautifully with zero distraction (goals G2, G4).

**Acceptance notes.** Entering reading mode (`Ctrl/Cmd+Enter`) removes every chrome element; exiting
restores the prior editor layout. See `02_EDITOR_AND_VIEWER_MODES.md#viewer-reading-mode` and the
`.reader` region of `mockups/gomarkedit-mockup.html`.

## FR-Files

**Requirement.** GoMarkEdit can create new documents and open, save, and "save as" files with the
extensions `.md`, `.markdown`, `.mdown`, `.txt` (DD-07) using native OS dialogs. New files are written
UTF-8; opened files preserve their existing line endings and BOM on round-trip and never silently
rewrite them (DD-15). Encoding and line ending are shown in the status bar.

**Rationale.** Reliable, lossless file I/O is the product's foundation (goal G1).

**Acceptance notes.** A CRLF file saved after edits stays CRLF; a BOM file keeps its BOM. Detail in
`03_FILES_TABS_WORKSPACE.md#new-open-save`, `#save-as`, `#encoding-and-line-endings`.

## FR-Workspace

**Requirement.** GoMarkEdit can open a folder as a workspace, shown as a recursively-populated tree
**filtered** to `.md`, `.markdown`, `.mdown`, `.txt` — all other files and dotfiles are hidden
(DD-06). Children load lazily; a large-folder guard prevents runaway enumeration.

**Rationale.** Navigate a body of notes like an IDE (goal G3).

**Acceptance notes.** Non-matching files never appear; expanding a node loads its children. Detail in
`03_FILES_TABS_WORKSPACE.md#open-folder`, `#tree-filter`.

## FR-Tabs

**Requirement.** GoMarkEdit supports multiple document tabs within a window (DD-05). Opening a file
already open in the current window focuses its existing tab rather than duplicating it. Each tab
carries its own dirty state and per-document view state.

**Rationale.** Work across several documents simultaneously (goal G1).

**Acceptance notes.** No duplicate tab for the same path; closing a dirty tab prompts. Detail in
`03_FILES_TABS_WORKSPACE.md#tabs`.

## FR-Recent

**Requirement.** GoMarkEdit records recent files and recent folders (MRU, bounded) and offers
"Reopen last file / folder". On launch the app opens clean with **no automatic session restore**
(DD-11); the user reopens explicitly.

**Rationale.** Quick return to recent work without surprising auto-restore (goals G1, G4).

**Acceptance notes.** Recent list is MRU-ordered, prunes missing paths lazily. Detail in
`03_FILES_TABS_WORKSPACE.md#recent`, `#reopen-last`.

## FR-Autosave

**Requirement.** GoMarkEdit autosaves **existing** files when enabled (default on, DD-12). A new,
never-saved buffer is never silently written; it requires an explicit Save / Save As. Autosave state
is visible in the status bar and menu.

**Rationale.** Prevent data loss for saved documents while never inventing a file path for a new one.

**Acceptance notes.** Toggling autosave is immediate; new buffers ignore autosave. Detail in
`03_FILES_TABS_WORKSPACE.md#autosave` and `11_SETTINGS.md#editor-group`.

## FR-Standards

**Requirement.** The Markdown standard is a user setting with three levels — **Minimal (CommonMark)**,
**GFM** (default), **Full** (GFM + math + footnotes + directives/admonitions + frontmatter) — that
drives both parsing and rendering (DD-14).

**Rationale.** Match the document's expected flavour and avoid over-rendering (goal G2).

**Acceptance notes.** Changing the standard re-renders open documents with the mapped plugin set.
Detail in `04_MARKDOWN_STANDARDS.md#standard-levels`, `#plugin-mapping`.

## FR-Rendering

**Requirement.** GoMarkEdit renders through react-markdown with remark-gfm, remark-math, rehype-katex,
and rehype-highlight, plus a `components` override that turns ` ```mermaid ` fences into an async
MermaidBlock (DD-19). GFM tables/task-lists/strikethrough/autolinks, KaTeX
math, code highlighting, and Mermaid diagrams all render; each has a defined error state.

**Rationale.** Faithful, offline GFM+extensions rendering (goal G2).

**Acceptance notes.** A document with a table, `$E=mc^2$`, a fenced code block, and a Mermaid graph
renders correctly; invalid Mermaid/KaTeX shows an inline error, not a crash. Detail in
`05_RENDERING_AND_EXTENSIONS.md#pipeline`.

## FR-Format-Lint

**Requirement.** GoMarkEdit provides **Format** (pretty-print), **Compact** (conservative whitespace
tightening, DD-16), and **Lint** (consistency via remark-lint, DD-17). All run on demand and,
optionally, on save (DD-18). Canonical style defaults: bullet `-`, emphasis `_`, ATX headings `#`.

**Rationale.** Keep Markdown tidy and consistent without leaving the app (goal G1).

**Acceptance notes.** Format normalises markers/tables; lint findings appear as squiggles plus a
status-bar count. Detail in `06_FORMAT_AND_LINT.md#format`, `#lint`, `#on-save`.

## FR-PDF

**Requirement.** GoMarkEdit exports the **current document** to PDF via the webview print path against a
print-scoped copy of the rendered preview (DD-23). A setting selects **Current theme** or **Clean
document** styling (DD-24). v1 has no paginated-layout controls.

**Rationale.** Share a rendered document as a portable file (goal G2).

**Acceptance notes.** Export waits for Mermaid/KaTeX to finish, then invokes print. Detail in
`07_PDF_EXPORT.md#export-flow`, `#styled-vs-clean`, `#limitations`.

## FR-Associations

**Requirement.** GoMarkEdit registers as a handler for `.md`, `.markdown`, `.mdown`, `.txt` on Windows,
macOS, and Linux (DD-07), appears in the OS "Open With" list, and is settable as default (DD-25). An
OS-open delivers the path via `OnFileOpen` (macOS) or the first CLI argument (Windows/Linux) and opens
in the configured default mode (DD-26, DD-27). The app cannot silently seize the default.

**Rationale.** Feel native; open files by double-click (goal G3).

**Acceptance notes.** Double-clicking a `.md` launches GoMarkEdit and opens it in the default mode.
Detail in `08_FILE_ASSOCIATIONS.md`.

## FR-Assets

**Requirement.** Local image paths resolve relative to the current document (DD-21), served through a
guarded asset handler restricted to an allowlist (document folder + workspace root + configured
roots); path traversal is rejected. Remote content in documents is governed by a policy — **Ask**
(default), **Always allow**, **Always block** (DD-22). GoMarkEdit never fetches these remote assets on
its own; the webview loads a document's remote asset only when the policy permits it.

**Rationale.** Render local images correctly while staying offline and safe (goals G2, G5).

**Acceptance notes.** `./assets/x.png` resolves relative to the file; `../../etc` is rejected; remote
images stay blocked until the banner choice. Detail in `09_ASSETS_AND_SECURITY.md`.

## FR-Theming

**Requirement.** GoMarkEdit ships three themes — **Liquid Glass**, **Material**, **Minimal** (DD-28) —
each with **Auto / Light / Dark** appearance where Auto follows the OS `prefers-color-scheme` live
(DD-29). One selection drives editor and preview (unified). Theme is a token layer only, keyed by
`data-theme` × `data-mode` on the document element (DD-30). No user-authored themes.

**Rationale.** Stay out of the way with a few well-crafted looks (goal G4).

**Acceptance notes.** Switching theme/appearance updates every surface via tokens; Auto reacts to OS
changes. Detail in `10_THEMING.md`.

## FR-Settings

**Requirement.** GoMarkEdit exposes settings both as menu quick-toggles and a full Settings dialog,
grouped: Appearance, Editor, Markdown, Export, Content & privacy, Language (per
`mockups/gomarkedit-mockup.html`). Settings persist in a SQLite key-value store (DD-10) shared
safely across instances (DD-13).

**Rationale.** Let users tune behaviour without cluttering the primary UI (goal G4).

**Acceptance notes.** Every setting has a defined default and persists across launches. Detail in
`11_SETTINGS.md`.

## FR-Shortcuts

**Requirement.** GoMarkEdit provides keyboard shortcuts for formatting, headings, lists, link/image,
Format, Lint, save/open, toggle sidebar, reading mode, and settings (DD-31), mapped per platform
(`Ctrl` on Windows/Linux, `Cmd` on macOS). Shortcuts appear in menus, tooltips, and a Shortcuts
dialog.

**Rationale.** Efficient authoring for keyboard-driven users (goal G1).

**Acceptance notes.** Each registered action fires from its shortcut and matches the menu label.
Detail in `12_KEYBOARD_SHORTCUTS.md`.

## FR-i18n

**Requirement.** All user-facing strings pass through a lightweight i18n layer; English is the only
shipped locale for v1, but adding a locale requires **only a new resource file**, no code changes
(DD-35).

**Rationale.** Be ready for localization without paying its full cost in v1 (goal G4).

**Acceptance notes.** No hard-coded UI string bypasses `t()`; a missing key falls back to English.
Detail in `13_I18N.md`.

## Edge cases

Master registry of edge cases, id scheme `EC-<AREA>-<N>` with AREA ∈ {DOCS, WS, TABS, RENDER, ASSET,
ASSOC, FMT, LINT, PDF, THEME, SET, I18N, DND, LLM, REL}. Each feature document repeats the subset it owns.
Every EC must be satisfied by at least one story acceptance criterion. Three areas are enumerated in the
feature documents that own them and incorporated here by reference rather than duplicated below:
**DND** (drag-and-drop, DD-56–DD-59) in `03_FILES_TABS_WORKSPACE.md#drag-and-drop-open`, **LLM**
(assistant assistant, DD-38–DD-55) across `14_LLM_ASSISTANT_OVERVIEW.md`,
`16_CHAT_AND_AGENTIC_WORKFLOW.md`, `17_PROVIDERS_MODELS_SETTINGS.md`, and `18_TOKENIZER_AND_CONTEXT.md`,
and **REL** (release pipeline, DD-65–DD-67) in
`04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#5-edge-cases-rel`.

### Documents & files (DOCS)

- **EC-DOCS-1** — Open a file whose path no longer exists → clear error, offer to remove from Recent.
- **EC-DOCS-2** — A file open in a tab is modified on disk by another program → detect on focus/save
  and prompt Reload / Keep mine / Compare-later (no silent overwrite).
- **EC-DOCS-3** — An open file is deleted on disk → keep the buffer, mark it dirty/detached; Save
  recreates the file at its path.
- **EC-DOCS-4** — File exceeds the large-file threshold → live preview may pause (setting); editing
  still works.
- **EC-DOCS-5** — Closing a tab / window / quitting with unsaved changes → prompt Save / Discard /
  Cancel.
- **EC-DOCS-6** — A new, never-saved buffer is never autosaved; it requires explicit Save / Save As.
- **EC-DOCS-7** — Save to a read-only or permission-denied location → surface the OS error, keep the
  buffer dirty.
- **EC-DOCS-8** — Non-UTF-8 / binary content opened (e.g. via `.txt`) → read tolerantly, warn in the
  status bar, do not corrupt on save.
- **EC-DOCS-9** — File with BOM and/or CRLF → preserve both on round-trip (DD-15).
- **EC-DOCS-10** — Save As over an existing file → native dialog confirms overwrite.
- **EC-DOCS-11** — Open a file already open in this window → focus the existing tab, no duplicate.
- **EC-DOCS-12** — A `state:patch` emitted after a buffer edit updates derived views (dirty, counts)
  but the backend never echoes buffer text back into the focused editor; cursor/selection preserved
  (DD-64).
- **EC-DOCS-13** — Save/autosave flushes the pending debounced buffer to the backend model first, then
  writes the backend's **canonical** content — never frontend text (DD-64).

### Workspace (WS)

- **EC-WS-1** — Open a folder with a very large number of files/subfolders → large-folder guard +
  lazy children; UI stays responsive.
- **EC-WS-2** — Folder contains no matching files → show an empty-tree message, not a blank pane.
- **EC-WS-3** — A folder/subfolder is deleted or moved after opening → stale nodes handled on next
  interaction; no crash.
- **EC-WS-4** — Permission-denied subfolder → skip with an indicator, continue the rest of the tree.
- **EC-WS-5** — Symlink loops / cyclic directories → bounded traversal, never infinite-recurse.
- **EC-WS-6** — Files created/renamed externally (v1 has no live watcher) → a manual refresh updates
  the tree.
- **EC-WS-7** — Hidden files, dotfiles, and non-matching extensions are always filtered out (DD-06).

### Tabs (TABS)

- **EC-TABS-1** — Opening a path already open in another tab activates that tab.
- **EC-TABS-2** — More tabs than fit → the tab bar scrolls/overflows without breaking layout.
- **EC-TABS-3** — Closing a dirty tab prompts Save / Discard / Cancel.
- **EC-TABS-4** — Two tabs share a basename from different folders → labels disambiguate with a path
  hint.
- **EC-TABS-5** — Closing the last tab → a defined empty state (no tabs, no phantom document).
- **EC-TABS-6** — Middle-click / keyboard close and tab reordering behave consistently.
- **EC-TABS-7** — Tab open/close/reorder/active-change mutate the backend model and reconcile the
  frontend projection via `state:patch`; the frontend holds no authoritative tab set (DD-62).

### Rendering (RENDER)

- **EC-RENDER-1** — Invalid Mermaid syntax → inline error block, other content still renders.
- **EC-RENDER-2** — Invalid KaTeX expression → inline error token, rendering continues.
- **EC-RENDER-3** — Unknown code-fence language → plain, unhighlighted code block.
- **EC-RENDER-4** — Extremely large document → preview debounces / pauses live updates (DD-20).
- **EC-RENDER-5** — Raw HTML in source → handled per the sanitization security level.
- **EC-RENDER-6** — A feature above the active standard (e.g. math in Minimal) renders literally, not
  as the feature.
- **EC-RENDER-7** — Broken/missing image reference → alt text / placeholder, no layout break.

### Assets & security (ASSET)

- **EC-ASSET-1** — Relative path escaping the allowlist (`../../…`) → rejected, placeholder shown.
- **EC-ASSET-2** — Referenced local file missing → alt/placeholder, no error dialog spam.
- **EC-ASSET-3** — Remote image/CSS with policy **Ask** → blocked until the banner choice is made.
- **EC-ASSET-4** — Remote content with **Always block** → never requested, no banner.
- **EC-ASSET-5** — Absolute local path outside the allowlist → rejected.
- **EC-ASSET-6** — Asset referenced from an unsaved buffer (no document folder) → only workspace root
  and configured roots apply.

### File associations (ASSOC)

- **EC-ASSOC-1** — OS opens a file while an instance is running → routed per the multi-instance policy
  (DD-08).
- **EC-ASSOC-2** — OS opens an unsupported extension → open as text or decline gracefully.
- **EC-ASSOC-3** — Path with spaces / Unicode in argv or `OnFileOpen` → parsed correctly.
- **EC-ASSOC-4** — App is not the default handler → offer a "set as default" prompt; never force.
- **EC-ASSOC-5** — Multiple paths passed at once → open each (tabs/windows per policy).
- **EC-ASSOC-6** — `OnFileOpen` fires before the app is fully initialised (macOS cold start) → queue
  and open once ready.

### Format (FMT)

- **EC-FMT-1** — Formatting content the formatter cannot parse → no-op with a notice, buffer unchanged.
- **EC-FMT-2** — Format-on-save applies as a single undo step and preserves cursor/selection where
  possible.
- **EC-FMT-3** — Compact must not alter semantically-significant whitespace (fenced code, indented
  code).
- **EC-FMT-4** — Formatting a very large file runs as a gated long op with a busy indicator.

### Lint (LINT)

- **EC-LINT-1** — Many findings → accurate status count and capped/virtualised markers.
- **EC-LINT-2** — Clean document → zero count, no squiggles.
- **EC-LINT-3** — Format-on-save and Lint-on-save both enabled → format runs before lint.
- **EC-LINT-4** — Lint disabled → no squiggles, status indicator hidden.

### PDF export (PDF)

- **EC-PDF-1** — Export while Mermaid/KaTeX are still rendering → wait for completion first.
- **EC-PDF-2** — Export an unsaved buffer → allowed; uses the current rendered preview.
- **EC-PDF-3** — User cancels the native print dialog → no file written, no error state.
- **EC-PDF-4** — Remote content blocked by policy → exported without it.
- **EC-PDF-5** — Very long document → single continuous export; no pagination controls in v1.

### Theming (THEME)

- **EC-THEME-1** — OS toggles light/dark while appearance is Auto → live token update.
- **EC-THEME-2** — Theme switched during reading mode → tokens still apply to the reader surface.
- **EC-THEME-3** — Persisted theme/appearance invalid or missing → fall back to defaults.

### Settings (SET)

- **EC-SET-1** — Settings DB locked by another instance → WAL + `busy_timeout` retry, no data loss
  (DD-13).
- **EC-SET-2** — Corrupt or newer-than-expected schema → safe defaults or hard startup error per the
  persistence policy.
- **EC-SET-3** — Changing the Markdown standard re-renders open documents.
- **EC-SET-4** — Turning autosave off with a dirty buffer keeps the buffer dirty (no forced save).
- **EC-SET-5** — A new window (or the next app launch) opens with the **last saved** window/UI-layout
  state restored before the window is shown (DD-60).
- **EC-SET-6** — Multi-window: the last window to **change** a layout value wins, never the last to
  close (DD-61).
- **EC-SET-7** — A missing or invalid persisted layout value falls back to a sensible default; the
  window still opens.

### Internationalization (I18N)

- **EC-I18N-1** — Missing translation key → fall back to English (or the key), never a blank label.
- **EC-I18N-2** — A new locale is added by dropping in a resource file only (DD-35), no code change.
- **EC-I18N-3** — Long translated strings → controls tolerate overflow without clipping actions.
