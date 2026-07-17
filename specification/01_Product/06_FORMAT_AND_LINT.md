**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/03_FILES_TABS_WORKSPACE.md`, `01_Product/11_SETTINGS.md`, `01_Product/12_KEYBOARD_SHORTCUTS.md`, `mockups/gomarkedit-mockup.html`

# Format & Lint

Document tidying (Format, Compact) and consistency checking (Lint). Both are frontend operations
(Prettier / remark-stringify / remark-lint, DD-16, DD-17). Refines
`01_FUNCTIONAL_REQUIREMENTS.md#fr-format-lint`.

## Table of Contents

1. [Format](#format)
2. [Compact](#compact)
3. [Lint](#lint)
4. [Lint rules](#lint-rules)
5. [On-save](#on-save)
6. [Canonical style](#canonical-style)
7. [Problems surface](#problems-surface)
8. [Edge cases](#edge-cases)

## Format

**Format** pretty-prints the current document: pads table columns, normalizes list markers and
emphasis to the canonical style, applies consistent heading style, and normalizes wrapping (DD-16). It
runs via the frontend formatter (Prettier / remark-stringify) in `logic/format` (`format.ts`).
Triggered by the toolbar "⌁ Format" button or `Alt+Shift+F`. Format mutates the buffer as a single
undo step and marks the document dirty. If the content cannot be parsed, Format is a no-op with a
notice (EC-FMT-1). A very large document formats as a gated long op with a busy indicator (EC-FMT-4).

## Compact

**Compact** is a **conservative** whitespace tightening — not aggressive minification — because
Markdown whitespace can be semantically meaningful (DD-16). It collapses redundant blank lines and
trailing whitespace but must **never** alter significant whitespace inside fenced or indented code
blocks, nor change the document's rendered meaning (EC-FMT-3). Like Format, it is a single undo step
and sets dirty.

## Lint

**Lint** runs `remark-lint` (in `logic/lint`, `lint.ts`) to check **consistency** — list-marker
style, emphasis style, heading style, and related rules (DD-17). It runs on demand (toolbar "✓ Lint"
or `Alt+Shift+L`) and, optionally, on save. Findings are mapped to editor markers (squiggles) and a
status-bar count. Lint never modifies the document; it only reports.

## Lint rules

The canonical rule set enforces GoMarkEdit's house style. Defaults align with the canonical style below.

| Rule (remark-lint) | Enforces | Default |
|---|---|---|
| `unordered-list-marker-style` | Consistent bullet marker | `-` |
| `emphasis-marker` | Consistent emphasis marker | `_` |
| `strong-marker` | Consistent strong marker | `*` (i.e. `**bold**`) |
| `heading-style` | ATX vs Setext | `atx` (`#`) |
| `list-item-indent` | Consistent list indentation | consistent |
| `no-multiple-toplevel-headings` | Single H1 per document | warn |
| `no-trailing-spaces` | No trailing whitespace | error |
| `no-consecutive-blank-lines` | Collapse blank runs | warn |
| `fenced-code-flag` | Code fences declare a language | warn |
| `final-newline` | File ends with a newline | error |

Rules are configuration, not code; adjusting the set is a settings/config change, not a rendering
change. Findings above/below thresholds still surface as markers.

## On-save

Format and Lint can run automatically on save via two independent settings — **Format on save** and
**Lint on save** (DD-18). When both are enabled, **Format runs before Lint** so linting sees the
formatted text (EC-LINT-3). On-save formatting is a single undo step and preserves cursor/selection
where possible (EC-FMT-2). Both settings are exposed in the Settings menu (quick toggles) and the
Settings dialog Markdown group; defaults: Format on save **off**, Lint on save **on**
(`11_SETTINGS.md#defaults`). On-save actions integrate with autosave (`03_FILES_TABS_WORKSPACE.md#autosave`).

## Canonical style

Enforced canonical defaults (DD-18), used by both Format and Lint:

- **Bullet marker:** `-`
- **Emphasis:** `_` (underscore for italics)
- **Headings:** ATX (`#`)

These are user-overridable in the Settings dialog Markdown group (bullet `-`/`*`/`+`, emphasis
`_ _`/`* *`, heading ATX/Setext per the mockup) but ship at the canonical values.

## Problems surface

Lint findings appear in two coordinated places: **inline squiggles** on the offending ranges in the
editor (with a hover message, e.g. `lint: use "-" for bullets` as in the mockup), and a **status-bar
count** with a warning glyph (`⚠ 1`). A clean document shows zero count and no squiggles (EC-LINT-2).
Many findings produce an accurate count with capped/virtualised markers to protect performance
(EC-LINT-1). When Lint is disabled, no squiggles show and the status indicator is hidden (EC-LINT-4).

## Edge cases

- **EC-FMT-1** — Unparseable content → Format is a no-op with a notice.
- **EC-FMT-2** — Format-on-save is one undo step, preserves cursor.
- **EC-FMT-3** — Compact never alters significant whitespace (code blocks).
- **EC-FMT-4** — Large-file format runs as a gated long op with busy indicator.
- **EC-LINT-1** — Many findings → accurate count, capped markers.
- **EC-LINT-2** — Clean document → zero count, no squiggles.
- **EC-LINT-3** — Format-on-save runs before Lint-on-save.
- **EC-LINT-4** — Lint disabled → no squiggles, indicator hidden.
