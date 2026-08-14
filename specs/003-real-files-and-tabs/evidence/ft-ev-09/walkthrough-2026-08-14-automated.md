# Current-host walkthrough — 2026-08-14, screen-automation run

Binary: `build/bin/GoMarkEdit.app`, built this session from commit `3befc43e` (16 MB).
Method: macOS screen automation against the real packaged application, driven through the
granted-application surface. **Not** `just dev`, **not** `dev-ui`, **not** Playwright.
Fixtures: `~/Documents/gomarkedit-walkthrough/` (outside the repository, six files).

This run does not close T097. It closes part of it, finds one production defect, and states
exactly which SC-FT-002 numbers this method cannot produce. What remains owed is listed at the
end with the fixtures already built for it.

## The defect: the Autosave toggle does not stop autosaving

**Severity: high. The switch reports a state the application does not honour.**

Reproduction on the real binary:

1. Open `fixture-a.md`. Status bar reads `Autosave on`.
2. Settings → click the Autosave switch. Status bar reads `Autosave off`; the Settings switch
   renders off.
3. Type text. Take no other action. **Wait six seconds.**
4. `fixture-a.md` on disk grew 145 → 165 bytes and contains the typed text.

The document was written to disk with autosave switched off and no explicit save issued.

### Root cause

`internal/appmodel/autosave.go:35` defines `SetAutosaveEnabled(enabled bool)`, and the scheduler
genuinely honours it — `autosave.go:64` and `:161` both refuse to fire when
`service.autosaveEnabled` is false. Nothing ever sets it false:

- `SetAutosaveEnabled` has **no Wails binding** — it appears nowhere under `frontend/wailsjs/`.
- **No frontend code calls it** — a repository-wide search for `SetAutosaveEnabled` or
  `setAutosaveEnabled` across `frontend/src` and `frontend/wailsjs` returns nothing.

The toggle therefore updates only the projection. This is precisely the failure mode AGENTS.md
warns about: the store is a projection, not a source of truth, and writing to it without
commanding Go drifts silently.

### The second symptom, explained by the same cause

An explicit `⌘S` reports **`Autosaved`** in the title bar rather than `Saved`. That is not a
separate bug in the status logic, which is correct — `saveStatusForDocument`
(`internal/appmodel/save_status.go:38`) returns `Autosaved` only when `baselineOrigin` is
`SaveOriginAutosave`, and `save.go:77` passes `SaveOriginExplicitSave` on the explicit path.
What happens is that the un-stoppable autosave commits the baseline first with the autosave
origin; the subsequent `⌘S` finds the document clean and no-ops, leaving the earlier origin in
place. Fixing the wiring should fix the label with it — worth re-checking rather than assuming.

### Why no existing test caught it

The behavioural suites drive the deterministic parity route with seeded fixtures and assert the
projection. The 2026-08-13 walkthrough recorded the toggle as working, but what it verified was
the label: *"the projection round-trips: the status bar moved `Autosave on` → `Autosave off` →
`Autosave on`"* (`current-host-walkthrough.md:16`). It never checked that autosaving stopped.
The observable behaviour and the label disagree, and only the label was ever tested.

## What this run does establish

| Check | Result |
| --- | --- |
| Startup on the real binary | Launches to an `Untitled` document, ready for input; native frame with OS traffic lights, in-app menu row below it |
| File menu inventory | `Open Folder…` and `Export to PDF…` visibly unavailable; `New Window` unavailable; one recent file; `⌘N`/`⌘O`/`⌘S`/`⇧⌘S`/`⌘W` accelerators shown |
| Native Open dialog | Real macOS dialog; non-Markdown files (`go.mod`, `justfile`, `*.go`) correctly dimmed; `⇧⌘G` path entry works |
| Open a real file from disk | `fixture-a.md` (96 bytes) opens; title bar shows `gomarkedit-walkthrough / fixture-a.md`, status `UTF-8`, `LF`, 17 words |
| Explicit save commits to disk | 96 → 132 → 145 bytes across two explicit saves; content on disk matches the editor |
| **FR-FT-009 temp-file absence** | **Confirmed.** Non-recursive listings before and after are in `sc-ft-002/listing-before.txt` and `listing-after.txt`; no temp, swap or backup file appears at any point |
| Dirty projection | Typing moves the title bar to `Unsaved changes` immediately |
| Deferred settings | `Format on save` and `Lint on save` render visibly unavailable; `Autosave` renders enabled |
| Settings menu shape | Theme swatches, Appearance (Auto/Light/Dark), Default open mode, Markdown flavour, three switches, `All settings…` |

## What this method cannot produce, and why

**SC-FT-002's timed saves.** The criterion times from final input to the observed save
confirmation. Through screen automation the two endpoints sit on opposite sides of a tool
round trip: the keystroke is dispatched by one call and the observation made by another, with
seconds of latency between them that belong to the harness, not the application. The measured
dispatch→commit figure for `fixture-a.md` was 6.070 s, of which a scripted 2 s wait and the round
trip are the overwhelming majority. **That number is not an SC-FT-002 timing and must not be
recorded as one.**

Producing it honestly needs one of:

- a person with a stopwatch on the real binary, or
- an instrumented build that logs the interval internally — note that T024 already built an
  autosave timing harness measuring 100 saves, so the mechanism exists and would need pointing at
  the release build and the explicit-save path.

**Not attempted in this run**, with fixtures already built and waiting:

- The 10 MiB and 50 MiB boundary pairs (`boundary-10mib-exact.md` / `-plus-one.md`,
  `boundary-50mib-exact.md` / `-plus-one.md`, all byte-exact).
- The 40-document limit and the 41st-document refusal.
- Fixture B's timed save.

## Application state on exit

The Autosave switch was returned to `on`, the state it was found in. `fixture-a.md` is left at
165 bytes containing the walkthrough's edits; it is a throwaway fixture outside the repository.
The application was left running.
