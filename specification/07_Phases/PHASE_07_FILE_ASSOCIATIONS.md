**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `../01_Product/03_FILES_TABS_WORKSPACE.md`, `../01_Product/08_FILE_ASSOCIATIONS.md`, `../02_Architecture/02_BACKEND_GO.md`, `../02_Architecture/04_WAILS_INTEGRATION.md`, `../04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 07 — File Associations

## Goal

Make every declared Markdown/text association open through one normalized, initialization-safe, backend-authoritative path on macOS, Windows, and Linux while keeping default-handler choice under user control.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH07 | sequential | Stage 1 / M1 | PH00, PH02, PH03 | once per implemented association/packaging-metadata revision |

## Scope

- One extension declaration set and document icon projected into native package metadata.
- Pure normalization/classification of `OnFileOpen` and command-line paths, including Unicode, spaces, multiple paths, and unsupported explicit opens.
- Pre-initialization queueing and dispatch through `internal/appmodel.OpenDoc` with `state:patch` projection.
- Default-open-mode consumption, multi-instance/new-process routing, and a non-forcing default-app prompt.
- Native installed-package evidence for association registration and double-click behavior on every supported OS.

## Out of scope

- Default-open-mode settings controls, consumed later by PH08; PH07 owns the typed setting contract and open behavior.
- CI/release publication, owned by PH10/PH15; PH07 owns association metadata, local native-package behavior, and installed-package proof that PH10 later regression-consumes.
- Single-instance forwarding, which is prohibited by DD-08.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH07-R01 | `.md`, `.markdown`, `.mdown`, and `.txt` plus one document icon are declared once and remain identical across `wails.json`, native manifests/installers, open filters, workspace filters, and accepted-extension checks. | `01_Product/08_FILE_ASSOCIATIONS.md#declared-extensions`; `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#1-declaration-source-wailsjson-fileassociations`; `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#6-extension-set-consistency` | DD-06; DD-07; DD-25; offline icons | PH07-W01 |
| PH07-R02 | Pure file-association helpers normalize macOS `OnFileOpen` and Windows/Linux argv paths, preserving spaces/Unicode and producing one deterministic target per supplied path. | `01_Product/08_FILE_ASSOCIATIONS.md#onfileopen`; `02_Architecture/04_WAILS_INTEGRATION.md#file-associations` | DD-26; no UI/path parsing | PH07-W02 |
| PH07-R03 | OS-open requests arriving before initialization are queued in order and, once ready, dispatch only through `internal/appmodel.OpenDoc`; the frontend learns the result through `state:patch`. | `01_Product/08_FILE_ASSOCIATIONS.md#onfileopen`; `02_Architecture/04_WAILS_INTEGRATION.md#lifecycle`; `02_Architecture/04_WAILS_INTEGRATION.md#file-associations` | DD-62–64; one composition root | PH07-W03 |
| PH07-R04 | Every OS/file-system open applies the persisted `view.defaultOpenMode` (`editor`/`viewer`, default `editor`) according to one explicit precedence rule relative to persisted per-document view state. | `01_Product/08_FILE_ASSOCIATIONS.md#open-in-default-mode`; `01_Product/02_EDITOR_AND_VIEWER_MODES.md#default-open-mode`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema`; `07_Phases/PHASE_02_FILE_IO_TABS.md#open-specification-conflicts` | DD-15; DD-27; behavior blocked by PH07-X01 | PH07-W04 |
| PH07-R05 | Existing-process and multi-path opens follow the multi-instance policy: no process lock or implicit forwarding, and each path becomes an ordered open request in the launched process. | `01_Product/08_FILE_ASSOCIATIONS.md#multi-instance-routing`; `01_Product/03_FILES_TABS_WORKSPACE.md#multi-instance`; `01_Product/03_FILES_TABS_WORKSPACE.md#tabs` | DD-08; ADR-0006; no silent path loss | PH07-W05 |
| PH07-R06 | GoMarkEdit appears in each OS Open With surface and may offer OS-appropriate instructions/actions, but never silently changes the user's default handler. | `01_Product/08_FILE_ASSOCIATIONS.md#set-as-default`; `01_Product/08_FILE_ASSOCIATIONS.md#macos`; `01_Product/08_FILE_ASSOCIATIONS.md#windows`; `01_Product/08_FILE_ASSOCIATIONS.md#linux` | DD-25; explicit user control | PH07-W06 |
| PH07-R07 | Installed packages on macOS, Windows, and Linux register the declared associations/icon and a file-manager open launches GoMarkEdit with the selected document in the configured mode. | `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#3-macos-cfbundledocumenttypes--infoplist`; `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#4-windows-nsis-installer--progid`; `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#5-linux-desktop--mime--nfpm` | native per-OS evidence; unsigned caveats do not waive behavior | PH07-W07 |
| PH07-R08 | An explicitly supplied unsupported extension opens only when the shared file service classifies it as text under the resolved decoding policy; clearly binary content is declined with a toast and no document mutation or save-corruption risk. | `01_Product/08_FILE_ASSOCIATIONS.md#open-in-default-mode`; `01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings`; `07_Phases/PHASE_02_FILE_IO_TABS.md#open-specification-conflicts` | EC-DOCS-8; behavior blocked by PH07-X02 | PH07-W08 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH07-T01 | OS supplies a declared path after initialization | Application model is ready and PH07-X01 is resolved | Normalize/classify path; read acknowledged default mode and any persisted per-document view state; apply the resolved precedence; dispatch OpenDoc; model opens/activates document; emit state patch | One backend-owned document opens in the resolved mode | Invalid target toasts and opens nothing; existing tabs remain unchanged; no precedence is guessed while PH07-X01 remains open | PH07-R02, PH07-R03, PH07-R04 |
| PH07-T02 | macOS `OnFileOpen` fires before startup completes | Composition root exists but model is not ready | Normalize enough to retain raw target; enqueue in arrival order; finish Init; drain through the same OpenDoc path | No cold-start open is lost or handled by an alternate path | Initialization failure keeps queue undispatched and reports startup failure | PH07-R03 |
| PH07-T03 | Process receives multiple paths | Paths were supplied by one OS invocation | Preserve input order; normalize each independently; dispatch each according to tab policy | Every valid target opens once | One invalid target does not corrupt or duplicate valid targets; its error is isolated | PH07-R02, PH07-R05 |
| PH07-T04 | OS open occurs while another instance runs | Multi-instance support enabled | OS launches/routs according to platform; new process handles its own path set; shared DB uses existing WAL policy | No single-instance forwarding assumption or lock | Existing process remains unaffected; settings contention follows PH00 persistence policy | PH07-R05 |
| PH07-T05 | App is not the default handler | Native registration exists | Show non-blocking prompt; invoke OS-supported instructions/action only after user choice | User can set default without coercion | Dismissal changes nothing; unsupported automatic changes are never attempted | PH07-R06 |
| PH07-T06 | User installs/uninstalls a package | Native package matches release candidate | Install registration/icon metadata; refresh OS databases where required; uninstall reverses owned registration | Open With and file-manager launch work only while installed | Failed registration is surfaced by packaging evidence; never seize unrelated defaults | PH07-R01, PH07-R07 |
| PH07-T07 | OS supplies an unsupported extension explicitly | Application model is ready and PH07-X02 is resolved | Normalize path; classify/decode through the shared PH02 policy; if textual dispatch the normal OpenDoc path, otherwise reject with a toast | Text follows the normal open flow; binary input creates no document | Classification/decoding failure opens nothing and cannot create a lossy save path; no decoding policy is guessed while PH07-X02 remains open | PH07-R02, PH07-R03, PH07-R08 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH07-C01 | PH02, PH03 | PH07 | `internal/appmodel.OpenDoc`, shared decoding/classification, and tab/open semantics are the only OS-open mutation path | Application lifetime after Init | Normalize, classify, and mode-resolve before command; patch after mutation | `02_Architecture/04_WAILS_INTEGRATION.md#file-associations` | PH07-R03, PH07-R04, PH07-R05, PH07-R08 |
| PH07-C02 | PH07 | PH08 | Typed `view.defaultOpenMode` key, `editor`/`viewer` values, `editor` default, and feature-owned update contract | Application lifetime | PH07 defines the feature contract before PH08 renders and persists its control; open dispatch reads the acknowledged value | `01_Product/08_FILE_ASSOCIATIONS.md#open-in-default-mode`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema` | PH07-R04 |
| PH07-C03 | PH07 | PH10 | Canonical association metadata, document icon references, native hook requirements, and installed-behavior regression evidence | Packaging/checkpoint lifetime | PH07 proves local native behavior first; PH10 projects the same metadata and re-runs the regression without redefining the extension set | `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md#6-extension-set-consistency` | PH07-R01, PH07-R07 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-ASSOC-1 | primary | `01_Product/08_FILE_ASSOCIATIONS.md#edge-cases` | PH07-R05 | OS-open while another instance runs uses a new process, not forwarding/locking. | `internal/application/fileassoc_test.go::TestExistingInstancePolicy (EC-ASSOC-1)` |
| EC-ASSOC-2 | primary | `01_Product/08_FILE_ASSOCIATIONS.md#edge-cases` | PH07-R08 | After PH07-X02 is resolved, explicit unsupported text follows the shared tolerant policy and binary input is declined without corruption. | `internal/fileassoc/fileassoc_test.go::TestUnsupportedExtension (EC-ASSOC-2)` |
| EC-ASSOC-3 | primary | `01_Product/08_FILE_ASSOCIATIONS.md#edge-cases` | PH07-R02 | Spaces and Unicode are preserved exactly. | `internal/fileassoc/fileassoc_test.go::TestUnicodeAndSpaces (EC-ASSOC-3)` |
| EC-ASSOC-4 | primary | `01_Product/08_FILE_ASSOCIATIONS.md#edge-cases` | PH07-R06 | Prompt never forces a default-handler change. | `frontend/src/ui/widgets/DefaultAppPrompt.test.tsx::user control (EC-ASSOC-4)` |
| EC-ASSOC-5 | primary | `01_Product/08_FILE_ASSOCIATIONS.md#edge-cases` | PH07-R02, PH07-R05 | Every supplied path opens once in policy order. | `internal/application/fileassoc_test.go::TestMultiplePaths (EC-ASSOC-5)` |
| EC-ASSOC-6 | primary | `01_Product/08_FILE_ASSOCIATIONS.md#edge-cases` | PH07-R03 | Cold-start `OnFileOpen` queues and drains after Init. | `internal/application/fileassoc_test.go::TestColdStartQueue (EC-ASSOC-6)` |

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH07-W01 | Establish one extension/association declaration. | M | `internal/fileassoc/`; `internal/docs/`; `internal/workspace/` | `wails.json`; document icon metadata | PH07-R01 | PH02/PH03 filter contracts |
| PH07-W02 | Normalize and classify declared OS-open paths. | M | `internal/fileassoc/`; `internal/apperr/` | argv/OnFileOpen fixtures | PH07-R02 | PH02 path/open contract |
| PH07-W03 | Queue startup opens and dispatch appmodel commands. | M | `internal/application/`; `internal/appmodel/`; `internal/fileassoc/` | `main.go` | PH07-R03 | PH07-W02; PH02 OpenDoc contract |
| PH07-W04 | Define the typed default-mode setting and apply the resolved open precedence. | M | `internal/fileassoc/`; `internal/settings/`; `internal/appmodel/` | precedence fixtures | PH07-R04 | PH07-W03; PH00 settings registry; PH07-X01 resolution |
| PH07-W05 | Route multi-path and multi-instance opens. | M | `internal/application/`; `internal/fileassoc/` | process integration harness | PH07-R05 | PH07-W03; PH03 tab policy |
| PH07-W06 | Provide user-controlled default-app guidance. | M | `internal/fileassoc/`; `logic/adapter/`; `ui/widgets/` | per-OS instructions | PH07-R06 | PH07-W01 native metadata |
| PH07-W07 | Materialize local native association packages and verify installed behavior. | M | `internal/application/`; `internal/fileassoc/` | `build/darwin/`; `build/windows/`; `build/linux/`; installed-package evidence | PH07-R07 | PH07-W01; PH07-W03 |
| PH07-W08 | Apply the resolved shared text/binary decoding policy to unsupported explicit opens. | S | `internal/fileassoc/`; `internal/docs/` | textual/binary fixtures | PH07-R08 | PH07-W02; PH07-W03; PH07-X02 resolution |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH07-E01 | PH07-R01, PH07-R02, PH07-R03, PH07-R04, PH07-R05, PH07-R08 | automated | fileassoc/appmodel/config, precedence, and unsupported-text/binary contract suites plus `just check` and `just gen-check` | all | tester | current HEAD | yes |
| PH07-E02 | PH07-R06 | automated | prompt behavior and no-force boundary tests | all | tester | current HEAD | yes |
| PH07-E03 | PH07-R01, PH07-R07 | real-runtime | `docs/phase-evidence/PH07-native-associations.md` | installed macOS, Windows, Linux packages | release tester | current release candidate | yes |
| PH07-E04 | PH07-R04, PH07-R05, PH07-R07 | real-runtime | double-click/Open With launch matrix in `docs/phase-evidence/PH07-native-associations.md` | all declared extensions on each OS | release tester | current release candidate | yes |
| PH07-E05 | PH07-R06, PH07-R07 | human | approval recorded in `docs/phase-evidence/PH07-native-associations.md` | Open With/default prompt/icon on each OS | product owner | current release candidate | yes |

