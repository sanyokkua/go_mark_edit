# Data Model: Editor Stage Chrome and Formatting

This feature extends existing Go-owned settings and document/view state. It does not create canonical tab,
File, workspace-enumeration, Assistant, renderer-plugin, or operation state. The model below is the minimum
state needed to make the Phase 04 slice observable and dependency-complete.

## Action registry entry

**Owner**: `frontend/src/logic/actions/`

| Field              | Type/values                                      | Validation and behavior                                                                                                 |
| ------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `id`               | Stable action identifier                         | Unique across the Editor-stage registry. It is the identity dispatched by every surface.                                |
| `labelKey`         | Translation-catalogue key                        | Must resolve through `t(...)`; no user-visible literal labels.                                                          |
| `accessibilityKey` | Translation-catalogue key                        | Provides the accessible name/description used by buttons, menu items, tooltips, and dialogs.                            |
| `scope`            | `editor`, `document`, `window`, or `application` | Dispatch checks editor focus, writable current document, window focus, and modal suppression as applicable.             |
| `shortcut`         | Platform-neutral combination or absent           | One frozen binding; renderer maps `Ctrl/Cmd`, `Alt/Option`, Shift, and platform glyphs without rebinding existing keys. |
| `availability`     | `available` or `deferred`                        | Deferred entries render a localized unavailable state and never call a successful command.                              |
| `invoke`           | Typed command callback                           | The only production dispatch route. Native macOS clipboard/edit roles remain outside this registry.                     |
| `surfaces`         | Ordered surface membership                       | Menu, toolbar, tooltip, overflow, context menu, and shortcuts dialog derive membership/order from the registry.         |

### Registry invariants

- There is exactly one entry per visible action identity.
- A deferred entry has no backend/file/network side effect and does not acquire the long-operation gate.
- A document-scoped action requires a current writable document; an editor-scoped action additionally
  requires the identity-bound editor to be focused; a global/window action requires window focus.
- Any modal dialog suppresses background dispatch while retaining focus inside the modal.
- Native App/Edit roles and clipboard behavior are not duplicated by an in-app handler on macOS.

## Editor working copy and session

The existing focused-editor exception remains the only ephemeral document state.

| Field                    | Owner                                          | Meaning                                                                                                                      |
| ------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `documentId`             | `EditorSessionProvider` / Go appmodel identity | The document identity captured by a command.                                                                                 |
| `token`                  | `EditorSessionProvider`                        | Prevents stale action objects from mutating a replacement editor session.                                                    |
| `content`                | Monaco model during focus                      | Immediate source working copy; it is flushed through `useSyncedBuffer`/`appModelAdapter` before canonical consumers read it. |
| `selection` / `caret`    | Monaco model                                   | One-based source range/caret used to choose selected-range or current-line formatting.                                       |
| `scroll` / `undoHistory` | Monaco model                                   | Must survive display-setting updates, state patches, and formatting dispatch except for the intentional one-edit undo entry. |

The command boundary returns `available`, `unavailable`, or `document-mismatch`. A failed or mismatched
command cannot manufacture a backend success or reset the focused editor from projected full content.

## Formatting operation

| Field                    | Type/values                                      | Rule                                                                                                           |
| ------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `actionId`               | Registry action identity                         | Selects the canonical transformation.                                                                          |
| `scope`                  | `selected-range` or `current-line`               | Non-empty selection uses only that range; empty selection uses only its current line or caret insertion point. |
| `sourceRange`            | Monaco `EditorRange`                             | Bounded, normalized, and identity-checked before mutation.                                                     |
| `replacement`            | Markdown source string                           | Produced by the pure formatting transformation; no rich/WYSIWYG replacement.                                   |
| `caret/selection intent` | Monaco position/range                            | Leaves the user in the useful editing position; marker-pair insertion places the caret between markers.        |
| `undo boundary`          | One edit                                         | One `executeEdits` operation is bracketed by the existing undo stops.                                          |
| `terminal outcome`       | `mutated`, `unavailable`, or `document-mismatch` | No partial edit; deferred actions use `unavailable` and do not report success.                                 |

### Formatting validation rules

- Bold, italic, strikethrough, and inline code add their canonical pair, remove it when already directly
  around or just outside the selected range, and insert an empty pair at an empty caret.
- Headings add, replace, or remove ATX `#` levels according to the requested level.
- Bullet, numbered, and task list actions add, convert, or remove the line marker; defaults remain `-`, `_`,
  and ATX `#`, while acknowledged Markdown marker preferences are read from the settings projection.
