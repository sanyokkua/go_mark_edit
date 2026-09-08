# T045 — Fixed parity geometry in the shell/editor region

**Requirement**: FR-FT-045, FR-FT-050, FR-FT-052; CL-15–CL-17.
**Branch**: `feature/v1-implementation--003-t045-editor-region-geometry`.
**Status**: **not complete.** The mapped region's own bounds and computed styles
now match exactly and the in-scope chrome drift is roughly halved, but the
region still contains two areas Feature 003 does not own. See "Structural
finding" below — that part needs a specification decision, not more CSS.

## Measured starting point

Mapped region: `#app.no-assistant .content` versus
`section[aria-label="Editor view"]`, 1280×720, Minimal Light, frozen.

Region bounds and every compared computed-style property already matched:

```
refBox {"x":236.203125,"y":175,"width":1023.59375,"height":545.1875}
actBox {"x":236.203125,"y":175,"width":1023.59375,"height":545.1875}
```

Differing pixels: **121,810** of 559,104.

An earlier probe appeared to show a 334px width difference. That was a probe
error, not production drift: `.assistant{transition:width}` means the
zero-Assistant class must be applied *after* `freezeParityPixels` zeroes
transition durations, or the capture reads a mid-animation width.

## Two binding rules the production Minimal theme was missing

| Binding rule (mockup.html) | Production before | Effect |
|---|---|---|
| `body[data-theme="minimal"] .tgrp{background:none;padding:0}` | kept `padding: 3px` | every toolbar group was 36px tall instead of 30 and every button after the first group drifted right by an accumulating 3–15px |
| `body[data-theme="minimal"] .body{gap:0;padding:0}` | zeroed `.editorView` padding but not `.panes` padding | both panes were offset by `8px 10px`, doubling every line of pane content in the diff |

Two more values were reading from the wrong token:

- `.pane + .pane` divider used `--border`; the binding uses `--stroke`.
- `.paneHeader` bottom border used `--border`; the binding `.pane-h` uses
  `--stroke-soft`.

And the arrangement segment options carried a border and a uniform weight where
the binding `.seg button{border:0}` / `.seg button.active{font-weight:600}`
gives only the selected option semibold.

After the fixes the toolbar aligns to the binding within 0.05px:

```
reference  Format l=500.03  Compact l=570.59  Lint l=655.95
actual     Format l=500.00  Compact l=570.56  Lint l=655.92
```

and the panes are flush:

```
reference  pane t=0 l=0 w=511.3 | pane t=0 l=511.3 w=512.3
actual     pane t=0 l=0 w=511.3 | pane t=0 l=511.3 w=512.3
```

Differing pixels: **121,810 → 104,189**.

## Where the remaining 104,189 pixels are

| Region | Differing pixels | Owner |
|---|---:|---|
| Chrome — tabs, toolbar, pane headers (`y < 127`) | **6,609** | Feature 003 (T045/T073) |
| Editor pane content (`y ≥ 127`, `x < 511`) | 17,481 | Feature 002 — Monaco |
| Preview pane content (`y ≥ 127`, `x ≥ 511`) | 80,099 | deferred rich rendering |

**93.7% of the remaining drift is inside the two pane content areas that this
feature explicitly does not own.**

## Structural finding — needs a specification decision

`spec.md` (Edge Cases) states:

> A binding screenshot includes the obsolete custom titlebar, populated
> workspace, Assistant, provider state, **or rich-rendering result: those
> regions are excluded rather than reproduced.**

and the direct-metrics table states:

> Basic preview … **Deferred rich-rendering widgets are not manufactured for
> parity.**

and the `editor-split` family row states:

> … both pane shells, basic preview typography, and status; **Monaco identity
> and editor-size behavior remain Feature 002-owned.**

The reviewed mapping contradicts all three. `#app.no-assistant .content`
contains the mockup's KaTeX span, image placeholder and inline Mermaid SVG, and
its hand-written `.code` block; the `base` reference variant declares
`excludedRegions: []`. The comment above `SURFACES` already claims no
"deferred rich-rendering surface is included" — the selector does not honour it.

Consequently the four editor-region families — `editor-split`, `editor-only`,
`preview-only`, `toolbar-overflow`, i.e. 72 of the 306 primary cases plus the
tab, label, identity, status and preview state IDs mapped onto them — **cannot
reach zero unexplained pixels without either implementing deferred rich
rendering or reproducing Monaco's raster**, both of which the specification
forbids.

This is outside the approved T075 resolution and cannot be resolved in code
without weakening a protected control. Two source-preserving options:

1. **Narrow the mapped region** to the chrome the feature owns (tabs, toolbar,
   arrangement segment, pane shells and headers, status), and compare the pane
   *content* only through the basic-preview typography metrics the direct
   acceptance table already lists. This matches the spec's "excluded rather than
   reproduced" wording but is a reviewed selector-mapping change.
2. **Extend the Feature 003 reference variant** (the FR-FT-056 mechanism this
   feature already uses for the launcher and File menu) so the reference's
   editor and preview panes carry the same in-scope content the application
   renders, leaving the mockup HTML/CSS and its raw source hash untouched.

Option 2 is the closer analogue of the already-approved File-menu and
zero-Assistant decisions and keeps the whole region compared. Either way the
decision belongs in `spec.md` through the clarification workflow before T035,
T068 or the remaining editor-family slices can close.

## Green checks

- `npm --prefix frontend test -- --runInBand` — 74 suites / 464 tests passed.
- `npm --prefix frontend run typecheck` — clean.
- `just archtest` — `archtest (frontend): ok`.

No mask, tolerance, comparator, coordinate handling, selector mapping, mockup
file, or architecture allowlist was changed by this task.
