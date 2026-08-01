# Contract: Native Window Shell

## Authority and scope

This contract preserves the complete approved `FR-WS-001` through `FR-WS-020` behavior. The
delivered appearance contract is consumed, not re-owned. The 2026-08-01 clarification supersedes every
frameless/custom-chrome mechanism in earlier plans and in historical mockup specimens. Launcher
activation, File commands, real tabs, file lifecycle, rendering expansion, packaging, Editor expansion,
and Assistant behavior remain downstream and absent.

| Approved requirement | Contract location                                                  |
| -------------------- | ------------------------------------------------------------------ |
| FR-WS-001            | Native framed window                                               |
| FR-WS-002            | Native framed window                                               |
| FR-WS-003            | Native framed window                                               |
| FR-WS-004            | Full screen and native geometry observation                        |
| FR-WS-005            | Native framed window                                               |
| FR-WS-006            | Startup and restore                                                |
| FR-WS-007            | Shell and responsive states                                        |
| FR-WS-008            | Shell and responsive states; Offline and response evidence         |
| FR-WS-009            | Durable acknowledged layout                                        |
| FR-WS-010            | Durable acknowledged layout                                        |
| FR-WS-011            | Durable acknowledged layout                                        |
| FR-WS-012            | Durable acknowledged layout; Notifications                         |
| FR-WS-013            | Startup recovery                                                   |
| FR-WS-014            | In-app actions, Settings, and focus                                |
| FR-WS-015            | In-app actions, Settings, and focus                                |
| FR-WS-016            | Notifications                                                      |
| FR-WS-017            | In-app actions, Settings, and focus; Offline and response evidence |
| FR-WS-018            | Offline and response evidence                                      |
| FR-WS-019            | Build identity                                                     |
| FR-WS-020            | Downstream entry gates and absence clauses throughout              |

## Native framed window

- macOS, Windows, and Linux use the ordinary OS-managed frame, title bar, controls, movement, title
  gestures, resize borders/cursors, minimize, maximize/restore, and close.
- The application renders no replacement window control, drag region, resize target, edge/corner hit
  area, or cursor override and invokes no private resize operation.
- Several processes may own independent windows at once. Startup requires no server, account,
  companion process, or single-instance takeover.
- The base window is framed/resizable, starts hidden at 1024 x 768, and has an exact native minimum of
  375 x 480.
- Native close enters a synchronous Go lifecycle flush before database shutdown. There is no
  frontend-only close durability path.
- macOS retains native App/Edit roles. Native About is not installed; About has one in-app owner.
- Windows and Linux have no native application menu from this slice.

## Startup and restore

- Load acknowledged native width, height, and maximized state while hidden. Validate each field
  independently and fall back independently.
- Position and full-screen state are not restored. OS/Wails placement remains authoritative.
- An oversized size is clamped using the current/primary logical display exposed by the public Wails
  screen API, then placed/centered by Wails/OS. The plan does not claim unavailable work-area coordinates.
- Apply native restore and hydrate the acknowledged frontend shell independently. Show the normal shell
  exactly once only after both readiness signals are true.
- Restore never opens a prior document or tab set.

## Startup recovery

- Initialization failure shows a safe recovery surface inside the framed webview while the normal
  shell stays unmounted/hidden.
- It shows exactly `GoMarkEdit could not start`,
  `GoMarkEdit could not initialize its local settings. Please try again.`, and Retry.
- Retry invokes repeatable backend initialization through a typed command. Success completes restore
  and shows the normal shell once. Repeated failure reveals no raw error or private path.
- A Wails native Error dialog is not the Retry mechanism because pinned Windows/Linux backends do not
  support the required custom Error-dialog button.

## Full screen and native geometry observation

- F11 toggles full screen on every platform through public Wails runtime operations and the canonical
  action catalogue. Full screen remains session-only and returns to the preceding normal/maximized state.
- DOM resize is only a notification. The frontend adapter queries public native window size and
  maximized state and sends typed layout intent to Go/appmodel.
- `innerWidth`, component state, and Redux are not durable native geometry authorities.

## Shell and responsive states

- The shell reserves left workspace, centre document, and right Assistant regions. Before Assistant
  delivery, the right region has zero width and no control, content, or visible placeholder.
- At desktop width, workspace visibility changes are discrete and divider width changes are continuous.
- At 768 px the workspace becomes a 46 px icon rail.
- At 375 px the workspace becomes a 230 px off-canvas overlay, centre panes stack, menu actions move to
  overflow, the toolbar remains one row, and no existing control clips horizontally.
