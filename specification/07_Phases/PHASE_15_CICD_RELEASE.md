**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-17
**Cross-references:** `00_ROADMAP.md`, `PHASE_10_I18N_PACKAGING.md`, `../04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md`, `../04_Build_and_Release/01_BUILD_MATRIX.md`, `../04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md`, `../04_Build_and_Release/03_CI_AND_HOOKS.md`, `../assets/icon/README.md`, `../00_Foundation/04_DESIGN_DECISIONS.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`, `../../docs/adr/0015-cicd-versioning-icon.md`

# Phase 15 — CI/CD & Release Finalization

## Goal

Finish the release train: one tag push produces versioned, checksummed, per-OS release assets. This
phase implements **version injection** (the `internal/settings.AppVersion` variable, ldflags + the
`wails.json` patch, About/startup-log display), the **icon pipeline** (canonical source →
`process_icon.py` → `build/appicon.png` → all per-OS derivations), and the **tag-triggered release
workflow** (determine-version → build matrix + full test gate → create-release), with the CI/dev
production-data isolation guarantee made a testable release-gate property.
Refines: `../04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#1-version-injection`,
`../04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#2-app-icon-pipeline`,
`../04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#3-release-workflow`,
`../04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#4-cidev-isolation-from-production-data`
(DD-65, DD-66, DD-67; ADR-0015).

## Depends on

- Phase 10 (`PHASE_10_I18N_PACKAGING.md`) — this phase **consumes** Phase 10's PR-verify CI gates
  (STORY-066/067/068), packaging metadata and installers (STORY-065), and artifact production +
  unsigned-caveat documentation (STORY-069). Phase 15 turns those pieces into the tag-triggered
  release pipeline; it does not re-own them.

## Scope

- `internal/settings.AppVersion` (`"dev"` default) + ldflags plumb; version shown in the About
  dialog and logged once at startup (DD-65).
- The `wails.json` jq patch (`.version`, `.info.productVersion`) so `Info.plist` / Windows
  `info.json` placeholders carry the release version.
- The icon pipeline: run `process_icon.py` on `assets/icon/appicon-source.png`, commit
  `build/appicon.png`, wire the per-OS icon derivations (`.icns`/`.ico`/Linux PNG set) and the
  document/file-association icons from that single derivation point (DD-66).
- The release workflow YAML: `determine-version` (tag `v*.*.*` / `workflow_dispatch` with
  `version` + `create_release` inputs), the per-OS `build` matrix, the full headless `test` gate
  job (incl. bindings/sqlc drift), and `create-release` (macOS `.app` re-zip with `-X`, versioned
  asset names, `SHA256SUMS.txt`, auto pre-release on a `-suffix`, release notes with the DD-34
  unsigned-install caveats).
- The DD-67 release-gate assertion that no CI/dev run touches a production `GoMarkEdit` folder.

## Out of scope

- Code signing / notarization / auto-update (DD-34 — unchanged by this phase).
- The PR-verify CI gate set, git hooks, packaging metadata, and installer mechanics — owned by
  Phase 10 (`PHASE_10_I18N_PACKAGING.md`); this phase only orchestrates them from the release
  workflow.
