# The narrow workspace overlay — decided, not yet implemented

**Decision taken 2026-08-14**: on a narrow window the workspace panel should
**start closed**, because it is an overlay there and covers the tab strip.

**Status: attempted, reverted, and handed on with the design problem stated.**
Nothing is half-built in the tree.

## The defect it addresses

At ≤376px the workspace draws on top of the tab strip. Playwright reports
`<aside aria-label="Workspace"> intercepts pointer events` when the new-tab
control is clicked, and the panel starts open on every launch. So the first
thing a user sees on a narrow window hides the tabs, and the `+` cannot be
reached until the panel is dismissed.

## Why the obvious implementations are both wrong

**Attempt 1 — a viewport presentation rule in `AppShell`.** Override the
projected value to `false` while narrow, until the user chooses otherwise. This
**splits the source of truth**: `App.tsx` passes the raw preference to
`ShellMenuRow` for the toggle, while `AppShell` renders the override. The toggle
then computes `!displayed` → `true`, dispatches `setWorkspaceVisible(true)`, the
preference was *already* `true`, nothing changes, and the panel stays shut. Two
components holding different ideas of one value is precisely what Constitution
III exists to prevent. Measured: `editor-stage` 108 → 90 passing.

**Attempt 2 — dispatch `setWorkspaceVisible(false)` on mount when narrow.** One
source of truth, architecturally clean. But `SidebarVisible` is **persisted and
restored** (`internal/appmodel/service.go:398`), so opening the application once
in a narrow window would leave the workspace hidden on every later wide launch.
A viewport condition would be writing a durable user preference.

## What it actually needs

A third value: the workspace's *presentation* at narrow width is not the same
thing as the user's stored preference, and the model currently has only one
field for both. Resolving it means deciding one of:

- a UI-only session flag for the narrow overlay, owned by the `ui` slice rather
  than the backend, with the backend preference governing wide layout only; or
- a second backend field distinguishing "preferred when there is room" from
  "open right now"; or
- leaving the panel open and changing the *layout* so the overlay no longer
  covers the tab strip — which fixes the reachability complaint without touching
  state at all, and is the smallest change of the three.

The third is worth serious consideration: the reported problem is that the
overlay covers the `+`, not that the panel is open.

## What was kept

The test improvement from the attempt is retained, because it is correct either
way: `editor-stage`'s sidebar-toggle assertions no longer assume the panel
starts open. They read the starting state and assert the toggle flips it both
ways with the panel following. That holds whichever way this decision lands.
