**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../00_Foundation/06_IMPLEMENTATION_STAGES.md`, `../01_Product/13_I18N.md`, `../03_NonFunctional/02_PERFORMANCE.md`, `../03_NonFunctional/03_SECURITY_AND_PRIVACY.md`, `../03_NonFunctional/04_OFFLINE.md`, `../04_Build_and_Release/01_BUILD_MATRIX.md`, `../04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md`, `../04_Build_and_Release/03_CI_AND_HOOKS.md`, `../04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 10 — i18n, Packaging & Release Readiness

## Goal

Keep every shippable stage localizable, verifiable, and packageable on macOS, Windows, and Linux by supplying the bundled i18n mechanism, local and specified CI quality system, native package construction, and release-readiness evidence consumed by PH15.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH10 | cross-cutting | Stage 1 / M1; Stage 2 / M2; Stage 3 / M3 release readiness | PH00, PH01, PH02, PH03, PH04, PH05, PH06, PH07, PH08, PH09 | milestone-specific cumulative certification; see checkpoint matrix |

## Scope

- A bundled, data-driven `t()` layer with the canonical English catalog, fallback, interpolation, and locale formatting helpers.
- Routing of all user-facing strings present at each stage checkpoint, plus long-string/responsive coverage.
- Native macOS application bundle, Windows NSIS installer, and Linux nfpm `.deb`/`.rpm` construction using PH07 association metadata.
- Shared `just` commands, hooks, the specified tag-push/workflow-dispatch CI `test` job, security/drift gates, and Playwright responsive/smoke harness.
- Stage/release-candidate offline, privacy, startup, and bundle-size verification artifacts.
- Unsigned-install and no-auto-update caveat documentation for the package artifacts PH15 later publishes.

## Out of scope

- Tag-derived version injection, canonical icon processing, tag/workflow-dispatch release publication, checksums, and release asset naming, owned by PH15.
- Application behavior delivered by PH11–PH14; PH10 only re-validates localization/packaging when those surfaces exist.
- Code signing, notarization, auto-update, and shipped locales beyond English.
- Native file-association behavior approval, owned by PH07 even though PH10 builds the packages used for that proof.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH10-R01 | A bundled data-driven i18n layer resolves stable namespaced keys through `t()`, ships English, and returns English or the key instead of blank for missing entries. | `01_Product/13_I18N.md#i18n-layer`; `01_Product/13_I18N.md#string-catalog`; `01_Product/13_I18N.md#edge-cases` | DD-32; DD-35; no runtime locale fetch | PH10-W01 |
| PH10-R02 | Every user-facing menu, dialog, tooltip, banner, toast, status label, and error string present at a stage checkpoint uses the catalog; locale-sensitive values use formatting helpers and named interpolation. | `01_Product/13_I18N.md#i18n-layer`; `01_Product/13_I18N.md#formatting` | no concatenated user text; backend error keys remain stable | PH10-W02 |
| PH10-R03 | Adding a locale requires only a bundled resource file/data discovery, and long translations keep actions reachable at supported widths. | `01_Product/13_I18N.md#adding-a-locale`; `01_Product/13_I18N.md#edge-cases`; `03_NonFunctional/05_ACCESSIBILITY.md#2-keyboard-operability` | DD-35; English only ships; RTL not required but not blocked | PH10-W03 |
| PH10-R04 | Native package construction produces both macOS architecture bundles, a Windows executable/NSIS installer, and Linux binary/deb/rpm outputs using the supported native runners and required prerequisites. | `04_Build_and_Release/01_BUILD_MATRIX.md#1-supported-os-baseline`; `04_Build_and_Release/01_BUILD_MATRIX.md#2-artifact-matrix`; `04_Build_and_Release/01_BUILD_MATRIX.md#3-per-os-build-prerequisites`; `04_Build_and_Release/01_BUILD_MATRIX.md#5-why-each-os-builds-on-its-own-runner` | Wails v2; pure-Go SQLite; native webview toolchains | PH10-W04 |
| PH10-R05 | Packages project PH07's exact association metadata/icon hooks into macOS Info.plist, Windows NSIS ProgID registration, and Linux desktop/MIME/nfpm contents without redefining the extension set. | `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#1-declaration-source-wailsjson-fileassociations`; `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#3-macos-cfbundledocumenttypes--infoplist`; `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#4-windows-nsis-installer--progid`; `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#5-linux-desktop--mime--nfpm`; `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#6-extension-set-consistency` | DD-07; DD-25; PH07 owns native behavior evidence | PH10-W04 |
| PH10-R06 | Local hooks and the specified tag-push/workflow-dispatch CI `test` job run the declared generation/build/format/lint/type/test/UI/security/drift/trace gates in load-bearing order and fail on drift or uncovered traceability. | `04_Build_and_Release/03_CI_AND_HOOKS.md#2-git-hooks-lefthook`; `04_Build_and_Release/03_CI_AND_HOOKS.md#3-ordering-why-frontend-builds-before-go`; `04_Build_and_Release/03_CI_AND_HOOKS.md#4-ci-gate-set`; `04_Build_and_Release/03_CI_AND_HOOKS.md#5-github-actions-build--release-matrix`; `04_Build_and_Release/03_CI_AND_HOOKS.md#6-traceability-gate` | DD-37; no invented pull-request trigger; generated artifacts authoritative | PH10-W05 |
| PH10-R07 | The responsive Playwright harness covers stage routes/states at 375/768/1280 across required themes/modes and fails on overflow, console errors, or bridge-mock drift. | `04_Build_and_Release/03_CI_AND_HOOKS.md#4-ci-gate-set`; `01_Product/10_THEMING.md#token-model`; `01_Product/13_I18N.md#edge-cases` | deterministic bridge mock; human visual approval remains separate | PH10-W06 |
| PH10-R08 | Every stage/release candidate proves no unsolicited traffic/telemetry, local-only logs, bundled assets, startup budget, and bounded Monaco bundle before packaging is accepted. | `03_NonFunctional/04_OFFLINE.md#5-verification-approach`; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#5-no-telemetry`; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#6-local-logs-only`; `03_NonFunctional/02_PERFORMANCE.md#1-startup-budget`; `03_NonFunctional/02_PERFORMANCE.md#5-bundle-size-monaco` | DD-32–34; Stage-3 provider exception remains scoped; PH09-X01 applies | PH10-W07 |
| PH10-R09 | Unsigned package/install caveats and no-auto-update behavior are documented alongside staged artifacts, which PH15 later versions, checksums, and publishes. | `04_Build_and_Release/01_BUILD_MATRIX.md#8-signing-notarization-and-install-caveats`; `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#3-release-workflow` | DD-34; no release publication in PH10 | PH10-W07 |
| PH10-R10 | Cross-cutting certification inventories every newly added user-facing surface, package input, and gate from the exact milestone producers in the checkpoint matrix so prior-stage evidence cannot certify later-stage code unchanged. | `00_Foundation/06_IMPLEMENTATION_STAGES.md#2-stage--phase-mapping`; `00_Foundation/06_IMPLEMENTATION_STAGES.md#5-stage-exit-criteria`; `07_Phases/00_ROADMAP.md#stages` | cumulative Stage-1, Stage-2, and Stage-3 records remain distinct | PH10-W08 |

