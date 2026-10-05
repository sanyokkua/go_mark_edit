# Design

## Context

The shell change delivered the action catalogue and settings. This change extends them with editor behaviour and the full menu/toolbar surface while the file lifecycle, tabs and tidy tools were not yet built.

## Goals / Non-Goals

- Goals: complete editor chrome, bounded one-edit formatting, shortcut coverage, editor display settings.
- Non-Goals: file open/save/export, workspace listing, real tabs, rich rendering expansion, assistant, and the Format/Compact/Lint operations.

## Decisions

- Registry entry shape: stable id, label and accessibility keys, scope (editor, document, window, application), shortcut, availability (available or deferred), surfaces, and a typed invoker. Menus, toolbar, tooltips, context menu, overflow and shortcut help render from the registry only.
- Dispatch order: resolve entry, reject deferred with a localized unavailable outcome, suppress while a modal is open, then check scope (focused editor, writable document, focused window), compute one bounded edit, run it through the existing document-command seam.
- Formatting edit: bounded by the selection or current line (independent of document size); applied as one editor edit between undo stops; outcome is mutated, unavailable or document-mismatch with no partial edit.
- Marker semantics: bold/italic/strike/code add a pair, remove it when already around or just outside the selection, and insert an empty pair at a caret. Headings use ATX only and toggle off at the same level. Lists add, convert or remove markers; numbered lists use `1.` without renumbering. Defaults stay `-`, `_`, `#` but follow the acknowledged marker preferences. Table inserts an empty GFM skeleton; link inserts Markdown without any network request.
- Shortcuts use platform-neutral bindings (Ctrl/Cmd, Alt/Option) and never shadow existing editor or native bindings. Editor-scoped shortcuts fire only with editor focus.
- Editor settings are validated, stored in the existing key-value settings path and projected only after acknowledgement.

## Risks / Trade-offs

- Visual-only tab and file fixtures in this change were placeholders; real behaviour replaced them in the files-and-tabs change.

Deferred (not built here): Format, Compact and Lint as working operations (visible but unavailable in this change; delivered later by the tidy capability); Image insertion; Toggle Assistant and Distraction-free reading; Open logs folder and View on GitHub actions.
