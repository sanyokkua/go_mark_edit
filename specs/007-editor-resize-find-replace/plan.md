# Implementation plan

## Goal and design

Implement the approved specification using the existing EditorStage, Monaco, document-view seam and file-metadata repository. React owns only temporary drag state; Go owns the committed per-document ratio. Extend the existing versioned file metadata additively rather than creating a parallel persistence owner. Import Monaco's Find contribution and invoke its built-in actions through typed editor commands and the central action registry.

## Dependency-ordered work

1. Record a reliable six-stage baseline before production edits.
2. Add backend split-ratio state, validation and persistence with tests, including restore, Save As and failure behavior. Expose `splitRatio` as an optional view input so older callers preserve the acknowledged ratio; canonical views always contain a normalized ratio in [0.2, 0.8].
3. Add frontend view plumbing, preserve ratios across all partial/full view updates, and implement the divider. Extract reusable pointer lifecycle from Sidebar without changing its 16px keyboard behavior. Use 2-percentage-point keyboard increments and 20/80 limits for split resizing. At the existing 376px stacked breakpoint hide the divider.
4. Independently enable Monaco Find/Replace, extend typed editor commands and registry-derived shortcuts, and test readonly/modal/focus handling. Standard Monaco bindings stay intact; R invokes the same native action.
5. Add real-backend E2E for width changes, per-document restoration and search/replace content flow; update architecture documentation.
6. Perform independent review, full verification, baseline comparison and native macOS walkthrough.

## Verification

Tests live under tests/go or frontend/tests and assert observable behavior. Cover every acceptance scenario from spec.md, with real SQLite files for persistence and real Monaco/backend E2E for search, replacements, saved bytes and undo. Run scripts/verify and scripts/baseline --compare. Verify the native app at relevant widths and theme combinations using Computer Use; report any environment limitation as unverified rather than passing.

## Constraints

No network behavior, dependency addition, generated binding edits, state-owner duplication, session restoration, constitution edit or unrelated refactor. File metadata remains keyed by canonical path and carries no document contents. Ratio persistence failures retain the session value and use existing notices. Preserve cursor/selection/scroll during ratio commits.
