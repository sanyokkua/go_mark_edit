**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer, release manager
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `PHASE_07_FILE_ASSOCIATIONS.md`, `PHASE_08_THEMING_SETTINGS.md`, `PHASE_10_I18N_PACKAGING.md`, `PHASE_14_CONTEXT_BUDGET_POLISH.md`, `../00_Foundation/04_DESIGN_DECISIONS.md`, `../00_Foundation/06_IMPLEMENTATION_STAGES.md`, `../04_Build_and_Release/01_BUILD_MATRIX.md`, `../04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md`, `../04_Build_and_Release/03_CI_AND_HOOKS.md`, `../04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`, `../assets/icon/README.md`, `../../docs/adr/0015-cicd-versioning-icon.md`

# Phase 15 — CI/CD & Release Finalization

## Goal

Complete the cross-platform v1 release train so a validated version produces version-consistent, icon-complete, checksummed artifacts for every supported target without touching production user data, and so a failed or build-only run can never publish a release.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH15 | cross-cutting | M1, M2, M3, and final v1 release candidates | PH10 | refresh for every shippable milestone and release candidate, plus every pipeline/artifact-policy revision |

## Milestone dependency and evidence sets

Release checkpoint dependency and evidence sets:

| Checkpoint | Product capabilities that must be complete | Required cross-cutting baseline | PH15 evidence scope |
|---|---|---|---|
| M1 / Viewer | PH00; PH01 render/preview subset; PH03; PH04; PH07; PH08 theming/settings-shell subset; PH09 | PH10 evidence refreshed for M1 | PH15-E01–PH15-E08 against the M1 viewer routes, packages, associations, and offline trace |
| M2 / Editor | complete M1 set; PH01 editor subset; PH02; PH05; PH06; PH08 editor settings | PH10 evidence refreshed for M2 | PH15-E01–PH15-E08 refreshed against create/edit/save/format/lint/PDF packages and offline trace |
| M3 / Assistant | complete M2 set; PH11; PH12; PH13; PH14 | PH10 evidence refreshed for M3, including Stage-3 strings and scoped provider traffic | PH15-E01–PH15-E08 refreshed against assistant packages, configured-provider network trace, and no-background-traffic proof |
| Final v1 RC | complete M3 set and every accepted remediation required by its phase-completion checks | current PH10 release-candidate evidence | PH15-E01–PH15-E08 against the exact tag candidate; all phase-complete checks and human approvals blocking |

## Scope

- `internal/settings.AppVersion` with a `dev` fallback, release ldflags injection, package-metadata injection, About display, and one startup-log record.
- One deterministic icon source and processor feeding application, installer, and document-association icons on every target.
- Version determination, the per-platform build matrix, the full headless test gate, artifact staging, checksums, pre-release classification, and conditional release publication.
- Milestone-specific dependency selection and refreshed evidence for M1, M2, M3, and the final v1 release candidate.
- CI/development production-data isolation and failure/build-only publication safeguards.
- Native install/launch evidence for version, icons, file associations, executable permissions, and unsigned-install guidance.

## Out of scope

