# ADR-0013 — Persist window & UI-layout state with write-through, last-writer-wins

**Status:** accepted
**Date:** 2026-07-15
**Deciders:** project owner, architect
**Supersedes:** (none)

## Context and problem statement

DD-10 originally persisted only the native window size and the per-document view mode. The product
owner asked that the **application-level UI layout** also be remembered between sessions and windows —
which sidebars are open, the Editor/Split/Preview arrangement, pane visibility, and (once the assistant exists) the
assistant sidebar — so a returning user, and every newly opened window, starts in the layout they last
left. Because GoMarkEdit runs **multiple windows/instances with no single-instance lock** (DD-08,
ADR-0006), two windows can change layout independently, which raises the question of *which* window's
state is authoritative. This ADR records the persistence model and the multi-window conflict rule, and
introduces **DD-60** and **DD-61**.

## Decision drivers

- Returning users expect their chrome (sidebars, arrangement, window size) to be where they left it.
- Multiple windows share one settings DB; the result must be predictable and never lose a recent change.
- Must not violate DD-11 (app opens clean — no session/tab/content restore) or add a schema migration.
- Reuse the existing settings KV store and the multi-process WAL configuration (DD-10, DD-13).
- Keep the rule simple enough to test deterministically.

## Considered options

- **A — Write-through on every change; last-writer-wins by change time.** Each layout mutation is
  persisted immediately; a closing window only flushes its own pending debounced write.
- **B — Save the whole layout once, on window close.** The last window to close writes its state.
- **C — Per-window identity.** Remember a distinct layout per window handle/monitor.

## Decision outcome

Chosen: **Option A**, because it makes the stored value always reflect the window that **most recently
changed** a setting, which matches user intuition and cannot be clobbered by an unrelated window closing
later. Discrete toggles persist immediately; the only debounced value is the continuous window resize,
which is flushed on close so the final size is never lost. State is application-level (shared across
windows), stored under `window.*`/`ui.*` keys in the existing KV table (no migration), and restored
before a window is shown, falling back to defaults on a missing/invalid value.

### Consequences

- Positive: predictable multi-window behaviour; no lost recent change; no migration; trivially testable.
- Positive: DD-11 preserved — only chrome layout is restored, never document content or a session/tab set.
- Negative: slightly more frequent small writes (bounded — layout toggles are infrequent, resize is debounced).
- Neutral: all windows share one layout; per-window/per-monitor layouts are explicitly out of scope for v1.

## Pros and cons of the options

### Option A — Write-through, last-writer-by-change
- Good: authoritative value is the most recent *change*; close order is irrelevant; deterministic.
- Bad: many tiny writes (mitigated by debouncing the only high-frequency source, resize).

### Option B — Save on close (last-closer-wins)
- Good: fewest writes.
- Bad: a window that changed nothing can overwrite another window's recent change purely by closing later
  — the exact behaviour the owner rejected.

### Option C — Per-window identity
- Good: richest fidelity across monitors/windows.
- Bad: no stable window identity across launches; complex; out of scope for a single-user v1 editor.

## Links

- Design decisions: DD-10, DD-11, DD-13, DD-27, DD-60, DD-61
- Spec clauses: `specification/02_Architecture/05_STATE_AND_PERSISTENCE.md#window-state`,
  `specification/01_Product/11_SETTINGS.md#persistence`,
  `specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state`,
  `specification/00_Foundation/04_DESIGN_DECISIONS.md#13-window--ui-layout-state`
- Stories: STORY-098
