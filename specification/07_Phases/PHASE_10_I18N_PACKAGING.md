**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_ROADMAP.md`, `../01_Product/13_I18N.md`, `../04_Build_and_Release/01_BUILD_MATRIX.md`, `../04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md`, `../04_Build_and_Release/03_CI_AND_HOOKS.md`, `../03_NonFunctional/02_PERFORMANCE.md`, `../03_NonFunctional/03_SECURITY_AND_PRIVACY.md`, `../03_NonFunctional/04_OFFLINE.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 10 — i18n, Packaging & Release

## Goal

Ship it: route every user-facing string through a lightweight i18n layer with an `en` bundle (adding a
locale requires only a new resource file), package per-OS installers (NSIS / nfpm) carrying the file
associations and icon, run the full CI build matrix with git hooks and `verify:ui`, and produce release
artifacts. Per the stage model (`00_Foundation/06_IMPLEMENTATION_STAGES.md`) this phase is **cross-cutting** — it finalizes i18n and packaging/release for each stage as it ships. It does not itself deliver the assistant: Milestone **M3** completes in Phase 14.
Refines: `../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-i18n`.

## Depends on

- Phases 00–09 (all user-facing surfaces exist to be localized and packaged).

## Scope

- `i18n/` layer + `locales/en.json`; `t()` with English fallback for missing keys.
- Route all existing UI strings through `t()`.
- NSIS (Windows) + nfpm (Linux) packaging carrying `.md/.markdown/.mdown/.txt` associations + icon.
- CI build matrix (Windows/macOS/Linux) + git hooks + `verify:ui` harness.
- Release artifacts (unsigned; document install caveats — no notarization/auto-update in v1).
- Release-verification gates: offline/no-network and no-telemetry/local-logs checks, startup budget, and
  Monaco bundle-size budget (`../03_NonFunctional/04_OFFLINE.md#5-verification-approach`,
  `../03_NonFunctional/03_SECURITY_AND_PRIVACY.md#5-no-telemetry`,
  `../03_NonFunctional/03_SECURITY_AND_PRIVACY.md#6-local-logs-only`,
  `../03_NonFunctional/02_PERFORMANCE.md#1-startup-budget`,
  `../03_NonFunctional/02_PERFORMANCE.md#5-bundle-size-monaco`).

## Out of scope

