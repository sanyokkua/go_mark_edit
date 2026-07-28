# ADR-0002 — Editor engine: Monaco for v1 (CodeMirror 6 as documented future option)

**Status:** accepted
**Date:** 2026-07-10
**Deciders:** project owner, architect

## Context and problem statement

GoMarkEdit's editor pane shows **Markdown source with syntax highlighting**; the preview pane renders it
(DD-09 — no WYSIWYG). We must choose the code-editor component that backs that pane. The choice affects
bundle size, editing feel, large-file behaviour, keyboard-shortcut wiring, and — importantly — how much
a proven React/Monaco editor approach we can adopt rather than invent. A Monaco-based Markdown
editor/preview is a well-established pattern, and GoMarkEdit's whole premise (a native, offline, cross-platform Markdown editor)
is integration over invention.

The main tension is **bundle size and startup cost vs. proven reuse and capability**. Monaco is large
and heavier to initialise; a native `<textarea>` is tiny but cannot deliver real tokenised
highlighting, a gutter, multi-cursor, or the shortcut surface DD-31 expects. The historical worry about
Monaco with "large files" is real but is mostly a **preview-side** cost in this app (re-rendering
Markdown to HTML on every keystroke), not an editor-side one — Monaco itself handles large text
buffers well. This ADR locks DD-20.

## Decision drivers

- Reuse a proven React/Monaco editor/preview approach (DD-19, DD-20).
- Real Markdown source highlighting, gutter, multi-cursor, find/replace, and a rich keyboard-shortcut
  surface for bold/italic/headings/lists/etc. (DD-31).
- Robust handling of large documents without freezing the UI (DD-20, `03_NonFunctional/02_PERFORMANCE.md`).
- Predictable, well-documented API and long-term maintenance; a large community for edge cases.
- Offline: the engine and its workers must bundle with no runtime network fetches (DD-32).
- Keep the door open to a lighter engine later without rewriting product behaviour.

## Considered options

- **Monaco Editor** — the VS Code editor component; a widely deployed, well-established choice.
- **CodeMirror 6** — modular, lightweight, modern editor toolkit.
- **`<textarea>` + syntax-highlight overlay** — a plain textarea with a highlighted backdrop layer.

## Decision outcome

Chosen: **Monaco for v1**, because it lets us adopt a proven React/Monaco editor/preview approach
near-wholesale (fastest path to a usable M1 editor), is battle-tested, and comfortably handles large text buffers. The
large-file concern is addressed where it actually bites — on the **preview** side — by **debouncing**
live preview and offering a setting to **pause live preview** for very large files (DD-20); the editor
buffer itself is not the bottleneck. **CodeMirror 6 is recorded as a documented future option**: if
Monaco's bundle weight or webview memory footprint proves problematic on lower-end targets, migrating
the editor pane to CodeMirror 6 is a contained change behind the editor component boundary, and this
ADR pre-authorises revisiting it via a superseding ADR rather than an ad-hoc swap.

### Consequences

- Positive: The Phase 01 editor story is integration of a proven approach, not a from-scratch
  build; the preview pipeline (ADR-0003) shares the same toolchain.
- Positive: Rich editing (multi-cursor, gutter, find/replace, robust key bindings) is available out of
  the box, directly serving DD-31's shortcut requirements.
- Positive: Monaco is proven to remain responsive on large buffers; keystroke latency stays an
  editor-local concern, decoupled from preview cost.
- Negative: Monaco is a heavy dependency — significant JS bundle weight and web-worker assets that must
  be bundled for offline use, raising app size and cold-start time relative to lighter options.
- Negative: Monaco's Markdown language support is source-highlight only (as intended here), and its API
  surface is large; deep customisation carries a learning cost.
- Neutral: Live-preview responsiveness is governed by debounce + optional pause settings, not by the
  editor engine — this holds regardless of a future engine swap.
- Neutral: The editor is isolated behind a `CodeEditor` component so a later CodeMirror 6 migration
  need not touch product/store code.

## Pros and cons of the options

### Option A — Monaco Editor

- Good: A proven, working editor approach; extremely mature and widely deployed; excellent
  large-buffer handling; multi-cursor, gutter, find/replace, and a full key-binding system for free;
  strong docs and community.
- Bad: Large bundle and worker payload → bigger app, slower cold start; heavyweight API for a
  source-only Markdown use case; more memory in the webview than a minimal editor.

### Option B — CodeMirror 6

- Good: Modular and tree-shakeable → much smaller bundle; modern, ergonomic extension API; excellent
  performance and mobile/low-end behaviour; first-class incremental parsing.
- Bad: There is **no** equally proven CodeMirror-based Markdown editor approach to adopt — choosing it now
  means building the editing surface and its shortcut wiring from a less-trodden base, delaying M1 for a benefit
  (bundle size) that is not yet a proven problem. Kept as the documented future option instead.

### Option C — `<textarea>` + syntax-highlight overlay

- Good: Tiny footprint; trivial to embed; near-zero startup cost; naturally handles arbitrarily large
  text as plain input.
- Bad: No real tokenised highlighting (only a fragile overlay), no gutter, no multi-cursor, no proper
  find/replace, and a hand-rolled shortcut layer — cannot meet DD-09's highlighted-source or DD-31's
  shortcut expectations without effectively reimplementing an editor. Overlay/scroll sync is brittle.

## Links

- Design decisions: DD-20 (Monaco for v1; debounced preview; optional pause; CodeMirror 6 as future
  option). Related: DD-09 (highlighted source, no WYSIWYG), DD-19 (shared render pipeline),
  DD-31 (keyboard shortcuts).
- Spec clauses: `00_Foundation/04_DESIGN_DECISIONS.md#4-markdown-behaviour`,
  `01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `02_Architecture/03_FRONTEND_REACT.md`,
  `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md`, `03_NonFunctional/02_PERFORMANCE.md`,
  `05_Dependencies/02_FRONTEND_DEPENDENCIES.md`.
- Stories: Phase 01 editor/preview stories (Monaco source editor, live preview, split view) and the
  Phase 05 large-file preview-pause story, per `07_Phases/00_ROADMAP.md` (authored per phase; none
  `done` at ADR time).