## Open specification conflicts

| ID | Conflicting or missing sources | Required decision | Blocked requirements |
|---|---|---|---|
| PH07-X01 | `01_Product/08_FILE_ASSOCIATIONS.md#open-in-default-mode` says every OS/file-system open uses the configured default mode, while `01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state` says reopening a file restores its persisted arrangement subject to that default; PH02-X01 records that the precedence is undefined. | Resolve whether and when persisted per-document arrangement overrides `view.defaultOpenMode`, including first open, reopen, explicit OS open, and workspace-tree open. | PH07-R04 |
| PH07-X02 | `01_Product/08_FILE_ASSOCIATIONS.md#open-in-default-mode` requires unsupported text to use PH02's tolerant read and binary input to be declined, while `01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings` does not define the decoding/classification/write-back policy; PH02-X02 records the unresolved lossless-decoding conflict. | Resolve PH02-X02's encoding detection, textual/binary classification, in-memory representation, warning, and lossless-save policy before associations reuse it. | PH07-R08 |

## Clarification revision

2026-07-21 — Replaced fixed story ids with permanent routing, declaration, initialization, user-control, and native-proof requirements. Removed PH10/PH15 producer dependencies, made PH07 produce its typed setting/metadata and installed-behavior contract for later PH08/PH10 consumers, and blocked default-mode precedence and unsupported-file decoding on the exact PH02 conflicts instead of inventing behavior.
