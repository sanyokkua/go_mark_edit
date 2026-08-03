# Contract: Editor-stage actions, formatting, and settings

This is the feature-local interface contract for the Editor-stage vertical slice. It refines the active
`spec.md` without replacing the consumed `specs/001-gomarkedit-product/contracts/application-state.md`,
`command-boundaries.md`, `delivery-stages.md`, or `window-launcher-shell.md`.

## Action registry

Every visible action has one registry entry with this logical shape:

```text
ActionEntry {
  id: stable string
  labelKey: translation key
  accessibilityKey: translation key
  scope: editor | document | window | application
  shortcut: platform-neutral binding | none
  availability: available | deferred
  surfaces: ordered menu/toolbar/tooltip/overflow/context/shortcut-help memberships
  invoke: typed action dispatcher
}
```

The registry is the only source for visible labels, accessible names, accelerator text, ordering, and
dispatch identity. Platform resolution renders `Ctrl/Cmd` and `Alt/Option` according to the host without
changing the frozen binding. Modal dialogs suppress background dispatch. Existing native macOS App/Edit
roles, including clipboard and undo ownership, are not duplicated.

### Required binding set

The registry contains the Editor-stage bindings from FR-ED-020:

| Action family | Platform-neutral binding |
|---|---|
| Bold, Italic | `Ctrl/Cmd+B`, `Ctrl/Cmd+I` |
| Strikethrough, Inline code, Link, Image | `Ctrl/Cmd+Shift+X`, `Ctrl/Cmd+E`, `Ctrl/Cmd+K`, `Ctrl/Cmd+Shift+I` |
| Heading 1/2/3 | `Ctrl/Cmd+1`, `Ctrl/Cmd+2`, `Ctrl/Cmd+3` |
| Bullet/Numbered/Task list | `Ctrl/Cmd+Shift+8`, `Ctrl/Cmd+Shift+7`, `Ctrl/Cmd+Shift+9` |
| Quote, Table | `Ctrl/Cmd+Shift+.`, `Ctrl/Cmd+Shift+T` |
| Format, Compact, Lint | `Alt/Option+Shift+F`, `Alt/Option+Shift+C`, `Alt/Option+Shift+L` |
| Toggle sidebar, Settings, Keyboard shortcuts | `Ctrl/Cmd+\\`, `Ctrl/Cmd+,`, `Ctrl/Cmd+?` |
| Full screen | `F11` |

Reserved existing Monaco/find/replace and native platform bindings are not shadowed.

## Dispatch contract

`dispatch(actionId, context)` performs these checks in order:

1. Resolve the current registry entry and reject a missing identity as an internal development error.
2. Reject a `deferred` entry with the localized unavailable outcome below and no command call.
3. Suppress dispatch when a modal is open.
4. For an editor-scoped action, require the focused identity-bound Monaco session.
5. For a document-scoped action, require an open writable current document.
6. For a window/application action, require the focused window where the action scope requires it.
7. For an available formatting action, capture the session identity and selection, compute one bounded edit,
   and invoke the existing document-command seam.
8. Surface only the classified result; never synthesize a successful backend result.

The result is one of:

```text
ActionResult =
  mutated { actionId, documentId, editRange, caret/selection intent }
  unavailable { actionId, reason: no-document | no-editor | deferred | modal | unsupported }
  document-mismatch { actionId, expectedDocumentId, currentSessionIdentity }
```

`unavailable` is deterministic, localized, and does not change source, selection, caret, scroll, undo
history, problems, projection, layout, operation-gate state, files, or network state.

## Formatting contract

The formatter consumes:

```text
FormatRequest {
  actionId: bold | italic | strike | inline-code | heading-1 | heading-2 | heading-3 |
            bullet-list | numbered-list | task-list | quote | link | table
  source: current editor source snapshot
  selection: Monaco selection/caret
  markers: acknowledged Markdown marker preferences
}
```

It returns one bounded edit and caret/selection intent. The executor applies exactly one Monaco edit
operation bracketed by the existing undo stops and lets the existing buffer queue acknowledge the full
working-copy snapshot through Go.

