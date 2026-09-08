# ADR-0015 — Adopt go_text-style CI/CD: tag-driven versioning, derived icons, isolated builds

**Status:** accepted
**Date:** 2026-07-17
**Deciders:** project owner, architect
**Supersedes:** (none)

> **Historical vocabulary — this record is not rewritten.** The `DD-…` and `EC-…` identifiers below cite the retired 78-entry design-decision registry, last present in git at `e1bd33f` under `specification/00_Foundation/` as `04_DESIGN_DECISIONS.md`; every one of those decisions now lives in the sentence of the feature file that needs it. Links into `_archive-2026-07-28-specification/` are the pre-conversion specification, kept so a citation still resolves, and **not normative**. See `README.md`. A decision record says what was decided against what was known then, so neither is translated forward.

## Context and problem statement

The spec had a CI gate set and packaging metadata (Phase 12, `../../_archive-2026-07-28-specification/04_Build_and_Release/03_CI_AND_HOOKS.md`)
but no end-to-end **release pipeline**: nothing defined how a version gets into the binary, how the
GitHub release is produced per OS, how the app icon is derived for all platforms, or the guarantee that
CI/dev builds never touch a user's production database. The owner asked to mirror the proven pipeline of
a sibling Wails2+React app (referred to here as "the reference pipeline") and to adopt the provided
"MD>GO" glass-tile artwork as the app icon. This ADR introduces **DD-65 / DD-66 / DD-67** and **Phase
15**, plus the new spec doc ../../_archive-2026-07-28-specification/04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md`.

## Decision drivers

- One authoritative version source; no hand-maintained version constants.
- Reproducible, per-OS native builds (webview toolchains differ per OS) with a single shared version.
- All-platform icons derived from one source asset (no hand-forked variants that drift).
- CI and dev runs must be provably isolated from production user data (extends the existing `-Dev`
  folder isolation, `../../_archive-2026-07-28-specification/04_Build_and_Release/01_BUILD_MATRIX.md#7-dev-vs-prod-isdev-folder-isolation`).
- Keep v1 constraints: unsigned artifacts (DD-34), no telemetry, CGO-free cross-platform builds.

## Considered options

- **A — Reference three-job pipeline (chosen):** `determine-version` (tag `v*.*.*` or manual dispatch)
  → per-OS `build` matrix + full `test` gate job → `create-release`. Version injected via
  `-ldflags -X internal/settings.AppVersion` + `jq`-patched `wails.json`; icon processed from one
  source into `build/appicon.png`, per-OS icons derived at build/packaging time.
- **B — Version file in repo** (VERSION/`package.json` bumped by hand or bot), CI reads it.
- **C — Separate workflows per OS / release drafter tooling** (goreleaser or per-OS YAML files).

## Decision outcome

Chosen: **Option A**, mirroring the reference pipeline structurally (triggers, version job with shared
outputs, per-OS matrix incl. Ubuntu 24.04 + `webkit2_41`, wails.json patch step, macOS `.app` re-zip
with `-X` to preserve the execute bit, versioned asset names + `SHA256SUMS.txt`, auto-prerelease on a
`-suffix`, manual dispatch with an optional `create_release` flag). Option B reintroduces a second
version source that can drift from tags; Option C adds tooling surface for no v1 benefit. The icon
follows the same one-source philosophy: `specification/assets/icon/appicon-source.png` → deterministic
`process_icon.py` (crop tile, remove dark backdrop to transparency, 1024×1024) → `build/appicon.png` →
Wails/packaging-derived `.icns`/`.ico`/association icons.

### Consequences

- Positive: releases are one `git tag` push; version provenance is unambiguous (`dev` everywhere else).
- Positive: icon derivations can be regenerated at any time from the canonical source; no drift.
- Positive: DD-67 makes the production-data isolation an explicit, testable release-gate property.
- Negative: a new phase (15) and workflow YAML to build and maintain; macOS zip/permissions handling is
  fiddly (mitigated by copying the reference re-zip steps verbatim).
- Neutral: artifacts remain unsigned (DD-34) — the release notes must carry the unsigned-install caveats.

## Pros and cons of the options

### Option A — Reference three-job pipeline
- Good: proven on the same stack; version computed once and shared; full gate job blocks bad releases.
- Bad: single YAML grows large; matrix debugging is per-OS.

### Option B — Version file in repo
- Good: version visible in the tree.
- Bad: two sources of truth (file vs tag); requires bump automation; drift risk — rejected.

### Option C — goreleaser / split workflows
- Good: rich packaging ecosystem.
- Bad: goreleaser's Wails/webview support is indirect; more tooling to learn; unnecessary for 3 targets.

## Links

- Design decisions: DD-07, DD-25, DD-34, DD-65, DD-66, DD-67
- Spec clauses: ../../_archive-2026-07-28-specification/04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md`,
  ../../_archive-2026-07-28-specification/04_Build_and_Release/01_BUILD_MATRIX.md#7-dev-vs-prod-isdev-folder-isolation`,
  ../../_archive-2026-07-28-specification/04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#2-app-icon-requirements`,
  ../../_archive-2026-07-28-specification/04_Build_and_Release/03_CI_AND_HOOKS.md#4-ci-gate-set`,
  ../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#15-versioning-app-icon--cicd`
- Stories: STORY-103..107 (Phase 15)
