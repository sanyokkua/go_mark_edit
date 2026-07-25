**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `01_Product/03_FILES_TABS_WORKSPACE.md`, `01_Product/06_FORMAT_AND_LINT.md`, `mockups/gomarkedit-mockup.html`

# Keyboard Shortcuts

The shortcut registry and platform mapping (DD-31). Refines
`01_FUNCTIONAL_REQUIREMENTS.md#fr-shortcuts`. Registered by `logic/hooks` `useShortcuts`; labels shown
in menus, tooltips, and the Shortcuts dialog (`#shModal` in `mockups/gomarkedit-mockup.html`).

## Table of Contents

1. [Shortcut registry](#shortcut-registry)
2. [Format shortcuts](#format-shortcuts)
3. [File shortcuts](#file-shortcuts)
4. [View shortcuts](#view-shortcuts)
5. [Platform mapping](#platform-mapping)
6. [Edge cases](#edge-cases)

## Shortcut registry

Shortcuts are a single **registry** mapping an action id to its default binding, label, and scope. The
registry is the source of truth for the menus, tooltips, and the Shortcuts dialog, so a binding is
defined once. Scopes: **global** (window-level), **editor** (only when the Monaco editor is focused),
and **document** (an active document required). Formatting actions are editor-scope and act on the
selection or current line; file/view actions are global. Bindings shown below use the `Ctrl` form;
macOS substitutes `Cmd` (see [Platform mapping](#platform-mapping)).

The tables below cover every binding that exists before the assistant. The assistant extends this same
registry with one more — **Toggle assistant sidebar**, `Ctrl/Cmd+J` (global) — specified in
`14_LLM_ASSISTANT_OVERVIEW.md#assistant-sidebar`; it exists only once the assistant ships and is not
listed here.

## Format shortcuts

Editor-scope actions that transform the selection or current line.

| Action | Binding | Scope |
|---|---|---|
| Bold | `Ctrl+B` | editor |
| Italic | `Ctrl+I` | editor |
| Strikethrough | `Ctrl+Shift+X` | editor |
| Inline code | `Ctrl+E` | editor |
| Link | `Ctrl+K` | editor |
| Image | `Ctrl+Shift+I` | editor |
| Heading 1 / 2 / 3 | `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | editor |
| Bullet list | `Ctrl+Shift+8` | editor |
| Numbered list | `Ctrl+Shift+7` | editor |
| Task list | `Ctrl+Shift+9` | editor |
| Quote | `Ctrl+Shift+.` | editor |
| Format document | `Alt+Shift+F` | document |
| Lint document | `Alt+Shift+L` | document |

## File shortcuts

Global/document actions for the document lifecycle (`03_FILES_TABS_WORKSPACE.md`).

| Action | Binding | Scope |
|---|---|---|
| New file | `Ctrl+N` | global |
| New window | `Ctrl+Shift+N` | global |
| Open file | `Ctrl+O` | global |
| Open folder | `Ctrl+K O` | global |
| Reopen last file / folder | `Ctrl+Shift+T` | global |
| Save | `Ctrl+S` | document |
| Save As | `Ctrl+Shift+S` | document |
| Export to PDF | `Ctrl+P` | document |
| Close tab | `Ctrl+W` | document |
| Exit | `Ctrl+Q` | global |

## View shortcuts

Global actions for layout and modes (`02_EDITOR_AND_VIEWER_MODES.md`).

| Action | Binding | Scope |
|---|---|---|
| Toggle sidebar | `Ctrl+\` | global |
| Reading mode (distraction-free) | `Ctrl+Enter` | document |
| Settings (All settings…) | `Ctrl+,` | global |
| Keyboard shortcuts dialog | `Ctrl+?` | global |
| Full screen | `F11` | global |

## Platform mapping

The primary modifier is **`Ctrl`** on Windows/Linux and **`Cmd`** on macOS; `Alt` maps to `Option` on
macOS. Bindings are declared once with a platform-agnostic "primary modifier" token and resolved at
runtime:

| Token | Windows / Linux | macOS |
|---|---|---|
| Primary | `Ctrl` | `Cmd` |
| Secondary | `Alt` | `Option` |
| Shift | `Shift` | `Shift` |

Thus `Ctrl+B` displays and fires as `Cmd+B` on macOS, `Alt+Shift+F` as `Option+Shift+F`, and so on.
Menus/tooltips render the platform-correct glyphs (e.g. `⌘`, `⌥`, `⇧`, `⏎`) matching the mockup. `F11`
(full screen) has no modifier and is unchanged across platforms.

## Edge cases

- Editor-scope shortcuts are inert when the editor is not focused (e.g. in reading mode).
- Document-scope shortcuts (Save, Export, Reading mode) require an active document; with no document
  they are no-ops (EC-TABS-5).
- A binding that would collide with a native webview/OS accelerator resolves in GoMarkEdit's favour where
  the platform allows; otherwise the menu label documents the effective binding.
- **Chord vs. single-key resolution.** `Ctrl/Cmd+K` is both the editor-scope **Link** binding and the
  leader of the global **Open folder** chord (`Ctrl/Cmd+K O`). When the editor is focused, `Ctrl/Cmd+K`
  fires **Link** immediately (editor scope wins); the `Ctrl/Cmd+K O` chord is recognised only when the
  editor is **not** focused. Open folder always remains reachable from the File menu regardless of focus.
