**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-25
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `01_Product/03_FILES_TABS_WORKSPACE.md`, `01_Product/06_FORMAT_AND_LINT.md`, `mockups/gomarkedit-mockup.html`

# Keyboard Shortcuts

The shortcut registry and platform mapping (DD-31). Refines
`01_FUNCTIONAL_REQUIREMENTS.md#fr-shortcuts`. Registered by `logic/hooks` `useShortcuts`; labels shown
in menus, tooltips, and the Shortcuts dialog (`#shModal` in `mockups/gomarkedit-mockup.html`).

## Table of Contents

1. [Shortcut registry](#shortcut-registry)
2. [The keymap is frozen](#the-keymap-is-frozen)
3. [Format shortcuts](#format-shortcuts)
4. [File shortcuts](#file-shortcuts)
5. [Search and navigation shortcuts](#search-and-navigation-shortcuts)
6. [View shortcuts](#view-shortcuts)
7. [Platform mapping](#platform-mapping)
8. [Edge cases](#edge-cases)

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

## The keymap is frozen

**A later phase may add a binding to this registry. It may never rebind one.** A shortcut that changes
between releases is worse than one that never existed: muscle memory does the wrong thing silently.

This matters because the registry is built early (Phase 04) and consumed by everything after it — the
toolbar, both menu surfaces, every tooltip, the Shortcuts dialog, and on macOS the native application
menu (ADR-0028). Once any of those renders an accelerator label, the binding behind it is public.

Three bindings changed on 2026-07-25, before anything rendered a label, and they are the last changes:

| Was                          | Now                                    | Why                                                                                                                                                                                                                                                                         |
| ---------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ctrl/Cmd+P` — Export to PDF | `Ctrl/Cmd+P` — **Quick open**          | In an application with tabs, a file tree and Monaco, `Ctrl+P` is where people reach for quick-open. `Ctrl+P`-as-print is a _browser_ convention, and this is not a browser. (DD-73)                                                                                         |
| —                            | `Ctrl/Cmd+Shift+E` — **Export to PDF** | Where Export moved.                                                                                                                                                                                                                                                         |
| `Ctrl/Cmd+K O` — Open folder | `Ctrl/Cmd+Shift+O` — **Open folder**   | The chord was unreachable in the normal case: with the editor focused — which is the default state of the whole application — `Ctrl+K` fires Link, so Open folder had no working shortcut at all. The old resolution rule was correct and the consequence was unacceptable. |

## Format shortcuts

Editor-scope actions that transform the selection or current line.

| Action            | Binding                                    | Scope    |
| ----------------- | ------------------------------------------ | -------- |
| Bold              | `Ctrl+B`                                   | editor   |
| Italic            | `Ctrl+I`                                   | editor   |
| Strikethrough     | `Ctrl+Shift+X`                             | editor   |
| Inline code       | `Ctrl+E`                                   | editor   |
| Link              | `Ctrl+K`                                   | editor   |
| Image             | `Ctrl+Shift+I`                             | editor   |
| Heading 1 / 2 / 3 | `Ctrl+1` / `Ctrl+2` / `Ctrl+3`             | editor   |
| Bullet list       | `Ctrl+Shift+8`                             | editor   |
| Numbered list     | `Ctrl+Shift+7`                             | editor   |
| Task list         | `Ctrl+Shift+9`                             | editor   |
| Quote             | `Ctrl+Shift+.`                             | editor   |
| Table             | `Ctrl+Shift+T` _(insert a table skeleton)_ | editor   |
| Format document   | `Alt+Shift+F`                              | document |
| Compact document  | `Alt+Shift+C`                              | document |
| Lint document     | `Alt+Shift+L`                              | document |

**Compact** previously had no button, no menu item and no binding, in three documents that all required
it (`06_FORMAT_AND_LINT.md#compact`). It has all three now.

## File shortcuts

Global/document actions for the document lifecycle (`03_FILES_TABS_WORKSPACE.md`).

| Action                 | Binding                                 | Scope    |
| ---------------------- | --------------------------------------- | -------- |
| New file               | `Ctrl+N`                                | global   |
| New window             | `Ctrl+Shift+N`                          | global   |
| Open file              | `Ctrl+O`                                | global   |
| Open folder            | `Ctrl+Shift+O`                          | global   |
| Reopen last closed tab | `Ctrl+Shift+Alt+T`                      | global   |
| Save                   | `Ctrl+S`                                | document |
| Save As                | `Ctrl+Shift+S`                          | document |
| Export to PDF          | `Ctrl+Shift+E`                          | document |
| Export as HTML         | _(menu only)_                           | document |
| Close tab              | `Ctrl+W`                                | document |
| Next tab               | `Ctrl+Tab` _(also `Ctrl+PageDown`)_     | global   |
| Previous tab           | `Ctrl+Shift+Tab` _(also `Ctrl+PageUp`)_ | global   |
| Exit                   | `Ctrl+Q`                                | global   |

`Ctrl+Shift+T` is the Table binding above, so **Reopen last closed tab** takes
`Ctrl+Shift+Alt+T`. Tab-by-number is unavailable: `Ctrl+1/2/3` are headings, and heading bindings are
used far more often in a Markdown editor than jumping to the fourth tab.

## Search and navigation shortcuts

Phase 09 (`07_Phases/PHASE_09_FIND_ANYTHING.md`) builds all of these over one result list. The
bindings are reserved here so that nothing binds over them in the meantime — in particular over
Monaco's built-in find, which would otherwise be shadowed by an app-level handler.

| Action                 | Binding           | Scope  |
| ---------------------- | ----------------- | ------ |
| Find in document       | `Ctrl+F`          | editor |
| Replace in document    | `Ctrl+H`          | editor |
| Find next / previous   | `F3` / `Shift+F3` | editor |
| Quick open by filename | `Ctrl+P`          | global |
| Command palette        | `Ctrl+Shift+P`    | global |
| Search in folder       | `Ctrl+Shift+F`    | global |
| Toggle outline         | `Ctrl+Shift+U`    | global |

`Ctrl+F` and `Ctrl+H` are **Monaco's own** find and replace widget, not a reimplementation. What the
registry owns is the reservation and the requirement that the widget is themed — it is a distinct
colour surface (`editorWidget.*`, `10_THEMING.md#editor-theme`) and ships white by default, which in a
dark Liquid Glass window is unmissable.

## View shortcuts

Global actions for layout and modes (`02_EDITOR_AND_VIEWER_MODES.md`).

| Action                          | Binding      | Scope    |
| ------------------------------- | ------------ | -------- |
| Toggle sidebar                  | `Ctrl+\`     | global   |
| Reading mode (distraction-free) | `Ctrl+Enter` | document |
| Increase reading size           | `Ctrl+=`     | global   |
| Decrease reading size           | `Ctrl+-`     | global   |
| Reset reading size              | `Ctrl+0`     | global   |
| Settings (All settings…)        | `Ctrl+,`     | global   |
| Keyboard shortcuts dialog       | `Ctrl+?`     | global   |
| Full screen                     | `F11`        | global   |

Reading size uses `Ctrl+=/-/0` rather than `Ctrl++/-/0` because `Ctrl+1/2/3` are already headings and
`+` requires Shift on most layouts. It scales the preview and the reader, not the editor — the editor's
font size is a setting (DD-72).

## Platform mapping

The primary modifier is **`Ctrl`** on Windows/Linux and **`Cmd`** on macOS; `Alt` maps to `Option` on
macOS. Bindings are declared once with a platform-agnostic "primary modifier" token and resolved at
runtime:

| Token     | Windows / Linux | macOS    |
| --------- | --------------- | -------- |
| Primary   | `Ctrl`          | `Cmd`    |
| Secondary | `Alt`           | `Option` |
| Shift     | `Shift`         | `Shift`  |

Thus `Ctrl+B` displays and fires as `Cmd+B` on macOS, `Alt+Shift+F` as `Option+Shift+F`, and so on.
Menus/tooltips render the platform-correct glyphs (e.g. `⌘`, `⌥`, `⇧`, `⏎`) matching the mockup. `F11`
(full screen) has no modifier and is unchanged across platforms.

## Edge cases

- Editor-scope shortcuts are inert when the editor is not focused (e.g. in reading mode).
- Document-scope shortcuts (Save, Export, Reading mode) require an active document; with no document
  they are no-ops (EC-TABS-5).
- A binding that would collide with a native webview/OS accelerator resolves in GoMarkEdit's favour where
  the platform allows; otherwise the menu label documents the effective binding.
- **There are no chords.** `Ctrl/Cmd+K` is the editor-scope **Link** binding and nothing else. The
  former `Ctrl/Cmd+K O` chord for Open folder was removed: with the editor focused — the default state
  of the whole application — editor scope won and the chord never fired, so Open folder had no working
  shortcut in the case that mattered. It is now `Ctrl/Cmd+Shift+O`.
- **On macOS the native application menu owns the clipboard and undo accelerators** (ADR-0028):
  `Cmd+C`, `Cmd+V`, `Cmd+X`, `Cmd+A`, `Cmd+Z` and `Cmd+Shift+Z` are resolved by the platform, not by
  this registry. They are absent from the tables above deliberately. An item appearing in both the
  native menu and the in-window menu bar dispatches through **one** registry entry.
- **A binding added by a later phase must not already appear here.** The Shortcuts dialog renders the
  whole registry, so a duplicate is visible to the user rather than merely wrong.
