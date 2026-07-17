**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_ROADMAP.md`, `../01_Product/06_FORMAT_AND_LINT.md`, `../02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 05 — Format & Lint

## Goal

Keep Markdown tidy without leaving the app: **Format** (pretty-print — pad tables, normalise markers,
wrap), **Compact** (conservative whitespace tightening that never touches semantically-significant
whitespace), and **Lint** for consistency (remark-lint) surfaced as editor squiggles plus a status-bar
problems count. All run on demand and, optionally, on save, with canonical style defaults (bullet `-`,
emphasis `_`, ATX headings `#`).
Refines: `../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-format-lint`.

## Depends on

- Phase 04 (rendering pipeline, standard selector) — format/lint operate against the same source model.

## Scope

- `logic/format` — Format + Compact via Prettier / remark-stringify with canonical defaults.
- `logic/lint` — remark-lint runner + rule config; map findings to Monaco markers.
- Editor squiggles + status-bar problems count.
- On-demand triggers (toolbar/shortcut) + on-save triggers (settings: Format on save, Lint on save; format before lint).
- Gated long-op path for formatting very large files — busy indicator via `internal/gate`, the same
  single-slot semaphore PDF export acquires in Phase 06
  (`../02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#gate`).

## Out of scope

- The keyboard-shortcut registry chrome — Phase 08 (this phase exposes the actions; shortcut binding UI is Phase 08).
- PDF export — Phase 06.

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-035 | Implement Format (pretty-print) with canonical style defaults via Prettier/remark-stringify | M | `logic/format/`, `ui/components/` | `01_Product/06_FORMAT_AND_LINT.md#format`, `01_Product/06_FORMAT_AND_LINT.md#canonical-style`, `00_Foundation/04_DESIGN_DECISIONS.md#5-formatting-linting--standards`, `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#gate` | STORY-011 |
| STORY-036 | Implement Compact whitespace-tightening that preserves semantically-significant whitespace | M | `logic/format/`, `ui/components/` | `01_Product/06_FORMAT_AND_LINT.md#compact`, `01_Product/06_FORMAT_AND_LINT.md#canonical-style` | STORY-035 |
| STORY-037 | Implement the remark-lint runner and consistency rule config | M | `logic/lint/`, `logic/store/` | `01_Product/06_FORMAT_AND_LINT.md#lint`, `01_Product/06_FORMAT_AND_LINT.md#lint-rules` | STORY-011 |
| STORY-038 | Map lint findings to Monaco editor markers (squiggles) | M | `logic/lint/`, `ui/components/` | `01_Product/06_FORMAT_AND_LINT.md#lint`, `01_Product/06_FORMAT_AND_LINT.md#problems-surface` | STORY-037 |
| STORY-039 | Wire Format/Lint on-demand and on-save with format-before-lint ordering | M | `logic/hooks/`, `logic/store/`, `internal/settings/` | `01_Product/06_FORMAT_AND_LINT.md#on-save`, `01_Product/11_SETTINGS.md#editor-group` | STORY-035 |
| STORY-040 | Show a problems count in the status bar reflecting lint findings | S | `ui/components/`, `logic/store/` | `01_Product/06_FORMAT_AND_LINT.md#problems-surface` | STORY-038 |

## Edge cases

- **EC-FMT-1** — Unparseable content → no-op with a notice, buffer unchanged (STORY-035).
- **EC-FMT-2** — Format-on-save is a single undo step, preserves cursor/selection (STORY-039).
- **EC-FMT-3** — Compact must not alter fenced/indented code whitespace (STORY-036).
- **EC-FMT-4** — Formatting a very large file runs as a gated long op with a busy indicator (STORY-035/039).
- **EC-LINT-1** — Many findings → accurate count, capped/virtualised markers (STORY-038/040).
- **EC-LINT-2** — Clean document → zero count, no squiggles (STORY-037/040).
- **EC-LINT-3** — Format-on-save + Lint-on-save → format runs before lint (STORY-039).
- **EC-LINT-4** — Lint disabled → no squiggles, indicator hidden (STORY-039/040).

## Phase exit checklist

Automated:

- [ ] Format normalises a messy table/markers to the canonical style (unit test).
- [ ] Compact leaves fenced and indented code whitespace byte-identical (EC-FMT-3).
- [ ] A document with N lint findings shows count N and N markers; a clean document shows zero (EC-LINT-1/2).
- [ ] On-save with both enabled runs format then lint (order asserted, EC-LINT-3).
- [ ] Unparseable input is a no-op with a notice (EC-FMT-1).
- [ ] `just check` green.

Manual:

- [ ] In `wails dev`: Format button pads tables and normalises markers; problems count updates live.
- [ ] Format-on-save is undoable in one step.

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Contributes to Milestone **M2**.
