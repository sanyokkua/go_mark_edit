# Contract: File/Tab Surfaces and Exact Visual Parity

## Registry ownership

Feature 003 promotes existing registry identities to real typed dispatch only where listed:

- New File, Open File, Open Recent files, Reopen last file;
- Save, Save As, Close Tab, Exit;
- real tab New/activate/close/context actions;
- Autosave setting.

Bindings added or activated:

| Action           | Binding                                                              |
| ---------------- | -------------------------------------------------------------------- |
| New              | `Ctrl/Cmd+N`                                                         |
| Open             | `Ctrl/Cmd+O`                                                         |
| Save             | `Ctrl/Cmd+S`                                                         |
| Save As          | `Ctrl/Cmd+Shift+S`                                                   |
| Close active tab | `Ctrl/Cmd+W`                                                         |
| Next/Previous    | `Ctrl/Cmd+Tab`, `Ctrl+PageDown`; `Ctrl/Cmd+Shift+Tab`, `Ctrl+PageUp` |
| Reopen last file | `Ctrl/Cmd+Shift+Alt/Option+T`                                        |

`Ctrl/Cmd+Shift+T` remains Table. New Window, Open Folder, Export PDF, Format/Compact/Lint document operations,
workspace, file association/drop, renderer expansion, search/tidy/export, packaging and Assistant/provider actions
remain localized unavailable entries with no hidden lifecycle/network state. No competing surface catalogue exists.

Availability is derived from projected backend capability, active/target identity, modal state, tab limits and
command barrier—not merely active-buffer presence. Surfaces dispatch typed actions and render classified outcomes.

## Surface behavior

### File menu

Binding order/grouping and exact popup metrics. Open Recent shows at most six valid paths; recent folders are absent.
Owned commands are real; downstream commands are visibly unavailable. Cancelled native dialogs do not notify.

### Real tabs and tab menu

Projected order, active state, dirty/in-flight/read-only/detached treatment, disambiguation, tooltip, close/New,
contained scrolling and exact tab-menu inventory follow [tab-session.md](tab-session.md).

### Launcher

Only when zero documents: functional New/Open/up-to-six file recents; first-run copy when empty; Open Folder visible
but unavailable; no recent folders; no prior-tab restoration.

### Prompts

- single close: Save, Discard, Cancel;
- multi close/quit: complete dirty-target list, Save all, Discard all, Cancel;
- external change: On disk/Yours, Reload from disk, Keep mine, Skip; read-only = Reload only;
- mixed endings: proposed LF/CRLF normalization and single-use confirm/cancel.

All use one accessible modal shell with initial focus, trapped tab order, Escape/cancel semantics where specified,
focus restoration, long-label tolerance, and reduced motion. Native Open/Save dialogs are behavioral evidence and
outside screenshot crops.

### Identity/status/notifications

Identity shows filename, optional one parent segment, and autosaved/saved/unsaved changes/read-only. Untitled has no
path segment. Status is exactly 28 px, one unwrapped row, 11 px text, 14 px gap, `0 14px` padding; responsive dropped
items remain in an accessible detail surface. Explicit Save reports filename/encoding/ending. Autosave success is
silent. Same file/cause failures update one notification count.

## Exact binding metrics

The HTML/CSS values in `docs/delivery/spec/surface/mockup.html` are direct acceptance values. At minimum the tests
assert:

- 44 px menu row; 13 px triggers; `6px 10px`; 7 px radius;
- monochrome 15×15 local SVGs; 1.75 px round stroke; current-color; no emoji/Unicode substitutes;
- popup ≥250 px, 12 px radius, 6 px outer padding, `7px 10px` rows, 13 px text, 11 px mono accelerators,
  10 px uppercase groups, full-width separators, and ≥8 px viewport inset;
- binding tab/toolbar/arrangement/pane/preview/status values copied in `spec.md` without approximation;
- no binding-label wrap, toolbar/status growth, clipping or page horizontal scroll; only tab strip may scroll;
- Liquid Glass continuous canvas/blur/saturation/highlight, Material filled/pill hierarchy, and Minimal flat/
  separator/underline hierarchy remain structurally distinct.

All other colors, opacity, shadows, strokes, scrollbar/focus/selection states, font stacks and responsive values come
from the corresponding binding CSS block through centralized tokens.

## Finite parity manifest

Exactly these 17 unique primary families:

```text
editor-split, editor-only, preview-only,
menu-file, menu-settings, menu-view, menu-about,
tab-menu, toolbar-overflow, empty,
save-prompt, quit-prompt, reload-prompt, toasts,
settings-appearance, settings-editor, settings-markdown
```

For each family, execute widths 1280, 768, 375 at 720 height across:

```text
glass/light, glass/dark,
material/light, material/dark,
minimal/light, minimal/dark
```

The primary Cartesian product was exactly 17 × 3 × 6 = **306 primary comparisons** (**withdrawn 2026-08-14**; see the note below).

