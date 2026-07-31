# Phase 1 Quickstart: Validate the Window and Launcher Shell Plan

This guide validates the plan now and defines runnable evidence for the later implementation. Planning
checks do not claim native behavior is already built.

## Prerequisites

- Go 1.25.7, Node 22, Wails v2.12.0, `just`, and dependencies installed with `just setup`
- Existing appearance outcome at or after commit `53af8e4`
- Read [plan.md](plan.md), [data-model.md](data-model.md), and
  [contracts/window-launcher-shell.md](contracts/window-launcher-shell.md)
- Preserve unrelated working-tree changes; leave planning artifacts unstaged unless explicitly asked

## 1. Validate the planning boundary

Run:

```bash
rg 'NEEDS[ ]CLARIFICATION|T[B]D|T[O]DO' \
  specs/001-gomarkedit-product/plan.md \
  specs/001-gomarkedit-product/research.md \
  specs/001-gomarkedit-product/data-model.md \
  specs/001-gomarkedit-product/contracts \
  specs/001-gomarkedit-product/quickstart.md
git diff --check
```

Expected: no unresolved marker and no malformed patch.

Review manually:

1. FR-012 through FR-014 and affected cross-cutting behavior are complete in the shell contract.
2. Full FR-011 is explicitly entry-gated with safe file lifecycle; no fake/no-op launcher is authorized.
3. File opening, tabs, rendering, packaging, Editor expansion, and Assistant work are not decomposed.
4. Go/appmodel remains canonical and Wails runtime access remains adapter-only.
5. Exact 6 px edges, 12 px corners, 375 x 480 minimum, 250 ms persistence pause, toast timing, and
   responsive widths appear consistently in plan, research, model, contract, and quickstart.

## 2. Capture the implementation baseline

Before any production edit, run:

```bash
just baseline 001-gomarkedit-product
```

Expected: every retained gate records raw output, exit code, findings, and a reliable verdict. A nonzero
analyzer that parsed nothing is `UNRELIABLE` and blocks implementation. Preserve the baseline before
changing Wails options, appmodel state, persistence, adapters, or UI.

## 3. Prove backend and native-lifecycle behavior

The implementation must add and run focused tests for:

```bash
go test ./internal/appmodel ./internal/settings ./internal/db ./internal/application
go test .
```

Expected coverage:

- frameless/start-hidden/default/minimum Wails options, macOS-only native menu selection, and `dev`
  version fallback;
- restore-before-show and startup-failure no-show ordering;
- exact startup failure copy, Retry, and show-once after recovery;
- independent missing/corrupt layout fallback;
- discrete write, 250 ms continuous write, close flush, failed-write rollback;
- two SQLite connections proving stale close cannot overwrite a newer change;
- appmodel projection contains acknowledged shell layout only.

## 4. Prove adapter, accessibility, and notification contracts

Run focused frontend tests and then the complete frontend suite:

```bash
npm --prefix frontend test -- --runInBand
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected coverage:

- eight allowlisted resize mappings and no component access to Wails globals/bindings;
- platform control order/commands and full-screen/maximized disablement;
- one registry entry per shipped action and no duplicate shortcut;
- Settings initial focus, trap, Escape, return focus, and background-shortcut suppression;
- notification code+subject dedup, count refresh, 4/6/8 second timing, error retention, and
  oldest-non-error displacement;
- real `AppShell` rendering rather than a mock asserting on itself;
- dev bridge parity for layout/window commands and classified failures.

## 5. Validate the visible shell in the in-app browser

Start the mock-backed interface:

```bash
just dev-ui
```

Open its local URL in the in-app browser. Use actual controls and record the following cases:

1. At 1280 px, open every shipped menu and Settings; toggle sidebar and Appearance; verify acknowledged
   root/theme/layout state and focus restoration.
2. At 768 px, verify the Assistant is absent, the sidebar is a 46 px icon rail, and hidden actions are
   available through overflow.
3. At 375 px, open/close the 230 px sidebar overlay by keyboard, verify menu overflow, stacked centre
   panes, one-row toolbar, and no horizontal clipping.
4. Repeat the three widths in all six theme/resolved-mode combinations.
5. Raise the same error five times: one toast shows count five. Fill three error slots and verify a
   fourth non-error does not evict one. Verify errors remain until dismissed.
6. Turn on reduced motion and repeat sidebar/menu/dialog interaction with unchanged outcomes.

Run the browser suite after the interaction pass:

```bash
npm --prefix frontend run verify:ui
```

## 6. Validate the real native window

Build and launch the real Wails application, not only the mock server:

```bash
just build
```

Numbered current-platform cases:

1. First launch appears once at restored/default size with no visible resize/layout jump.
2. Drag empty title space; click/drag each interactive child and verify it does not move the window.
3. Double-click empty title space twice and verify maximize then restore.
4. Operate minimize/maximize/restore/close and F11 entirely by keyboard.
5. Verify all four 6 px edges and all four 12 px corners show correct cursors and resize. A control near
   an edge remains clickable.
6. Maximize/full-screen and verify all zones and drag behavior are inert.
7. Resize to the minimum and read 375 x 480; smaller stored values fall back/clamp before display.
8. Change sidebar/size, quit during the 250 ms pause, relaunch, and observe the final acknowledged value.
9. Run two processes: make a newer layout change in B, then close A with older pending intent; relaunch
   and observe B's value.
10. On macOS, verify native App/Edit roles make copy, paste, undo, redo, select all, and quit work.

Repeat the chrome cases on macOS, Windows, and Linux at the Viewer release gate. Current-host success is
not three-platform completion.

## 7. Verify the completed shell slice

After implementation and live repair loops:

```bash
just verify 001-gomarkedit-product
just archtest
just test
just build
git diff --check
```

Expected: no new baseline finding, architecture tests fully green, named shell tests inspected, visible
cases passed, and a real build walked. Only then reconcile this slice and run `/speckit-tasks` for the
safe file lifecycle/launcher activation entry gate.