## Milestone dependency and evidence sets

| Checkpoint | Required product producers | PH10 certification scope | Required evidence set |
|---|---|---|---|
| Stage 1 / M1 | PH00; PH01 render/preview subset; PH03; PH04; PH07; PH08 theming/settings-shell subset; PH09 | Certify the complete Viewer surface, association/package inputs, themes/settings shell, rendering/assets, zero-network/privacy posture, and Stage-1 package outputs. | Fresh PH10-E01 through PH10-E08 identified as Stage 1 / M1; PH10-E04 also consumes PH07 installed-association regression evidence. |
| Stage 2 / M2 | Certified Stage-1 baseline plus PH01 editing subset; PH02; PH05; PH06; PH08 Stage-2 action/settings bindings | Re-inventory and recertify the cumulative Editor product, including file write/tabs, Format/Lint, PDF, new strings/routes/actions/settings, and the zero-network Stage-2 exit. | Fresh PH10-E01 through PH10-E08 identified as Stage 2 / M2; no Stage-1 artifact may stand in for a changed Stage-2 surface. |
| Stage 3 / M3 | Certified Stage-2 baseline plus PH08's preserved registry seam as consumed by PH11; PH11; PH12; PH13; PH14 | Re-inventory and recertify the cumulative Assistant product, AI settings/routes/actions, provider-scoped user-invoked network exception, package inputs, and Stage-3 exit. | Fresh PH10-E01 through PH10-E08 identified as Stage 3 / M3; network evidence distinguishes user-invoked configured-provider calls from prohibited traffic. |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH10-T01 | App starts or locale changes | Bundled catalogs are available | Discover catalog data; validate selected locale; load English fallback; set active locale; render translated surfaces | No user-facing label is blank or fetched remotely | Missing catalog/key falls back; previous usable locale remains available | PH10-R01, PH10-R02, PH10-R03 |
| PH10-T02 | New locale resource is added | File follows catalog schema | Discover data; compare key set; expose locale; format/interpolate through shared helpers | UI localizes without component/logic change | Missing keys fall back visibly; schema mismatch fails validation | PH10-R01, PH10-R03 |
| PH10-T03 | Local pre-push runs, or the specified tag-push/workflow-dispatch CI `test` job runs | Dependencies and generated prerequisites are available | Generate bindings; build frontend; run format/lint/type/tests/UI; run Go gates; run security/drift/trace checks | One reproducible pass/fail gate result | First failing gate blocks success; source/user files are not discarded | PH10-R06, PH10-R07 |
| PH10-T04 | Native package job runs | Specified CI `test` gates pass; platform-native runner is ready | Install prerequisites; build target; materialize installer/package metadata; retain staged artifacts | Expected target artifacts exist with consistent association metadata | A missing target/metadata mismatch fails packaging; no partial release is published | PH10-R04, PH10-R05 |
| PH10-T05 | Stage or release candidate requests completion | Every producer in that checkpoint's matrix row declares its current revision | Compare the prior inventory with the row's cumulative producer set; inventory new strings/routes/package inputs/gates; rerun PH10-E01 through PH10-E08 for that checkpoint; hand identified staged artifacts/gates to PH15 | Evidence identifies the exact revision and Stage 1, 2, or 3 checkpoint it certifies | Prior-stage evidence is not silently reused for changed inputs; a missing producer/evidence row blocks only the requested checkpoint | PH10-R02, PH10-R03, PH10-R07, PH10-R08, PH10-R10 |
| PH10-T06 | PH15 consumes PH10 outputs | Current staged package/gate evidence is complete | Provide package recipes/artifacts, CI `test` gate definitions, and caveat text; PH15 injects version/icon pipeline and publishes | Release orchestration reuses rather than redefines PH10 capabilities | PH10 never derives release version or publishes a tag release | PH10-R04, PH10-R05, PH10-R06, PH10-R09 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH10-C01 | PH10 | `ui/components/`, `ui/widgets/` | `t(key, params)` plus bundled namespaced catalogs and formatting helpers | Application lifetime | Catalog validation precedes stage localization completion | `01_Product/13_I18N.md#i18n-layer` | PH10-R01, PH10-R02, PH10-R03 |
| PH10-C02 | PH07 | PH10 | One canonical extension/association declaration and native hook contract | Package construction lifetime | PH07 metadata is projected, never duplicated or changed | `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#6-extension-set-consistency` | PH10-R05 |
| PH10-C03 | PH07 | PH10 | Native installed-association behavior evidence for the same canonical metadata and extension set | Each Stage-1+ packaging checkpoint | PH07 local behavior proof precedes PH10's package regression; PH10 consumes and refreshes it without making PH07 depend on PH10/PH15 | `01_Product/08_FILE_ASSOCIATIONS.md#declared-extensions`; `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#6-extension-set-consistency` | PH10-R04, PH10-R05 |
| PH10-C04 | PH10 | PH15 | CI `test` gate set, native packaging mechanics, staged outputs, and unsigned caveat text | Per release candidate | Gates/package construction complete before PH15 release orchestration | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#3-release-workflow` | PH10-R04, PH10-R06, PH10-R09 |
| PH10-C05 | PH09 | PH10 | Static URL scan and scoped runtime network policy scenarios | Per stage/release candidate | Security policy resolves before exit trace interpretation | `03_NonFunctional/04_OFFLINE.md#5-verification-approach` | PH10-R08 |
| PH10-C06 | PH01, PH02, PH05, PH06, PH08, PH11, PH12, PH13, PH14 | PH10 | Stage-2 producers contribute editing/file/format/export/action-setting surfaces; Stage-3 producers contribute AI settings/routes/actions and the user-invoked provider exception | Relevant Stage-2 or Stage-3 checkpoint lifetime | The exact checkpoint row's producers land before cumulative PH10 recertification; unchanged earlier evidence remains historical, not current proof | `00_Foundation/06_IMPLEMENTATION_STAGES.md#2-stage--phase-mapping` | PH10-R10 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-I18N-1 | primary | `01_Product/13_I18N.md#edge-cases` | PH10-R01 | Missing key returns English/key and never blank. | `frontend/src/i18n/i18n.test.ts::missing key (EC-I18N-1)` |
| EC-I18N-2 | primary | `01_Product/13_I18N.md#edge-cases` | PH10-R03 | New catalog file is discovered without component/logic edits. | `frontend/src/i18n/i18n.test.ts::resource-only locale (EC-I18N-2)` |
| EC-I18N-3 | primary | `01_Product/13_I18N.md#edge-cases` | PH10-R03, PH10-R07 | Long translated strings keep actions reachable at supported widths. | `frontend/e2e/i18n.spec.ts::long strings (EC-I18N-3)` |

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH10-W01 | Implement bundled i18n lookup, fallback, and formatting. | M | `i18n/`; `logic/utils/` | English catalog | PH10-R01 | PH00 frontend foundation |
| PH10-W02 | Route the current stage's user-facing strings through i18n. | M | `ui/widgets/`; `ui/components/`; `logic/store/` | catalog key inventory | PH10-R02 | PH10-W01; current stage UI contracts |
| PH10-W03 | Prove resource-only locale growth and responsive text. | M | `i18n/`; `ui/widgets/`; `ui/components/` | synthetic long-locale catalog | PH10-R03 | PH10-W01; PH10-W02 |
| PH10-W04 | Build native packages from canonical metadata. | M | `internal/application/`; `internal/fileassoc/` | `wails.json`; `build/darwin/`; `build/windows/`; `build/linux/`; nfpm/NSIS configs | PH10-R04, PH10-R05 | PH07 association contract; PH00 build contract |
| PH10-W05 | Implement local hooks and the specified tag-push/workflow-dispatch CI `test` job gates. | M | `internal/application/` | `justfile`; `.lefthook.yml`; `.github/workflows/main.yml`; `scripts/` | PH10-R06 | PH00 gate foundation |
| PH10-W06 | Implement responsive/smoke browser verification. | M | `dev/bridge-mock/`; `ui/widgets/`; `ui/components/` | Playwright config/baselines | PH10-R07 | PH10-W02; PH08 theme/settings states |
| PH10-W07 | Collect release-readiness security/performance/caveat evidence. | M | `internal/application/` | network traces; asset scan; startup/bundle reports; install caveat docs | PH10-R08, PH10-R09 | PH09 security contract; PH10-W04; PH10-W05; PH10-W06 |
| PH10-W08 | Recertify the exact cumulative producer/evidence set for one stage checkpoint. | M | `i18n/`; `ui/widgets/`; `ui/components/`; `dev/bridge-mock/` | stage-labelled inventories/evidence | PH10-R10 | completed producers in the applicable milestone matrix row |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH10-E01 | PH10-R01, PH10-R02, PH10-R03 | automated | i18n catalog/architecture/formatting tests and hard-coded-string check | current stage UI | tester | current HEAD | yes |
| PH10-E02 | PH10-R06 | automated | specified tag-push/workflow-dispatch CI `test` job run plus `just check`, `just trace-check`, drift, audit, and hook contract tests | checkpoint-labelled full gate set | CI owner | current HEAD | yes |
| PH10-E03 | PH10-R07 | automated | `just verify-ui` and smoke suites | current stage routes x 375/768/1280 x theme/mode | tester | current HEAD | yes |
| PH10-E04 | PH10-R04, PH10-R05 | real-runtime | `docs/phase-evidence/PH10-package-matrix.md`, including consumed PH07 installed-association regression | checkpoint-labelled macOS arm64/amd64, Windows amd64, Linux amd64 | release tester | current release candidate | yes |
| PH10-E05 | PH10-R08 | real-runtime | `docs/phase-evidence/PH10-release-readiness.md` | air-gapped/network trace; startup and bundle measurements | security/performance reviewer | current release candidate | yes |
| PH10-E06 | PH10-R03, PH10-R07 | human | `docs/phase-evidence/PH10-localization-approval.md` | long-locale responsive UI | product owner | current release candidate | yes |
| PH10-E07 | PH10-R09 | human | `docs/phase-evidence/PH10-install-caveats-approval.md` | macOS, Windows, Linux caveats | product owner | current release candidate | yes |
| PH10-E08 | PH10-R10 | automated | milestone-matrix producer plus requirement/route/string/package/evidence inventory comparison | separately labelled Stage 1, Stage 2, and Stage 3 records | reviewer | current checkpoint HEAD | yes |

## Clarification revision

2026-07-21 — Defined cumulative Stage-1/2/3 producer and evidence sets directly from the accepted stage map, enumerated Stage-2 and Stage-3 re-entry producers, replaced invented pull-request-trigger wording with the specified tag-push/workflow-dispatch CI `test` job, and made PH10 consume PH07's association regression while preserving PH15 ownership of version/icon/tag publication.