- The PR verification gates, packaging implementations, localization, and file-association mechanics owned by PH07/PH10; this phase consumes and re-proves their release artifacts.
- Code signing, notarization, paid certificates, store distribution, telemetry, or auto-update.
- Changing the accepted icon artwork or introducing independently maintained platform artwork.
- Publishing a real release while any blocking requirement or evidence item remains unresolved.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH15-R01 | `internal/settings.AppVersion` defaults to `dev`, release builds inject the normalized version through ldflags, and the exact effective version appears in About and once in the startup log. | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#1-version-injection`; `04_Build_and_Release/01_BUILD_MATRIX.md#6-wails-build-flags`; `00_Foundation/04_DESIGN_DECISIONS.md#15-versioning-app-icon--cicd` | DD-65; no runtime network lookup; development remains identifiable | PH15-W01 |
| PH15-R02 | One determine-version result drives binary ldflags, artifact names, release tag/name, and the specified ephemeral in-place `jq … > tmp && mv tmp wails.json` patch of `.version` and `.info.productVersion` before each build; binary/package metadata must agree and no patched `wails.json` drift may remain or be committed. | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#1-version-injection`; `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#3-release-workflow` | DD-65; compute once; no separately patched copy; fail on malformed version or drift | PH15-W03 |
| PH15-R03 | `specification/assets/icon/appicon-source.png` is processed only by `specification/assets/icon/process_icon.py` into validated 1024×1024 RGBA `build/appicon.png` with transparent corners; every application, installer, and associated-document icon derives from that output, and missing/invalid inputs fail before packaging. | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#2-app-icon-pipeline`; `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#2-app-icon-requirements`; `assets/icon/README.md#producing-the-build-icon` | DD-66; canonical specification pipeline; no hand-maintained platform fork | PH15-W02 |
| PH15-R04 | The authoritative `.github/workflows/release.yml` accepts semantic `v*.*.*` tag pushes and explicit manual inputs, determines the version once, builds every supported target with its native runner, and uploads isolated staged artifacts: two complete macOS `.app` bundles, Windows executable plus NSIS installer, and Linux executable plus `.deb` and `.rpm`. | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#3-release-workflow`; `04_Build_and_Release/01_BUILD_MATRIX.md#2-artifact-matrix`; `04_Build_and_Release/03_CI_AND_HOOKS.md#5-github-actions-build--release-matrix` | DD-67; release pipeline document refines the older outline; no cross-OS packaging shortcut | PH15-W03 |
| PH15-R05 | The `release.yml` headless test job runs the complete formatting/lint/type/test/UI/security/architecture/generated-bindings/sqlc/trace/phase/isolation gate set and the canonical icon command `python3 specification/assets/icon/process_icon.py specification/assets/icon/appicon-source.png build/appicon.png`, then rejects `build/appicon.png` drift; all checks must pass before publication is eligible. | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#3-release-workflow`; `04_Build_and_Release/03_CI_AND_HOOKS.md#4-ci-gate-set`; `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#4-cidev-isolation-from-production-data`; `assets/icon/README.md#producing-the-build-icon` | DD-67; consume current PH10 gate definitions; icon assertions and no-drift check are blocking; fail closed | PH15-W04 |
| PH15-R06 | Eligible release creation downloads all staged artifacts and publishes exactly two versioned macOS `.app.zip` assets, a Windows executable and NSIS installer, a Linux executable plus `.deb` and `.rpm`, and matching `SHA256SUMS.txt`; it reconstructs/re-zips macOS with symlink/executable preservation, marks suffixed versions pre-release, and includes unsigned-install caveats. | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#3-release-workflow`; `04_Build_and_Release/01_BUILD_MATRIX.md#2-artifact-matrix`; `04_Build_and_Release/01_BUILD_MATRIX.md#8-signing-notarization-and-install-caveats` | DD-34; DD-67; macOS uses `zip -r -y -X`; no missing/extra asset kind | PH15-W05 |
| PH15-R07 | A failed prerequisite or a manual build with `create_release=false` may upload diagnostic/build artifacts but never creates or mutates a GitHub release. | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#3-release-workflow`; `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#5-edge-cases-rel` | DD-67; explicit conditional publication; least GitHub permissions | PH15-W04, PH15-W05 |
| PH15-R08 | Every CI and development invocation resolves config, database, log, cache, and temporary paths outside the production `GoMarkEdit` data root, and release tests prove that isolation before any application initialization. | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#4-cidev-isolation-from-production-data`; `00_Foundation/04_DESIGN_DECISIONS.md#15-versioning-app-icon--cicd` | DD-67; no migration or mutation of real user data | PH15-W04 |
| PH15-R09 | Release assets and notes state the unsigned/not-notarized limitations and platform install steps; the pipeline contains no signing, notarization, telemetry, or auto-update behavior. | `04_Build_and_Release/01_BUILD_MATRIX.md#8-signing-notarization-and-install-caveats`; `00_Foundation/04_DESIGN_DECISIONS.md#10-non-functional--operations` | DD-33; DD-34; local-only logs | PH15-W05 |
| PH15-R10 | Each downloaded target artifact installs or extracts and launches on its target OS, reports the release version, shows derived app/document icons, preserves executable permissions, and retains PH07 file-association behavior where supported. | `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#1-declaration-source-wailsjson-fileassociations`; `04_Build_and_Release/01_BUILD_MATRIX.md#2-artifact-matrix`; `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#3-release-workflow` | PH07 and PH10 release contracts; native evidence on all supported targets | PH15-W06 |
| PH15-R11 | Release eligibility is evaluated against the explicit M1, M2, M3, or final-v1-RC dependency/evidence set above; evidence from an earlier milestone cannot certify later surfaces, while an earlier milestone is not blocked by unimplemented later-stage product phases. | `07_Phases/00_ROADMAP.md#milestones`; `00_Foundation/06_IMPLEMENTATION_STAGES.md#2-stage--phase-mapping`; `07_Phases/PHASE_10_I18N_PACKAGING.md#phase-exit-evidence` | cross-cutting PH10/PH15 re-entry; record checkpoint and exact revision | PH15-W06 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH15-T01 | Local/development build starts | No release version is injected | Keep `AppVersion=dev`; build with development data roots; display/log `dev` | Clearly non-release application | Missing override never guesses a VCS/release version or contacts a service | PH15-R01, PH15-R08 |
| PH15-T02 | Release tag or manual dispatch starts | Trigger, inputs, and selected milestone/checkpoint are available | Resolve the checkpoint's product phases and current PH10 evidence; validate trigger/input; normalize version once; derive create-release/pre-release flags; expose immutable job outputs | All downstream jobs consume one version and one evidenced checkpoint | Missing/stale checkpoint dependency, invalid input, or mismatch stops before builds and publishes nothing | PH15-R02, PH15-R04, PH15-R07, PH15-R11 |
| PH15-T03 | Platform matrix build starts | Determine-version succeeded; canonical icon and PH10 package contracts exist | Isolate data paths; run the in-place ephemeral `jq` patch on checked-out `wails.json`; build on native runner with ldflags; verify version/icon; stage the complete target artifact set; verify no committed/source drift | Two macOS bundles, Windows exe/NSIS, and Linux executable/deb/rpm are isolated and staged | Any target/artifact/drift failure preserves repository sources, fails the workflow, and makes release ineligible | PH15-R02, PH15-R03, PH15-R04, PH15-R08 |
| PH15-T04 | Full test gate starts | Repository checkout and generated prerequisites exist | Install pinned toolchains/dependencies; run the complete current PH10/DoD gates; run canonical icon processing/assertions; run phase/checkpoint and data-isolation checks; report status | Release eligibility includes a green independent test and icon gate for the selected checkpoint | Any failed or omitted check blocks publication without weakening/skipping it | PH15-R03, PH15-R05, PH15-R07, PH15-R08, PH15-R11 |
| PH15-T05 | Create-release job evaluates | All native builds/test passed and publication was requested | Download staged assets; require two macOS bundles, Windows exe/NSIS, Linux executable/deb/rpm; reconstruct/re-zip macOS apps; version every name; verify payloads; compute `SHA256SUMS.txt`; classify pre-release; generate notes/caveats; publish once | Complete checksummed release for the decided version/checkpoint | Missing/extra/mismatched/unsafe asset or publication failure produces no partial successful release claim | PH15-R06, PH15-R07, PH15-R09, PH15-R11 |
| PH15-T06 | Build-only dispatch or failed prerequisite completes | `create_release=false` or a required job failed | Preserve allowed uploaded artifacts/logs; skip create-release condition; confirm no release mutation | Build evidence without publication | No fallback path or rerun may implicitly publish | PH15-R07 |
| PH15-T07 | Icon processing is invoked | Canonical source and processor dependencies exist | Validate source; process once; validate dimensions/mode/transparency; derive target/application/document assets; compare expected outputs | Deterministic single-source icon set | Missing source, invalid contract, or stale derivation fails before packaging and preserves prior source | PH15-R03 |
| PH15-T08 | Release candidate is downloaded for acceptance | Selected checkpoint, published/draft artifacts, and checksums exist | Verify every checksum; test both macOS zips, Windows exe/NSIS, and Linux executable/deb/rpm on their native targets; launch/install; inspect version/icons/association; record caveats and result | Native evidence binds every artifact kind to one checkpoint/release candidate | Failure or stale earlier-milestone evidence blocks approval without waiving a platform/artifact kind | PH15-R10, PH15-R11 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH15-C01 | PH10 | PH15 | Checkpoint-current headless gate set, packaging metadata/installers, artifact shapes, localization, offline/privacy evidence, and unsigned-install documentation | Per M1/M2/M3/final release candidate | Matching PH10 checkpoint evidence precedes release staging/publication and is never reused across later milestones without refresh | `07_Phases/PHASE_10_I18N_PACKAGING.md#cross-phase-contracts` | PH15-R04, PH15-R05, PH15-R06, PH15-R09, PH15-R11 |
| PH15-C02 | PH07 | PH15 | Registered extension/document-type metadata and document icons remain valid in packaged artifacts | Per target package | Packaging generates associations before native install proof | `07_Phases/PHASE_07_FILE_ASSOCIATIONS.md#cross-phase-contracts` | PH15-R03, PH15-R10 |
| PH15-C03 | PH08 | PH15 | About surface renders the injected `AppVersion` through existing settings/application ownership | Application lifetime | Version is injected at link time before About can read it | `07_Phases/PHASE_08_THEMING_SETTINGS.md#cross-phase-contracts` | PH15-R01 |
| PH15-C04 | Selected M1/M2/M3 product phases | PH15 | The checkpoint matrix defines the exact application capability/evidence revision packaged by the reusable pipeline | Per milestone/release candidate | Only selected-checkpoint phase and refreshed PH10 completion precede that publication; later stages do not block earlier milestones | `07_Phases/00_ROADMAP.md#milestones` | PH15-R05, PH15-R10, PH15-R11 |
| PH15-C05 | PH15 | Release consumer | Checksummed native artifact, effective version, icon/association metadata, and explicit unsigned-install caveats agree | Published release lifetime | Verify gates and checksums before publication/download trust | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#3-release-workflow` | PH15-R02, PH15-R06, PH15-R09, PH15-R10 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-REL-1 | primary | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#5-edge-cases-rel` | PH15-R05, PH15-R07 | A failed test/build prerequisite prevents create-release and no release is published. | `scripts/release/release_test.go::TestFailedGateCannotPublish (EC-REL-1)` |
| EC-REL-2 | primary | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#5-edge-cases-rel` | PH15-R04, PH15-R07 | Manual `create_release=false` produces artifacts only and cannot mutate a release. | `scripts/release/release_test.go::TestBuildOnlyCannotPublish (EC-REL-2)` |
| EC-REL-3 | primary | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#5-edge-cases-rel` | PH15-R06 | A normalized version with a suffix is published with pre-release status. | `scripts/release/release_test.go::TestSuffixMarksPrerelease (EC-REL-3)` |
| EC-REL-4 | primary | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#5-edge-cases-rel` | PH15-R06, PH15-R10 | Both reconstructed macOS archives preserve symlinks and executable permission after extraction. | `scripts/release/release_test.go::TestMacArchivePermissions (EC-REL-4)` |
| EC-REL-5 | primary | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#5-edge-cases-rel` | PH15-R03, PH15-R05 | Missing canonical source or invalid output contract fails icon processing in the release test gate before packaging. | `scripts/release/release_test.go::TestIconPipelineGate (EC-REL-5)` |
| EC-REL-6 | primary | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#5-edge-cases-rel` | PH15-R02 | Binary/package metadata mismatch or residual `wails.json` drift fails verification and blocks publication. | `scripts/release/release_test.go::TestVersionMetadataMustMatch (EC-REL-6)` |

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH15-W01 | Add version default/injection and surface it in About/startup logging. | S | `internal/settings/`; `internal/application/`; `ui/widgets/` | `AppVersion` tests; About test; startup-log fixture | PH15-R01 | PH08 About contract |
| PH15-W02 | Validate the canonical specification icon pipeline and downstream derivations. | S | none | `specification/assets/icon/`; `build/`; `specification/assets/icon/process_icon.py`; `specification/assets/icon/appicon-source.png`; `build/appicon.png`; icon contract test | PH15-R03 | PH07/PH10 packaging contracts |
| PH15-W03 | Implement version determination, in-place metadata patching, and native artifact staging in `release.yml`. | M | none | `.github/workflows/`; `scripts/release/`; `wails.json`; `.github/workflows/release.yml`; workflow/metadata tests; manifest for two macOS bundles, Windows exe/NSIS, Linux executable/deb/rpm | PH15-R02, PH15-R04 | PH15-W01; PH15-W02 |
| PH15-W04 | Integrate complete release/icon gates and data-root isolation proof. | M | `internal/bootstrap/`; `internal/file/` | `.github/workflows/`; `scripts/release/`; `scripts/release/release_test.go`; gate/isolation reports | PH15-R05, PH15-R07, PH15-R08 | PH10 gates; PH15-W03 |
| PH15-W05 | Implement conditional release assembly, all asset kinds, checksums, pre-release logic, and caveats. | M | none | `.github/workflows/`; `scripts/release/`; archive/checksum/publication fixtures; generated release-note template | PH15-R06, PH15-R07, PH15-R09 | PH15-W03; PH15-W04 |
| PH15-W06 | Select checkpoint dependencies and perform native artifact release acceptance. | M | none | `scripts/release/`; `docs/phase-evidence/`; checkpoint manifest; per-artifact install/version/icon/association evidence | PH15-R10, PH15-R11 | PH15-W05; selected product phases; current PH10 evidence |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH15-E01 | PH15-R01, PH15-R02 | automated | default/injected version, specified in-place jq patch, binary/package mismatch, no-drift, and source-cleanliness suites | Go/UI plus `scripts/release` fixtures | tester | selected checkpoint HEAD | yes |
| PH15-E02 | PH15-R03 | automated | canonical process command/output assertions and deterministic downstream derivation suite | `specification/assets/icon/` to `build/appicon.png`; app/document outputs | tester | selected checkpoint HEAD | yes |
| PH15-E03 | PH15-R03, PH15-R04, PH15-R05, PH15-R07, PH15-R08 | automated | `scripts/release` workflow trigger/job/needs/condition/permissions tests; full PH10 gate; canonical icon command; data-root isolation | tag/manual/failure/build-only fixtures for selected checkpoint | CI reviewer | selected checkpoint HEAD | yes |
| PH15-E04 | PH15-R06, PH15-R09 | automated | two-macOS re-zip/executable/symlink tests; exact Windows exe/NSIS and Linux executable/deb/rpm inventory; versioned names; checksums; pre-release; caveats | every declared release asset plus `SHA256SUMS.txt` | release manager | selected checkpoint HEAD | yes |
| PH15-E05 | PH15-R04, PH15-R05, PH15-R07, PH15-R11 | real-runtime | `docs/phase-evidence/PH15-workflow-run.md` | hosted `release.yml` native matrix build-only and failed-gate runs, naming M1/M2/M3/final checkpoint | release manager | current selected release candidate | yes |
| PH15-E06 | PH15-R06, PH15-R10, PH15-R11 | real-runtime | `docs/phase-evidence/PH15-native-artifacts.md` | both macOS `.app.zip`; Windows exe and NSIS; Linux executable, `.deb`, and `.rpm` | platform testers | current selected release candidate | yes |
| PH15-E07 | PH15-R01, PH15-R03, PH15-R09, PH15-R10, PH15-R11 | human | `docs/phase-evidence/PH15-release-approval.md` | selected checkpoint About/startup version, app/document icons, each install UX, caveats | product owner and release manager | current selected release candidate | yes |
| PH15-E08 | PH15-R01–PH15-R11 | automated | selected-checkpoint phase dependency/PH10 evidence validation; `just check`; `just trace-check`; applicable phase-complete checks; `just phase-complete-check 15`; checksum/worktree-drift checks | exact M1/M2/M3/final candidate revision | reviewer | current selected release candidate | yes |

## Clarification revision

2026-07-21 — Replaced fixed story suggestions with permanent release requirements and S/M capability packages. Added M1/M2/M3/final-candidate dependency and evidence sets, the exact in-place jq lifecycle, canonical `specification/assets/icon` gate, complete artifact inventory, normal `scripts/release` test package, and hosted/native/human proof. `04_VERSIONING_ICON_AND_CICD.md` explicitly owns the normative release pipeline and fixes `.github/workflows/release.yml`; the older `03_CI_AND_HOOKS.md` reference to `main.yml` is a stale outline erratum, not an unresolved product choice.
