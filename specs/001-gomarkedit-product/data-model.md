# Phase 1 Data Model: Native Window Shell

This model covers only the approved shell slice. Launcher state, optional active-document identity,
File commands, real tabs, file lifecycle, rendering expansion, packaging, Editor expansion, and
Assistant state remain downstream.

## Native Window Presentation

Fields:

- `platform`: macOS, Windows, or Linux; derived from Wails, never user-set
- `width`, `height`: acknowledged outer native size; default 1024 x 768; minimum 375 x 480
- `durableState`: normal or maximized
- `sessionFullscreen`: true or false; never persisted
- `restoreReady`, `frontendReady`: lifecycle barrier inputs
- `visibleSurface`: hidden, startup-recovery, or normal-shell

Validation and ownership:

- Wails is explicitly framed and resizable; the OS owns title bar, controls, movement, title gestures,
  resize borders/cursors, minimize, maximize/restore, and close.
- Each stored dimension validates independently. An oversized result is clamped to the current/primary
  logical display size exposed by Wails; position is not restored and OS/Wails placement is retained.
- Native size and maximized state are queried through public Wails runtime operations, not inferred
  from DOM dimensions.
- No custom title control, drag flag, resize direction, resize target, or private runtime call exists.

Transitions:

- `hidden -> restoring -> normal-shell` only after `restoreReady && frontendReady`.
- `hidden -> startup-recovery` after initialization failure; Retry returns to `restoring`.
- `normal <-> maximized`; either may enter full screen and return to the preceding durable state.
- Native close invokes a synchronous Go pending-layout flush before shutdown.

## Application Layout

Fields:

- acknowledged window width, height, and maximized state
- acknowledged workspace visibility and durable desktop width
- last-used document-arrangement fallback
- one pending continuous-change record per durable field
- acknowledged revision

Relationships:

- Appmodel owns durable state and pending persistence intent; Redux renders acknowledged projection.
- A document view owns its Editor/Split/Preview arrangement and pane state. Application layout supplies
  only the fallback when that document has no saved view.
- The right Assistant region is structurally reserved at zero width and has no stateful control or child.
- Settings reset never changes application layout.

Validation:

- Durable fields exclude window position, full-screen state, responsive-only workspace widths, open
  documents, document content, document pane visibility, Assistant visibility/width, and tab state.
- At 768 px the workspace is presented as a 46 px icon rail. At 375 px it is a 230 px off-canvas
  overlay. Those temporary presentations never overwrite durable desktop width.
- A layout value becomes visible as durable state only after repository acknowledgement.

Transitions:

- Discrete intent: `acknowledged -> persisting -> acknowledged-new | rejected-old | newer-winner`.
- Continuous intent: `acknowledged -> pending -> persisting after 250 ms -> acknowledged-new |
rejected-old | newer-winner`.
- Failure retains the prior acknowledgement and produces one classified notification.
- Stale refusal projects the stored newer winner without an error.
- Close flushes only pending local fields and retains each field's original change identity.

## Persisted Layout Field

Fields:

- namespaced field key
- schema version
- typed value
- original `changedAtUnixNano`
- per-process writer ID
- writer-local sequence

Validation:

- Unknown keys are ignored.
- Missing or invalid fields fall back independently.
- Legacy scalar values remain readable and normalize into the versioned form.
- A conditional SQLite transaction compares `(changedAtUnixNano, writerId, sequence)` and replaces a
  value only when the incoming identity wins.
- Close flush never creates a new timestamp merely because a process closes later.

Transition: `candidate -> committed | stale-refused`. A stale refusal reads and returns the stored
winner as the acknowledged result.

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
- The in-app row presents Settings, View, About in that order. File has no entry in this slice.
- Only actions with production consumers are visible and enabled.
- Settings modality suppresses global/document/editor actions behind it.
- macOS App/Edit roles are platform-owned and are not duplicated in the DOM catalogue; native About
  remains unset so About has one in-app owner.

## Startup Recovery

Fields:

- exact localized title and message keys
- safe classified initialization failure
- retry state: idle or retrying
- initialization generation/show-once guard

Validation:

- The visible recovery surface contains exactly the approved title, message, and Retry control.
- The normal shell is unmounted/hidden while recovery is visible.
- Repeated failure exposes no raw error or private configuration path.
- Retry invokes one typed backend initialization command and cannot show the normal shell twice.

Transitions: `initializing -> startup-recovery -> retrying -> startup-recovery | restoring -> normal-shell`.

## Delivered Settings Shell

Fields:

- modal open state and active delivered group
- opening control identity for focus restoration
- backend-acknowledged Theme and Appearance values
- reset state: idle, pending, acknowledged, or rejected

Validation:

- Quick settings and modal Settings render the same acknowledged values.
- A failed write retains prior values in both surfaces.
- Focus enters the modal, remains trapped, Escape closes it, and focus returns to the opener.
- Reset contains exactly all delivered Appearance defaults and commits them in one transaction.
- Failure changes none; layout, documents, recent paths, and future settings remain untouched.
- Another running process keeps its acknowledged Appearance values until relaunch.
- Empty future groups are not rendered.

Transitions:

- Single setting: `acknowledged -> pending -> acknowledged-new | rejected-old`.
- Reset: `acknowledged-set -> reset-pending -> default-set | rejected-original-set`.

## Notification

Fields:

- notification ID; severity: success, info, warning, or error
- classified code and subject; dedup key `(code, subject)`
- localized title/remediation keys and named arguments
- repetition count and refresh generation
- toast or continuing-condition banner lifecycle
- optional remediation action
- created/refreshed time and queued error arrival sequence

Validation:

- At most three toasts are visible.
- Repetition refreshes one notification and increments localized `xN` presentation.
- Errors never auto-dismiss and are never displaced.
- Success/info/warning dismiss after 4/6/8 seconds; successful automatic work is silent.
- A fourth item displaces only the oldest non-error. When all three visible items are errors, later
  errors queue in order and a later non-error is not shown.
- No raw error, secret, full remote URL, or private path crosses the boundary.

Transitions: `created -> visible | queued | not-shown`; `visible -> refreshed* -> dismissed`;
`queued-error -> visible` when capacity opens.

## Build Identity

Fields:

- one Go-injected application version
- exact fallback `dev`

Validation:

- About renders the projected value from the single backend source.
- `frontend/package.json` and any separately maintained literal are not product version sources.

## Shell Evidence Observation

Fields:

- case ID; palette; resolved mode; viewport; tested host/platform
- monotonic visible-update duration
- main-thread freeze duration
- final durable-acknowledgement duration
- interaction kind: window resize or divider drag
- browser request URL, method, initiator, and local/outbound classification
- current-host real-build walkthrough step and observed outcome

Validation:

- Exactly 18 automated viewport/palette cases cover 375, 768, and 1280 across all six palettes.
- At least 20 automated resize samples and at least 20 divider samples are retained.
- At least 95% of visible updates are within 100 ms; no freeze exceeds 250 ms; final acknowledgement
  is within 500 ms after input stops.
- One short representative browser journey observes zero outbound attempts and retains its request log;
  no minimum duration applies.
- One current-host real-build walkthrough covers every operation named by SC-018 and records its host.

Evidence observations are test artifacts, not application state, and never enter the settings database.

## Downstream Entities (Not Activated)

Zero-document launcher state, optional active identity/buffer, recent items, File actions, tab order,
file identity/content, rendering expansion, package identity, Editor expansion, provider configuration,
proposals, and transcripts are not part of this model revision. This slice preserves their absence; it
does not create DTO fields, placeholders, or disabled controls for them.