Required semantics:

- Non-empty selections edit only the selected range; empty selections edit only the current line or insert
  a pair/skeleton at the caret.
- Emphasis/code markers toggle, including markers immediately outside a selection; empty pairs leave the
  caret between the markers.
- Heading actions are ATX H1/H2/H3 add/replace/remove operations as specified by FR-ED-014. No Setext/H3
  fallback is invented in this slice.
- List actions convert or remove the existing bullet/number/task marker line by line. The canonical defaults
  remain `-`, `_`, and ATX `#`; acknowledged Markdown preferences are respected where the action contract
  defines them.
- Quote and Link use the same seam. Link writes source only and cannot initiate a network request.
- Table inserts the documented empty GFM skeleton in one edit.
- Image is visible but deferred because image/file lifecycle is out of scope.
- Format, Compact, and Lint are never successful document operations in this feature. Full document parsing,
  compaction, lint rules/problems, cancellation, and long-operation behavior remain deferred.

## Editor settings contract

The existing typed settings interface gains an additive `editor` group:

```text
EditorSettings {
  lineNumbers: on | off = on
  wordWrap: on | off = off
  fontSize: 13 | 14 | 16 = 14
}
```

The Go settings service validates and persists the group through the existing additive KV repository. The
Wails handler remains typed, named-result, no-context, first-statement panic-safe, and service-only. The
frontend adapter guards arity and unwraps the typed result; the dev bridge mirrors the same DTO. The editor
applies acknowledged values to Monaco in place and never remounts or reseeds the model for a display-setting
change.

## Surface contract

The following surfaces derive from the registry and the binding mockup shape:

- Menu row directly below the native title bar: File, Settings, View, About.
- File menu inventory is visual-only: New File, New Window, Open File, Open Folder, Open Recent, Reopen,
  Save, Save As, Export to PDF, Close Tab, Exit.
- Settings includes appearance, open mode, Markdown standard, save settings, Editor settings, and existing
  Markdown marker preferences. File/renderer/tidy future items are visibly unavailable or inert; Assistant
  settings are absent.
- View includes Editor, Split, Preview, Toggle Sidebar, Toggle Assistant, Line numbers, Word wrap,
  Distraction-free reading, Full screen. Existing arrangement/sidebar/full-screen consumers remain real;
  Assistant and distraction-free reading remain unavailable.
- About includes Keyboard shortcuts, Open logs folder, View on GitHub (MIT), About GoMarkEdit. Only the
  existing local About/version behavior is real; log/GitHub are unavailable and never open a remote URL.
- The document-tab strip displays the representative fixture labels and affordances only. It has no tab
  state, file state, switching, closing, persistence, or session restore.
- The controls bar contains inline, heading, list/quote, link/image/table, `»` overflow, arrangement,
  Format, Compact, and Lint groups in the mockup order. At 768 the list/link groups relocate; at 375 text
  buttons and arrangement relocate too. No control disappears or creates horizontal scrolling.
- The editor context menu is exactly: Cut, Copy, Paste, Paste as plain text, separator, Bold, Italic,
  Link, separator, Format document, Compact, separator, Command palette. Lint is not added to this menu
  because the active surface contract does not list it there.

All labels, unavailable states, tooltips, focus, reduced-motion behavior, and colors use the existing
translation and token systems across all six palettes.

## Traceability disposition

| Source category | Classification in this feature | Contract boundary |
|---|---|---|
| Phase 04 inline formatting, editor settings, toolbar, context menu, shortcuts, and About | Owned | This contract plus FR-ED-009, FR-ED-012–016, FR-ED-019–023 and named tests. |
| Existing appearance, appmodel projection, document command seam, arrangement/sidebar, native frame, focus, tokens, and offline policy | Consumed | The completed Feature 001 contracts remain the sole owner. |
| File opening/saving/export, real tabs, workspace enumeration, image/paste file lifecycle, rich rendering, Assistant/provider, Format/Compact/Lint document behavior, lint/problems, and tidy-markdown gates | Deferred | Visible shape may be projected only where required; no fake success or hidden dependency is added. |

