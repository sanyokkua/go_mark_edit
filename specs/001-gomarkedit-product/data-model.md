# Phase 1 Data Model: Window and Launcher Shell

This model covers the next bounded shell slice. Document bytes, file identity, tabs, rendering,
workspaces, recents mutation, saving, providers, proposals, and transcripts remain downstream.

## Window Presentation

Fields:

- `platform`: macOS, Windows, or Linux; derived from the Wails environment, never user-set
- `width`, `height`: acknowledged native size; default 1024 x 768; minimum 375 x 480
- `state`: normal, maximized, or full-screen; only normal/maximized are durable
- `visible`: false during restore/startup failure; true only after native and frontend layout readiness
- `resizeDirection`: one of eight transient edge/corner directions while native resize begins

Validation:

- Each stored dimension validates independently and falls back independently.
- Full screen is session-only and does not overwrite the durable normal/maximized state.
- Resize zones are disabled while maximized or full-screen.
- Window position is operating-system managed and not persisted.

Transitions:

`created-hidden -> restoring -> ready-visible`, or `created-hidden -> startup-failed`. Normal may toggle
to maximized and back; either may enter full-screen and return to the preceding state.

## Application Layout

Fields:

- sidebar visibility and width
- last-used document arrangement fallback
- reserved Assistant visibility `false` and width `0` until its consumer slice
- one pending continuous-change record per field
- acknowledged revision

Relationships:

- Owned by appmodel and projected to Redux.
- A document view, when one exists, owns its active arrangement. Application layout supplies only the
  fallback for a document with no saved view.
- Settings reset never changes application layout.

Validation:

- Sidebar width is clamped only to the responsive shell's usable bounds; invalid stored values fall
  back without discarding valid siblings.
- At 768 px the visible desktop sidebar becomes a 46 px icon rail. At 375 px it becomes a 230 px
  off-canvas overlay; these responsive presentations do not overwrite the user's durable desktop width.
- The Assistant region remains collapsed to zero and contains no placeholder child.

Transitions:

- Discrete intent: `projected -> persisting -> acknowledged | rejected`.
- Continuous intent: `projected -> pending -> persisting after 250 ms -> acknowledged | rejected`.
- Rejection retains the preceding acknowledged projection and produces a classified notification.
- Close flushes only pending fields and preserves each field's original change identity.

## Persisted Layout Value

Fields:

- namespaced field key
- schema version
- typed value
- `changedAtUnixNano`
- per-process writer ID
- writer-local sequence

Validation:

- Unknown keys are ignored.
- Legacy scalar values remain readable and normalize into the versioned form.
- A conditional SQLite transaction replaces a value only when `(changedAt, writerId, sequence)` is
  newer than the stored identity.

State transition:

`candidate -> committed | stale-refused`. A stale refusal is a successful conflict outcome: the caller
reloads/projects the newer acknowledged value and does not show an error.

## Shell Action

Fields:

- stable action ID
- localized label and accessible-name key
- scope: global, document, or editor
- platform-neutral shortcut definition
- availability predicate and unavailable reason
- invocation route

Validation:

- One action ID and one shortcut registration.
- Only actions with production consumers are visible/enabled.
- Modal Settings suppresses global/document/editor actions behind it.
- Standard macOS App/Edit roles are platform-owned exceptions and are not reimplemented as DOM
  clipboard/undo handlers.

## Notification

Fields:

- notification ID
- severity: success, info, warning, or error
- classified code and subject
- localized title/remediation keys and named arguments
- dedup key `(code, subject)`
- repetition count and refresh generation
- optional remediation action
- created/refreshed time

Validation:

- At most three are visible.
- A repeated live dedup key refreshes one notification and increments its count.
- Error never auto-dismisses and is never displaced by a newer notification.
- Success/info/warning dismiss after 4/6/8 seconds respectively.
- Automatic successful work is silent.
- No internal path, raw error, secret, or full remote URL crosses the boundary.

Transitions:

`created -> visible -> refreshed* -> dismissed`; timed dismissal is unavailable for error. A fourth
notification displaces only the oldest non-error; if all three are errors, the new non-error is not
shown and a new error remains pending until capacity is available.

## Delivered Settings Shell

Fields:

- modal open state and active delivered group
- opening control identity for focus restoration
- backend-acknowledged Appearance values
- draft interaction state only while a control is being operated

Validation:

- Quick settings and modal Settings render the same acknowledged values.
- A failed write retains the last acknowledged value in both views.
- Focus enters the modal, remains trapped, Escape closes it, and focus returns to the opener.
- Reset affects delivered settings only; layout and future recents are excluded.
- Empty future setting groups are not rendered.

## Launcher State (Entry-Gated)

Fields:

- empty document set
- absent active document identity and buffer
- up to six ordered recent document/folder summaries
- availability of New, Open file, and Open folder commands

Validation:

- No content or tab set is restored on launch.
- Recent summaries contain display name, kind, and containing folder only; no fake samples.
- The empty-recent copy is `Documents you open will appear here.` through the catalogue.
- Launcher controls become enabled only with their real safe lifecycle commands.

Transitions:

`process-ready -> launcher`; `launcher -> document/workspace` only after a successful command;
cancelled picker remains launcher with no notification. Closing the last document returns to launcher.
This entity is designed here but becomes implementable with the safe file lifecycle slice.
