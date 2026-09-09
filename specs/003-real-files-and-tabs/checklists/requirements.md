# Specification Quality Checklist: Real Files and Tabs

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-07
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No accidental implementation details; the approved HTML/CSS, browser-capture, and Wails constraints appear
      only where the binding surface and real-build evidence require them
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria describe measurable user-visible or evidence outcomes; their explicit HTML/CSS/browser/Wails
      references are approved authority constraints rather than speculative design
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No unapproved implementation details leak into specification

## Exact Visual-Parity Readiness

- [x] The binding mockup HTML/CSS, reference screenshots, and current-build discrepancy screenshots have distinct,
      explicit authority roles
- [x] ~~The finite in-scope parity manifest and its 17-family × 18-combination = 306 paired comparisons are
      enumerated~~ **Superseded 2026-08-14 (T093, finding C6)** — whole-screen comparison is withdrawn, so this item
      could never be ticked truthfully as written. Its replacement is enumerated and satisfied: **14 pixel-compared
      component keys** in `frontend/e2e/targeted-manifest.ts` and **36 behaviour-verified keys** derived in
      `frontend/e2e/parity/manifest.ts`, all executed by `targeted-parity.test.ts` (20 cases, ×3 under the `parity`
      project). See spec.md Clarifications → Session 2026-08-14 and FR-FT-051.
- [x] Exact geometry, typography, icon, popup, theme-structure, and responsive acceptance values are stated
- [x] Dual local serving and deterministic viewport, pixel-ratio, zoom, font, fixture, focus, scroll, palette, and
      motion conditions are fixed
- [x] The zero-unexplained-pixel rule, minimal-mask boundary, retained reference/actual/difference evidence, and
      anti-baseline-laundering rule are explicit
- [x] Feature 003 variants for the file-only launcher, unavailable Open Folder, absent recent folders, and
      Reload/Keep mine/Skip prompt are defined without broad screenshot masks — the launcher variants are defined in
      `frontend/e2e/parity/reference-adapter.ts` and paired by the passing `T057 pairs file-only launcher variants
before any screenshot comparison`, which asserts Open folder disabled on both pages and the recent-file list
      on each; no mask is involved, and the reload-prompt variants are carried by the same adapter.
- [x] OS-owned framing/native dialogs, populated workspace, Assistant/provider, and deferred rich-rendering regions
      are explicitly excluded without weakening the mapped webview comparison
- [x] Unaffected Feature 001/002 visual and behavioral baselines must remain intact, and every approved baseline
      change maps to one Feature 003 requirement
- [x] Exact same-browser parity, actual-control browser journeys, real-bridge interaction, and fresh current-host
      Wails evidence are all required rather than treated as substitutes

## Notes

- Validation iteration 1 found Prettier drift in `spec.md`; the file was formatted before iteration 2.
- A prior clarification pass resolved stable disk-mismatch re-reading, suspended-write continuation and explicit
  Save/autosave serialization, foreground external-change discovery and conflict ordering, repeated post-commit
  rehydration failure with safe close-permit timing, keyboard tab reordering, path race/canonicalization, New/Open
  activation ordering, the mixed-ending confirmation surface, authoritative save-status transitions and
  deterministic path disambiguation, byte and line-ending boundaries, preview refresh, comparison truncation,
  reproducible performance measurement, and the finite additional visual-state matrix. That pass's items were
  resolved but this checklist was not revalidated afterward; the stale unchecked/deferred state above is corrected
  by the current revalidation.
- This clarification pass resolved the complete Copy path/Reveal in file manager behavior (success semantics,
  missing/detached-path handling, clipboard/OS failure recovery, notification text, and focus restoration), defined
  the finite eight-category classified error and remediation contract replacing every ambiguous "actionable"
  reference, made SC-FT-002's timer start/stop, fixture, and bounded before/after filesystem inventory exact, and
  promoted the already-decided Next/Previous tab shortcut values from `contracts/tab-session.md` into FR-FT-034.
  `contracts/tab-session.md`, `contracts/file-lifecycle.md`, and `contracts/save-conflict-close.md` were updated to
  stay consistent with the new spec.md contract.
- Plan/task regeneration must separately repair production bridge, target-host/two-instance/native-network
  evidence, baseline/tooling order, and named proving-test coverage.
- Approved architecture boundaries are stated as required system qualities, not as a speculative implementation
  plan. Concrete modules, method names, data-transfer shapes, and task locations remain for `$speckit-plan`.
- Feature 002 retains `Ctrl/Cmd+Shift+T` for Table; recent files remain accessible from File and launcher
  surfaces, and reopen-last-closed-tab retains `Ctrl/Cmd+Shift+Alt/Option+T`.
- The six-entry recent-file cap is explicit so the migrated bounded-list rule has a numeric limit matching the
  binding launcher surface.
- Approved visual approach A treats the binding HTML/CSS as exact shape/style authority and requires concurrent
  local mockup/application capture. The supplied screenshots are retained as reference/discrepancy evidence, not
  as permission to replace the binding source with a current-application baseline.
