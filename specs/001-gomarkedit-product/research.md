# Phase 0 Research: Window and Launcher Shell

This research follows the delivered appearance frontier and resolves the technical choices needed for
the next bounded Viewer slice. It does not use historical completion labels as evidence.

## Decision 1: Make the native window shell the actionable frontier

**Decision**: Implement window chrome, durable shell layout, settings/error surfaces, keyboard focus,
and responsive states now. Keep file opening, tabs, rendering, packaging, Editor expansion, and
Assistant behavior downstream.

**Rationale**: The appearance tokens and six palettes are verified, so new chrome can consume a stable
visual system. Current code has only a structural three-column grid and a framed Wails window; the user
can observe and verify this slice without inventing file or rendering seams.

**Alternatives considered**: Rebuild the historical phase wholesale, which would expose placeholders;
combine shell and safe file opening, which crosses the agreed dependency cutoff; generate the entire
remaining product backlog, which would speculate beyond production seams.

## Decision 2: Restore from a hidden Wails startup

**Decision**: Configure `Frameless`, `StartHidden`, `MinWidth: 375`, and `MinHeight: 480`. Initialize
SQLite, load and validate stored native size/maximized state, apply it, hydrate frontend layout, then
show the window. Use 1024 x 768 and normal state as independent defaults. Do not persist screen
position in v1; let the operating system place each process.

**Rationale**: Hidden startup is the only existing Wails lifecycle that can prevent a default-size
flash while SQLite remains authoritative. Size and maximized state are explicitly required; omitting
position avoids an unsupported cross-platform move-event dependency and matches the shared rather than
per-monitor layout decision.

**Alternatives considered**: Show then resize, which visibly jumps; duplicate layout in localStorage,
which creates a second authority; persist x/y through polling, which adds background work and unstable
multi-monitor behavior without a product requirement.

## Decision 3: Persist layout per field with original change identity

**Decision**: Store each layout field as a versioned KV value containing the value, wall-clock change
time, per-process writer ID, and writer-local sequence. Update atomically only when the incoming change
identity is newer. Discrete commands write immediately; continuous resize/divider intent is retained in
Go and written after 250 ms; close flushes only locally pending fields with their original identity.

**Rationale**: An unconditional close upsert would make the last window to close authoritative, even
when another window changed the value later. Per-field conditional writes implement last-changed-wins
without a schema migration or whole-layout snapshots.

**Alternatives considered**: Save the whole layout on close; unconditional per-field upsert; per-window
layout identities. All conflict with the accepted shared application-layout behavior or allow stale
close writes.

## Decision 4: Keep one canonical meaning for each arrangement value

**Decision**: A document's view owns its current Editor/Split/Preview arrangement. Application layout
stores only the last-used arrangement fallback for a document that has no saved view. The shell never
projects two simultaneous canonical pane states.

**Rationale**: Current DTOs contain both document view and application layout arrangement fields. The
file-open contract already defines their precedence: saved document view, then application fallback,
then Split.

**Alternatives considered**: Make arrangement globally canonical, which loses per-document state;
persist both without precedence, which creates conflicting owners; remove the application fallback,
which loses the specified new-document/open fallback.

## Decision 5: Isolate the exact resize contract behind the adapter

**Decision**: Render 6 px edge zones and 12 px corner zones in the shell. An injected adapter maps the
eight directions to the pinned Wails desktop `resize:<direction>` invocation. No component accesses
`window.WailsInvoke` or Wails private flags. Characterization tests pin the mapping and native live
cases prove cursor, hit area, resize, maximized/full-screen disablement, and nearby-button clicks.

**Rationale**: Wails v2.12 exposes no public begin-native-resize method. Its built-in hit testing uses
6 px and cannot meet the required 12 px corners. The pinned desktop runtime already accepts the native
resize invocation on Windows and Linux; isolating the version-sensitive seam is smaller and safer than
forking Wails or hand-writing three native backends.

**Alternatives considered**: CSS-only zones, which cannot start native resize; accept 6 px corners,
which weakens a numeric requirement; maintain a Wails fork/native plugin, which adds disproportionate
cross-platform ownership.

## Decision 6: Use platform variants, not universal traffic lights

**Decision**: Detect platform through the adapter/environment contract. macOS renders
close/minimize/zoom on the left and installs native App/Edit roles; Windows and Linux render
minimize/maximize/close on the right and install no native menu. All invoke the same window commands;
standard macOS clipboard/undo roles remain platform-owned.

**Rationale**: The mockup's traffic lights are a macOS specimen, while FR-012 and the accepted chrome
decision require platform-appropriate controls. The native macOS Edit role is required for WKWebView
clipboard and undo behavior.