- Quote transforms selected/current lines through the same seam. Link inserts Markdown source without a
  network request. Table inserts the documented empty GFM skeleton.
- Image remains a deferred registry entry because image/file lifecycle behavior is outside this slice.
- Format, Compact, and Lint remain deferred and never mutate source, selection, problems, projection, or gate state.

## Acknowledged editor settings

**Canonical owner**: existing Go `internal/settings` service/repository and typed Wails result.

| Field         | Values           | Default | Visible consumer                                           |
| ------------- | ---------------- | ------- | ---------------------------------------------------------- |
| `lineNumbers` | `on` / `off`     | `on`    | Monaco line-number option and Editor settings menu/dialog. |
| `wordWrap`    | `on` / `off`     | `off`   | Monaco word-wrap option and Editor settings menu/dialog.   |
| `fontSize`    | `13`, `14`, `16` | `14`    | Monaco font-size option and Editor settings menu/dialog.   |

Each setting is validated before persistence, persisted through the existing additive KV settings path, and
projected only after acknowledgement. An invalid or failed write retains the prior acknowledged value. The
frontend adapter owns Wails binding access and the development bridge mirrors the typed result.

Existing Appearance and Markdown groups remain consumed/owned according to the feature matrix: appearance
uses the completed lifecycle and six palettes; Markdown marker preferences remain shared inputs to
formatting; future Markdown Standard, Format-on-save, and Lint-on-save behavior remains visibly deferred.

## Editor-stage chrome state

| State                             | Canonical/derived owner                       | Allowed values and invariants                                                                                                       |
| --------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `menu`                            | React interaction state derived from registry | One File/Settings/View/About row below the native title bar; open menu is focusable and modal-safe.                                 |
| `toolbarOverflow`                 | React interaction state                       | Closed, 768-width overflow, or 375-width overflow; items relocate, never disappear.                                                 |
| `tabPresentation`                 | Static visual fixture                         | Representative `release-notes.md`/`spec-draft.md`, modified dot, close/add affordances; no tab identity/order/persistence/commands. |
| `sidebarVisible` / `sidebarWidth` | Existing Go/appmodel layout projection        | Existing left sidebar action remains functional. Responsive rail/off-canvas presentation does not persist a responsive-only width.  |
| `arrangement`                     | Existing per-document `DocView` projection    | Editor, Split, or Preview; one pane remains visible and existing flush-before-hide behavior is preserved.                           |
| `rightSidebarControl`             | Static registry/surface state                 | Inspectable visual-only control; no right panel, Assistant state, layout state, provider call, or placeholder.                      |
| `appearance`                      | Consumed Go settings/appearance lifecycle     | Three themes × light/dark/auto resolution, root `data-theme`/`data-mode`, centralized tokens, focus, and reduced motion.            |

## State transitions

1. **Hydrate**: Existing appmodel/settings bootstrap acknowledges current document, view, sidebar, appearance,
   Markdown, and editor settings before mounting normal Editor-stage chrome.
2. **Open a surface**: The registry resolves ordered entries, applies modal/focus availability, and opens a
   menu/overflow/context menu/dialog without mutating canonical document state.
3. **Invoke available formatting**: Capture identity and selection → compute one bounded edit → call the
   document-command seam → Monaco applies one edit → the normal buffer queue acknowledges it → projection may
   update derived metadata without echoing full source into the focused editor.
4. **Invoke deferred action**: Resolve registry entry → show localized unavailable state → leave content,
   selection, undo, problems, focus, gate, projection, and layout unchanged.
5. **Change editor display setting**: Validate and persist through the Go settings path → acknowledge → update
   Monaco options in place → keep model identity, content, caret, selection, scroll, and undo history.
6. **Change arrangement/sidebar**: Reuse existing `SetDocView`/`SetUILayout` command boundaries and one-pane,
   responsive, acknowledgement, failure-retention, and native-shell rules from Feature 001.
7. **Close/reload**: No visual fixture promotes into tab/file state; deferred items remain deferred and all
   acknowledged settings/layout values restore through their existing owners.

## Explicitly absent entities

This plan must not introduce canonical `FileMenuCommand`, `Tab`, `WorkspaceEntry`, `AssistantPanel`,
`ProviderCall`, `RichRendererPlugin`, `ProblemList`, or `TidyMarkdownOperation` entities. Their source
anchors remain Deferred in the active migration matrix and belong to downstream slices.
