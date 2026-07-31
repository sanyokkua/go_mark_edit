# Contract: Progressive Delivery Stages

## Stage semantics

Viewer, Editor, Assistant actions, and Assistant chat are cumulative product stages. A later stage
contains and preserves all earlier behavior. A stage name is not a completion claim; its independent
journey and owned functional requirements must be proven on current code.

## Viewer exit contract

The real distributable launches into the specified shell, opens supported local documents through all
required flows, enforces size and binary boundaries, renders the selected Markdown level safely, shows
reading mode and all six palettes, handles local/approved remote assets, supports multiple independent
windows, and makes no unsolicited request. FR-001 through FR-028 and all affected cross-cutting rules
have named evidence.

## Editor entry and exit contract

Entry requires real document identity, tabs, file access, rendering, settings, and action registry.
Exit adds immediate source editing, per-document working copies, formatting, safe save/autosave,
external-change recovery, additive workspace work, navigation, lint/format operations, and PDF export.
FR-029 through FR-052 are proven without Assistant use.

## Assistant actions entry and exit contract

Entry requires acknowledged document snapshots, scoped one-step edits, stale revision checks, safe disk
separation, and a proven shared operation gate. Exit adds provider drafts/tests, offline prompt/context
inspection, four data-driven action families, cancellation and classified failures, and one reviewable
proposal that changes no file until separate Save. FR-053 through FR-067 are proven.

## Assistant chat entry and exit contract

Entry requires the provider, context, proposal, timeout, cancellation, stale-apply, and workspace
allowlist paths already proven. Exit adds per-document session transcripts, custom prompts, exactly five
validated capabilities, deterministic loop limits, and no persistence. FR-068 through FR-077 are
proven.

## Slice authorization contract

A future `/speckit-tasks` run must identify one stage and one dependency-complete capability group. It
must not generate tasks for later groups. Each task must produce user-observable behavior or necessary
production-path support for that same slice, map complete owned requirements, name tests/live cases,
and declare concrete paths. Documentation-only validation work is not a product slice.

The 2026-07-30 foundation and appearance batch is delivered and verified. The authorized next task
batch is the dependency-complete native window shell described by `window-launcher-shell.md`: window
chrome and controls, exact resize/minimum behavior, durable acknowledged layout, notification repair,
delivered-settings shell, keyboard/focus, and responsive/palette evidence.

Complete launcher activation is the entry gate to the following safe file lifecycle batch. It must not
ship with enabled no-op New/Open controls or fake recents. File opening, tabs, decoding, size limits,
workspace enumeration, rendering, OS-open, and packaging remain downstream.

The token contract remains resolved: Markdown theme rules use bundled `.md` postfixes and embedded Go
rules use `.go`, including qualified descendants. A non-zero gate with explicit findings may be
baselined; a gate that analyzed nothing remains a hard stop.