The additional manifest contains exactly **40 named state IDs**. Each has **one assigned family and one assigned
width** (per the spec's exact visual-parity contract) and formerly ran **once in each of the six palettes** for
**240 additional comparisons** (**withdrawn 2026-08-14**; see the note below). A capture MUST NOT satisfy two state IDs merely because both happen to be
visible.

| Assigned family / width | State IDs                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor-split` @ 1280   | `tab-active`, `tab-inactive`, `tab-dirty`, `tab-autosave-in-flight`, `tab-read-only`, `tab-detached`, `tab-blocked-conflict`, `tab-identical-basename`, `tab-adjacent-after-close`, `label-short` |
| `editor-split` @ 375    | `tab-contained-overflow`, `tab-40-document`, `label-long-localized`, `path-hostile-disambiguated`                                                                                                 |
| `editor-only` @ 1280    | `identity-not-saved`, `status-saved`, `status-autosaved`, `status-unsaved-changes`, `status-read-only`, `status-mixed-ending`, `status-large-file`                                                |
| `empty` @ 1280 / @ 375  | `launcher-first-run` (1280), `launcher-six-file` (375)                                                                                                                                            |
| `menu-file` @ 1280      | `control-enabled`, `control-focused`, `control-hovered`, `control-unavailable`                                                                                                                    |
| `menu-settings` @ 1280  | `control-checked`                                                                                                                                                                                 |
| `menu-view` @ 1280      | `control-selected`                                                                                                                                                                                |
| `tab-menu` @ 375        | `tab-menu-move-left-unavailable`, `tab-menu-move-right-unavailable`                                                                                                                               |
| `preview-only` @ 375    | `preview-paused`, `preview-refreshing`, `preview-refresh-failed`                                                                                                                                  |
| `save-prompt` @ 375     | `prompt-normalization`, `resync-recovery`                                                                                                                                                         |
| `reload-prompt` @ 375   | `conflict-content-truncated`, `conflict-metadata-only`, `conflict-read-only`                                                                                                                      |
| `quit-prompt` @ 375     | `quit-discard-newer`                                                                                                                                                                              |

> **Superseded 2026-08-14 — the whole-screen expansion above is withdrawn.**
> The two tables above are retained as the record of what was attempted; they are no longer the contract.
> The binding mockup depicts the product's **final** state while this feature delivers a subset, so a whole
> screen necessarily contains differences no production work can close — the mockup's own sidebar, Assistant
> and provider readout displace every element inside it. Measured across two full runs: **0 of 1,638 passed**,
> and 240 of 510 keys differed in the **position** of the mapped region rather than only its pixels. See
> `spec.md` Clarifications → Session 2026-08-14 and
> `evidence/ft-vs-08/phase-18/t035-run-after-repair.md`.

**The contract is now component-level:**

- **Exactly 14 pixel-compared component keys**, each compared **in its own region**: the closed menubar in all
  six palettes, plus the File, Settings, View and About popups, the 375 Settings overflow, the tab strip, the
  toolbar and the paused preview at their assigned width and palette. Each asserts exact bounds and every
  compared computed style before comparing pixels at zero tolerance with attributed residuals.
- **Exactly 36 behaviour-verified keys** — the six `status-*` states across six palettes — proven against the
  authoritative `data-status-state` attribute and the title bar. They cannot pair as pictures: the binding's
  status row carries a Problems badge, an AI-provider readout and a Reading pill while production carries a
  Document details disclosure, and FR-FT-049 forbids production the provider readout.
- **Every remaining state in the tables above is verified by behaviour assertion**, not by picture. A state with
  no covering assertion fails closed; the audit proving each has one is
  `evidence/ft-vs-08/phase-18/t084-coverage-rescope.md`.
- **The Monaco editor pane interior is a named region exclusion owned by Feature 002.** Its bounds and computed
  styles are still asserted; its raster is not this feature's to match.

A manifest unit test fails on duplicate, missing, extra, or multiply counted keys across the 14 pixel-compared
and 36 behaviour-verified keys. A capture is taken only once the region has stopped changing — three consecutive
identical hashes as a precondition — and the frozen conditions include a caret, which must cover an editor that
draws its own cursor element rather than relying on a native one.

## Reference/application harness

- Serve the unchanged binding mockup and local app concurrently on separate loopback origins.
- Hash the reference HTML/CSS and the versioned Feature 003 reference adapter.
- The adapter may only exclude the OS/custom-frame, workspace, Assistant/provider and deferred rich-rendering
  regions, and may only introduce the explicit file-only launcher/File/reload variants with binding primitives.
- Fix Chromium, DPR 1, 100% zoom, logical crop, loaded local fonts, English fixture plus named long fixture, palette,
  data, focus, scroll, overlay, frozen caret, reduced motion and disabled animations.
- Assert both pages ready before capture. Three unchanged captures must hash identically.
- Map reviewed reference/application selectors and crop only the named webview-owned regions.
- Compare decoded PNG pixels with zero unexplained difference and zero tolerance. Freeze dynamic pixels first.
- A mask is empty by default and, when unavoidable, is the smallest reviewed rectangle; it may not cover geometry,
  text, icon, focus, state, or an entire component/editor pane.

Failure retains reference, actual, diff, metric/bounds JSON, mapping/manifest/adapter hashes, raw log and exit status.
No current app screenshot replaces the binding reference. Missing separately supplied discrepancy screenshots are
recorded as absent rather than manufactured.

## Evidence layers

1. Component/registry/accessibility tests prove roles, labels, order, focus, capability and deterministic deferrals.
2. Exact same-browser parity proves binding result under controlled conditions.
3. Actual-control Playwright journeys prove actions/reachability/responsive behavior through the deterministic mock.
4. Real Wails bridge/native dialogs/filesystem prove bytes, permissions, races and close behavior.
5. Five-minute observation proves zero outbound requests and no deferred behavior.
6. Fresh built current-host walkthrough proves SC-FT-011 and records unverified hosts separately.

No layer substitutes for another. `just check` does not include Playwright or the real build. `just package` is
intentionally excluded.

## Baseline provenance

Every changed screenshot/style baseline names one owning FR-FT requirement and the affected Feature 001/002 baseline.
Unexplained drift, increased tolerance, broad masks, reference replacement, skipped/narrowed cases or mock-only
release claims fail completion. Reference/actual/diff failure evidence is append-only and retained.