- Changing the icon artwork itself — the source asset is fixed by DD-66; only its processing and
  derivations are in scope.

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-103 | Add the AppVersion variable with ldflags injection and surface it in About and the startup log | S | `internal/settings/`, `ui/widgets/`, `internal/application/` | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#1-version-injection`, `04_Build_and_Release/01_BUILD_MATRIX.md#6-wails-build-flags`, `00_Foundation/04_DESIGN_DECISIONS.md#15-versioning-app-icon--cicd` | STORY-057 |
| STORY-104 | Produce build/appicon.png via the icon pipeline and wire all per-OS and association icon derivations | S | `internal/application/` | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#2-app-icon-pipeline`, `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#2-app-icon-requirements`, `00_Foundation/04_DESIGN_DECISIONS.md#15-versioning-app-icon--cicd` | STORY-065 |
| STORY-105 | Add the release workflow with determine-version, the per-OS build matrix, the wails.json patch, and artifact upload | M | `internal/application/` | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#3-release-workflow`, `04_Build_and_Release/01_BUILD_MATRIX.md#2-artifact-matrix`, `04_Build_and_Release/03_CI_AND_HOOKS.md#5-github-actions-build--release-matrix` | STORY-066, STORY-103, STORY-104 |
| STORY-106 | Wire the full test-gate job into the release workflow with the bindings and sqlc drift checks | S | `internal/application/` | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#3-release-workflow`, `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#4-cidev-isolation-from-production-data`, `04_Build_and_Release/03_CI_AND_HOOKS.md#4-ci-gate-set`, `04_Build_and_Release/03_CI_AND_HOOKS.md#3-ordering-why-frontend-builds-before-go` | STORY-066, STORY-105 |
| STORY-107 | Add the create-release job with the macOS re-zip, versioned asset names, SHA256SUMS, and pre-release detection | M | `internal/application/` | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#3-release-workflow`, `04_Build_and_Release/01_BUILD_MATRIX.md#2-artifact-matrix`, `04_Build_and_Release/01_BUILD_MATRIX.md#8-signing-notarization-and-install-caveats`, `00_Foundation/04_DESIGN_DECISIONS.md#10-non-functional--operations` | STORY-105, STORY-106, STORY-069 |

## Edge cases

Enumerated in `../04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#5-edge-cases-rel`:

- **EC-REL-1** — Tag pushed but a test/build gate fails → `create-release` never runs; no release
  is published (STORY-105/106/107).
- **EC-REL-2** — Manual dispatch with `create_release=false` → artifacts only (build-only mode),
  no GitHub release (STORY-105/107).
- **EC-REL-3** — Version with a `-suffix` → the release is auto-marked pre-release (STORY-107).
- **EC-REL-4** — macOS `.app` zipped without `-X` / without permission reassembly loses the
  execute bit → the re-zip contract test verifies the unzipped app is executable (STORY-107).
- **EC-REL-5** — Missing `appicon-source.png` or a violated output contract → `process_icon.py`
  fails fast; the pipeline stops (STORY-104).
- **EC-REL-6** — The `wails.json` patch is skipped → `Info.plist`/`info.json` show a stale version;
  the release-verification check fails the release on binary-vs-metadata mismatch (STORY-105).

## Phase exit checklist

Automated:

- [ ] A build without ldflags injection reports `AppVersion == "dev"`; an injected build reports
      the exact tag version in About and the startup log line (DD-65).
- [ ] `process_icon.py` output satisfies its asserted contract (1024×1024, RGBA, transparent
      corners), and a missing source fails fast (EC-REL-5).
- [ ] A dispatch run with `create_release=false` uploads all matrix artifacts and publishes no
      release (EC-REL-2); a failing gate on a tag push publishes no release (EC-REL-1).
- [ ] The produced macOS zip unpacks to a launchable `.app` (execute bit preserved — EC-REL-4);
      `SHA256SUMS.txt` matches every renamed asset.
- [ ] A `-suffix` version yields `prerelease: true` (EC-REL-3); binary version and
      `Info.plist`/`info.json` version agree (EC-REL-6).
- [ ] The DD-67 isolation assertion passes: CI/dev-resolved config roots are temp or `-Dev` paths,
      never a production `GoMarkEdit` folder.
- [ ] `just check` and `just trace-check` green with zero orphans across the whole backlog.

Manual:

- [ ] Pushing a `vX.Y.Z` tag on a green branch produces a GitHub release with versioned assets for
      all four matrix targets plus `SHA256SUMS.txt`.
- [ ] Each downloaded artifact installs/launches on its OS, shows the tag version in About, and
      carries the derived icon (app + associated documents).
- [ ] The generated release notes include the DD-34 unsigned-install caveats.

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Cross-cutting like Phase 10 —
it belongs to no single stage and completes the **v1 release train**: v1 ships via this phase's
tag-triggered pipeline.