- Code signing / notarization / auto-update (explicitly excluded, DD-34).
- Additional shipped locales beyond `en` (mechanism only, DD-35).
- The tag-triggered release pipeline, version injection, and icon derivation — Phase 15
  (`PHASE_15_CICD_RELEASE.md`, `../04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md`, DD-65..67).

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-063 | Add the i18n layer and the en resource bundle with English fallback for missing keys | M | `i18n/`, `logic/utils/` | `01_Product/13_I18N.md#i18n-layer`, `01_Product/13_I18N.md#string-catalog`, `01_Product/13_I18N.md#adding-a-locale`, `00_Foundation/04_DESIGN_DECISIONS.md#10-non-functional--operations` | STORY-006 |
| STORY-064 | Route all user-facing strings through t() with no hard-coded UI literals | M | `ui/widgets/`, `ui/components/`, `i18n/` | `01_Product/13_I18N.md#string-catalog`, `01_Product/13_I18N.md#formatting` | STORY-063 |
| STORY-065 | Package the Windows (NSIS) and Linux (nfpm) installers and the macOS app bundle carrying the file associations and icon | M | `internal/application/`, `internal/fileassoc/` | `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#1-declaration-source-wailsjson-fileassociations`, `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#2-app-icon-requirements`, `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#3-macos-cfbundledocumenttypes--infoplist`, `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#4-windows-nsis-installer--progid`, `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#5-linux-desktop--mime--nfpm`, `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#6-extension-set-consistency`, `01_Product/08_FILE_ASSOCIATIONS.md#declared-extensions` | STORY-046 |
| STORY-066 | Add the CI build matrix across Windows/macOS/Linux with the full gate set | M | `internal/application/` | `04_Build_and_Release/01_BUILD_MATRIX.md#1-supported-os-baseline`, `04_Build_and_Release/01_BUILD_MATRIX.md#2-artifact-matrix`, `04_Build_and_Release/01_BUILD_MATRIX.md#3-per-os-build-prerequisites`, `04_Build_and_Release/01_BUILD_MATRIX.md#6-wails-build-flags`, `04_Build_and_Release/03_CI_AND_HOOKS.md#4-ci-gate-set`, `04_Build_and_Release/03_CI_AND_HOOKS.md#5-github-actions-build--release-matrix`, `03_NonFunctional/04_OFFLINE.md#5-verification-approach`, `03_NonFunctional/02_PERFORMANCE.md#5-bundle-size-monaco` | STORY-007 |
| STORY-067 | Wire the git hooks mirroring CI gates locally | S | `internal/application/` | `04_Build_and_Release/03_CI_AND_HOOKS.md#2-git-hooks-lefthook`, `04_Build_and_Release/03_CI_AND_HOOKS.md#6-traceability-gate` | STORY-066 |
| STORY-068 | Add the verify:ui Playwright harness across routes × widths × themes | M | `ui/widgets/`, `dev/bridge-mock/` | `04_Build_and_Release/03_CI_AND_HOOKS.md#4-ci-gate-set`, `01_Product/10_THEMING.md#token-model` | STORY-051 |
| STORY-069 | Produce the release artifacts and document the unsigned-install caveats | S | `internal/application/` | `04_Build_and_Release/01_BUILD_MATRIX.md#2-artifact-matrix`, `04_Build_and_Release/01_BUILD_MATRIX.md#8-signing-notarization-and-install-caveats`, `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#5-no-telemetry`, `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#6-local-logs-only`, `03_NonFunctional/02_PERFORMANCE.md#1-startup-budget`, `00_Foundation/04_DESIGN_DECISIONS.md#10-non-functional--operations` | STORY-065 |

> Ownership note: STORY-066 covers the **PR-verify** CI build matrix and gate set, and STORY-069
> covers **artifact production** and the unsigned-caveat documentation. The **tag-triggered release
> workflow** — version injection, icon derivation, `determine-version`/`create-release` jobs,
> versioned assets, `SHA256SUMS.txt` — is owned by Phase 15
> (`PHASE_15_CICD_RELEASE.md`, STORY-103..107, DD-65..67).

## Edge cases

- **EC-I18N-1** — Missing translation key → fall back to English (or the key), never blank (STORY-063).
- **EC-I18N-2** — A new locale is added by dropping in a resource file only, no code change (STORY-063).
- **EC-I18N-3** — Long translated strings tolerate overflow without clipping actions (STORY-064/068).

## Phase exit checklist

Automated:

- [ ] `t('missing.key')` falls back to English/the key, never blank (EC-I18N-1).
- [ ] A lint/architecture check finds no hard-coded user-facing string bypassing `t()` (EC-I18N-2 mechanism).
- [ ] The CI matrix builds runnable binaries on Windows/macOS/Linux with the full gate set green.
- [ ] `verify:ui` passes across routes × 375/768/1280 × light/dark with zero overflow/console failures (EC-I18N-3).
- [ ] The no-network (`03_NonFunctional/04_OFFLINE.md#5-verification-approach`) and no-telemetry/local-logs (`03_NonFunctional/03_SECURITY_AND_PRIVACY.md#5-no-telemetry`/`#6-local-logs-only`) checks pass; the packaged build meets the startup (`03_NonFunctional/02_PERFORMANCE.md#1-startup-budget`) and Monaco bundle-size (`#5-bundle-size-monaco`) budgets.
- [ ] `just check` and `just trace-check` green with zero orphans across the whole backlog.

Manual:

- [ ] Installing the packaged build registers the `.md/.markdown/.mdown/.txt` associations and the custom icon.
- [ ] A dropped-in second-locale JSON localizes the UI with no rebuild of code (mechanism demo).
- [ ] The release notes document the unsigned-install / no-auto-update caveats.

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Cross-cutting packaging/release phase, finalized per stage as each ships; Milestone **M3** (the assistant) completes in Phase 14.