- Responsive workspace presentations never overwrite durable desktop width.
- The real tab strip and its overflow remain with the later real-tabs slice; no empty/fake strip exists.
- Every state is automated at 375, 768, and 1280 in all six resolved palettes.

## Durable acknowledged layout

- Durable fields are native width, height, maximized state, workspace visibility/width, and last-used
  document-arrangement fallback.
- Excluded fields are window position, full-screen state, responsive-only widths, document content,
  document/tab state, document pane visibility, and Assistant visibility/width.
- Each document owns its current Editor/Split/Preview arrangement and pane state. The application
  fallback applies only when a document has no saved view and never overwrites one.
- Appmodel owns acknowledged layout and pending intent; Redux renders the projection.
- Discrete values persist immediately. Continuous resize/divider values persist 250 ms after input
  stops and synchronously flush before close.
- Each field carries original change time, writer ID, and sequence. SQLite conditionally accepts only
  the newer identity; close flush does not assign new authority.
- A failed write keeps the prior acknowledged value and emits one classified notification. A stale
  write reloads/projects the newer stored winner without an error.

## In-app actions, Settings, and focus

- One catalogue supplies stable ID, localized label/accessibility key, scope, shortcut, availability,
  and invocation for every shipped shell action.
- One in-app menu row sits directly below the native title bar on macOS, Windows, and Linux.
- Binding order is File, Settings, View, About. In this slice File is absent, so the visible row is
  Settings, View, About. It is not rendered as an empty menu or future-command advertisement.
- Only working actions are visible/enabled. Settings modality suppresses background shortcuts.
- Quick Appearance and modal Settings show the same acknowledged Theme and Appearance values.
- Settings traps focus, closes on Escape, and restores focus to its opener.
- Reset writes all and only delivered Appearance defaults in one backend transaction. Failure changes
  none; geometry, layout, documents, and recent paths are unchanged.
- Another open process retains its acknowledged Appearance values until relaunch.
- Empty future groups and Assistant settings are not shown.
- Every control is keyboard reachable, localized, correctly named/roled, visibly focused, usable with
  longer translated text, and behaviorally unchanged under reduced motion.

## Notifications

- A completed event uses a toast; a continuing condition uses an inline banner.
- Deduplication key is classified code plus subject. Repetition refreshes one item and shows a localized
  count.
- At most three toasts are visible. A fourth displaces only the oldest non-error.
- Errors never auto-dismiss and are never evicted. If all three visible toasts are errors, later errors
  queue in arrival order and a later non-error is not shown. Dismissal promotes the oldest queued error.
- Success, information, and warning dismiss after 4, 6, and 8 seconds. Successful automatic work is silent.
- Toasts appear above dialogs; content is localized and contains no raw error, secret, full remote URL,
  or private path.

## Build identity

- About displays one Go-injected application version.
- An uninjected build displays exactly `dev`.
- Frontend package metadata or a separately maintained version literal is not a product version source.

## Offline and response evidence

- Static production-source and built-bundle safeguards reject network APIs, remote assets/fonts,
  telemetry, update checks, and crash uploads introduced by the shell.
- One short representative Playwright journey records every request, allows only the local test origin,
  retains its log, and fails on any outbound attempt. No minimum duration or manual packet capture applies.
- The complete 18-case viewport/palette matrix remains automated browser evidence.
- At least 20 automated viewport-resize samples and 20 automated divider-drag samples are retained.
  At least 95% of visible updates are within 100 ms, no freeze exceeds 250 ms, and final durable
  acknowledgement is within 500 ms after input stops. No minimum duration applies.

## Current-host real-build evidence

One representative walkthrough on the current host covers:

- native movement, title gestures, border/corner resizing, exact minimum, minimize,
  maximize/restore, close/flush, and F11 full screen;
- in-app Settings/View/About menus and macOS App/Edit roles when the current host is macOS;
- Settings acknowledgement, atomic reset success/failure, trap/Escape/opener focus;
- desktop/rail/off-canvas workspace states and divider acknowledgement;
- About build identity and notification dedup/timing/error-queue/banner behavior;
- absence of File, launcher, recents, tab strip, Assistant controls/content, and future Settings groups.

The evidence records its host. Viewer completion remains blocked until native window behavior is also
proven on macOS, Windows, and Linux.

## Downstream entry gates

- Launcher activation waits for real New/Open/Open-folder/recent/close-last commands and a valid
  zero-document state.
- File and real tabs wait for safe file/document lifecycle and optional active identity.
- Rendering expansion and packaging remain later Viewer dependencies.
- Editor expansion and Assistant behavior remain behind their own document/operation/provider contracts.

This shell may preserve those future contracts by absence only. It must not create a fake state, DTO,
menu, tab, setting, or control for them.