**Alternatives considered**: Traffic lights everywhere; native chrome; a native menu on every platform.
Each violates either the visual or platform behavior contract.

## Decision 7: Introduce one registry only for actions that work now

**Decision**: Create one canonical registry containing stable ID, localization key, scope,
platform-neutral shortcut, availability, and invocation route. This slice registers working window
controls, full screen, sidebar, Settings, and About actions only. Menus and keyboard handling consume
the same entries; modal Settings suppresses background actions.

**Rationale**: No registry exists today, and duplicating the title menu and shortcuts would guarantee
drift. Registering future New/Open/Save/Assistant actions before their commands exist would create
enabled no-ops or misleading availability.

**Alternatives considered**: Component-local shortcuts and labels; the complete future catalogue now;
Go and TypeScript registries with duplicated labels.

## Decision 8: Repair notifications with real current consumers

**Decision**: Model severity, subject, dedup key, repetition count, lifecycle, and optional remediation.
Repeat code+subject refreshes one toast and increments its count. At most three are visible; only the
oldest non-error may be displaced. Success dismisses after 4 s, info after 6 s, warning after 8 s, and
errors never auto-dismiss. Current startup/settings/layout errors are real consumers; later save,
render, lint, and provider outcomes remain with their slices.

**Rationale**: Existing error plumbing is centralized but incorrectly discards repeats, uses one 5 s
duration, and may evict errors. Repairing it now makes shell failures observable without inventing
future operations.

**Alternatives considered**: Keep error-only toasts; build example-only severities; defer notification
repair. The first violates FR-007, and the second creates production showcase data.

## Decision 9: Expand Settings only around delivered controls

**Decision**: Turn the Appearance dialog into the accessible modal/navigation shell, synchronize it
with the title-bar quick settings, and add reset for delivered settings. Trap focus, close on Escape,
restore opener focus, and suppress background shortcuts. Do not show empty future groups or controls
whose consumers do not exist. Reset excludes window layout and future recent items.

**Rationale**: The current Appearance path is backend-acknowledged and tested. Empty Editor, Export,
or AI panels would be production placeholders, while exposing Format-on-save before Save exists would
offer a setting with no behavior.

**Alternatives considered**: Render every mockup group empty; implement the entire 25-setting catalogue;
keep the current non-modal custom dialog. These either violate scope/no-placeholder rules or fail the
keyboard/focus contract.

## Decision 10: Treat launcher activation as an explicit entry gate

**Decision**: Fix the launcher data/state/visual contract now, but do not transfer full FR-011 or ship
enabled launcher actions in the shell-only task batch. Activation joins the safe file lifecycle when
real New, Open file, Open folder, recent mutation, and close-last commands exist. Zero documents,
optional active identity/buffer, and dev-bridge parity are implemented in that activation slice.

**Rationale**: A true launcher requires an empty document set, while current appmodel always creates and
dereferences Untitled. Open file/folder behavior owns decoding, path safety, picker cancellation, and
workspace rules scheduled next. Fake recents, disabled mockup actions, or enabled no-ops would not be a
vertical slice.

**Alternatives considered**: Expand this batch into safe file opening; show disabled or no-op launcher
buttons; silently keep the initial Untitled document while claiming FR-011. All violate the agreed
boundary or the product contract.

## Decision 11: Apply explicit mockup arbitration corrections

**Decision**: Use the mockup's visible shape and responsive behavior, with these behavior-authority
corrections: relative menu order is File, Settings, View, About as drawn, but File is omitted until it
has a real action; platform controls vary by OS; the toast gallery is not a valid four-toast runtime
stack; the pre-Assistant right region stays width 0; stale chord accelerators are not copied; only real
settings groups/actions are visible.

**Rationale**: These differences are either platform variants or direct conflicts with consolidated
functional requirements and the production no-placeholder rule. Recording them prevents accidental
drift from being hidden as implementation taste.

**Alternatives considered**: Copy every specimen literally; ignore the mockup; edit the historical
mockup. The first violates behavior, the second violates visual authority, and the third crosses the
reference-only boundary.

## Resolved Unknowns

- No dependency upgrade is needed.
- Default window size is 1024 x 768; minimum is 375 x 480; position is OS-managed.
- Continuous layout debounce is 250 ms and close flush is synchronous before database shutdown.
- Exact 12 px corner resize uses the adapter-contained pinned Wails invocation.
- Per-document arrangement and application fallback have distinct precedence.
- Full launcher activation is entry-gated rather than faked.
- Complete chrome evidence is current-platform now and all three platforms at the Viewer release gate.
