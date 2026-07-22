**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../00_Foundation/06_IMPLEMENTATION_STAGES.md`, `../01_Product/05_RENDERING_AND_EXTENSIONS.md`, `../01_Product/09_ASSETS_AND_SECURITY.md`, `../01_Product/11_SETTINGS.md`, `../02_Architecture/04_WAILS_INTEGRATION.md`, `../03_NonFunctional/03_SECURITY_AND_PRIVACY.md`, `../03_NonFunctional/04_OFFLINE.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 09 — Assets & Security

## Goal

Resolve document assets through a least-privilege local-file boundary, prevent traversal and document code execution, and enforce an explicit remote-content policy without weakening the application's offline/privacy guarantees.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH09 | sequential | Stage 1 / M1 | PH00, PH01, PH03, PH04 | once per implemented security-policy revision |

## Scope

- Canonical document-relative local asset resolution and a symlink-safe allowlist.
- A guarded Wails `AssetServer.Handler` that serves disk files only and never proxies network URLs.
- Markdown image/resource rewriting to the guarded local route with stable placeholders.
- Ask/Always allow/Always block policy and the in-preview external-content banner.
- Sanitization and CSP enforcement for raw HTML, dangerous URLs, document scripts/styles, and resource origins.
- Static and runtime network/security evidence.

## Out of scope

- Settings-dialog structure, owned by PH08; this phase supplies the typed remote-policy contract and, after PH09-X04 is resolved, the configured-root contract it consumes.
- Application-initiated provider networking, which does not exist until Stage 3 and remains user-invoked only.
- Telemetry, auto-update, background fetch, CDN assets, and arbitrary filesystem access.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH09-R01 | Relative local assets resolve against the active document folder; absolute paths resolve as-is before authorization; unsaved buffers use only workspace/configured roots. | `01_Product/09_ASSETS_AND_SECURITY.md#relative-path-resolution`; `02_Architecture/04_WAILS_INTEGRATION.md#assetserver-handler` | DD-21; active-document identity; no file URL bypass; configured-root portion blocked by PH09-X04 | PH09-W01 |
| PH09-R02 | Authorization canonicalizes and symlink-resolves paths, permits only document folder/workspace/configured roots, and rejects every escape before any file read. | `01_Product/09_ASSETS_AND_SECURITY.md#allowlist`; `01_Product/09_ASSETS_AND_SECURITY.md#path-traversal`; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#2-asset-allowlist-and-traversal` | DD-21; traversal 403; missing allowed file 404; configured-root portion blocked by PH09-X04 | PH09-W01 |
| PH09-R03 | Markdown local-resource URLs route through the guarded handler; missing/rejected assets preserve alt text or a layout-safe placeholder without repeated dialogs. | `01_Product/09_ASSETS_AND_SECURITY.md#relative-path-resolution`; `01_Product/05_RENDERING_AND_EXTENSIONS.md#components-override` | PH04 renderer override; no ad-hoc direct disk access | PH09-W02 |
| PH09-R04 | Remote document resources obey Ask/Always allow/Always block: Ask blocks pending Load once/Always allow/Keep blocked; Always block issues no request/banner; policy changes persist where specified. | `01_Product/09_ASSETS_AND_SECURITY.md#remote-content-policy`; `01_Product/09_ASSETS_AND_SECURITY.md#banner`; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#3-remote-content-policy`; `03_NonFunctional/04_OFFLINE.md#4-document-referenced-remote-assets` | DD-22; default Ask; network-exit evidence blocked by PH09-X01; Load-once identity/lifetime blocked by PH09-X03 | PH09-W03 |
| PH09-R05 | Rendered document HTML cannot execute scripts, event handlers, or dangerous URLs, and CSP permits only bundled/local-allowlisted resources plus policy-authorized remote origins. | `01_Product/05_RENDERING_AND_EXTENSIONS.md#sanitization`; `01_Product/09_ASSETS_AND_SECURITY.md#csp`; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#4-webview-csp` | DD-32; exact level/directives blocked by PH09-X02 | PH09-W04 |
| PH09-R06 | The asset handler never proxies HTTP(S), app/render assets remain bundled, and no background/unsolicited application traffic, telemetry, auto-update, or remote log transmission is introduced. | `03_NonFunctional/04_OFFLINE.md#1-the-requirement`; `03_NonFunctional/04_OFFLINE.md#2-bundled-assets`; `03_NonFunctional/04_OFFLINE.md#3-no-cdn-at-runtime`; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#1-offline-invariant`; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#5-no-telemetry`; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#6-local-logs-only` | DD-32; DD-33; DD-34; F6 scoped invariant | PH09-W04 |
| PH09-R07 | The local allowlist is exposed as a reusable least-privilege policy for later workspace-reading tools without granting shell, arbitrary filesystem, or network capability. | `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#9-llm-data-flow-and-privacy`; `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open` | F5; F6; Stage-3 code absent; configured-root portion blocked by PH09-X04 | PH09-W01 |
| PH09-R08 | User-configured asset roots have one typed setting identity, default, UI/persistence ownership, canonical representation, and authorization lifetime; an acknowledged change invalidates obsolete grants before later asset requests. | `01_Product/09_ASSETS_AND_SECURITY.md#allowlist`; `01_Product/09_ASSETS_AND_SECURITY.md#relative-path-resolution`; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#2-asset-allowlist-and-traversal`; `01_Product/11_SETTINGS.md#content-privacy-group` | no accepted schema or lifecycle exists; blocked by PH09-X04 | PH09-W05 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH09-T01 | Preview requests a local asset | Active document/workspace context is known | Decode route; resolve relative/absolute path; canonicalize/symlink-resolve; test descendant against current roots; only then stat/read/serve | Authorized disk asset is served with no direct file access | Escape is rejected before read; missing allowed path is not served; preview retains placeholder | PH09-R01, PH09-R02, PH09-R03 |
| PH09-T02 | Preview discovers remote resources under Ask | Policy is Ask and no current-view grant exists | Prevent load; render remaining content; show one banner; await explicit action | No remote resource loads before choice | Dismiss/no choice stays blocked; no dialog spam or layout crash | PH09-R04 |
| PH09-T03 | User chooses Load once | Ask banner is active and PH09-X03 has resolved the exact view identity/lifetime | Bind the ephemeral grant to that identity; re-render/load only its authorized remote resources; do not persist policy; revoke at the resolved terminal boundary | Only the defined view lifetime may show its external resources | Grant never becomes Always allow or survives its defined identity; no implementation may guess the boundary while PH09-X03 is open | PH09-R04 |
| PH09-T04 | User chooses Always allow or Keep blocked | Ask banner is active | Persist allow/block value; acknowledge setting; re-render under new policy | Future/current views follow acknowledged policy | Failed persistence retains the last acknowledged policy; no speculative load | PH09-R04 |
| PH09-T05 | Sanitized document is committed to preview | Markdown AST/HTML and content policy are known | Strip/escape forbidden document code and URLs; apply resource rewrite/policy; enforce CSP; mount result | Malicious content cannot execute or exfiltrate | Rejected nodes/resources become safe text/placeholder; the rest renders | PH09-R03, PH09-R05, PH09-R06 |
| PH09-T06 | Active document/workspace/policy/configured-root input changes | A rendered view or outstanding asset request may exist | Recompute context and grants; invalidate stale authorization before later use; re-render/re-request only under the new acknowledged context | No prior document/root/policy authority leaks forward | Stale responses cannot populate the new view; configured-root invalidation awaits PH09-X04 | PH09-R01, PH09-R02, PH09-R04, PH09-R05, PH09-R08 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH09-C01 | PH01, PH03 | PH09 | F2's stable read-only document identity/path accessor and the workspace root identify eligible local roots | Active application-model state | Identity/path and workspace snapshots precede canonicalization; change invalidates old authority | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open`; `01_Product/09_ASSETS_AND_SECURITY.md#allowlist` | PH09-R01, PH09-R02 |
| PH09-C02 | PH04 | PH09 | Markdown `components` override delegates images/links/raw HTML through security policy | Render generation lifetime | Sanitize/authorize before any resource load | `01_Product/05_RENDERING_AND_EXTENSIONS.md#components-override` | PH09-R03, PH09-R05 |
| PH09-C03 | PH09 | PH08 | Typed `content.remotePolicy` key, `ask`/`allow`/`block` values, `ask` default, and feature-owned update/effect contract | Application lifetime | PH09 defines policy semantics before PH08 renders and persists the control; acknowledged persistence precedes policy effect | `01_Product/11_SETTINGS.md#content-privacy-group`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema` | PH09-R04 |
| PH09-C04 | PH09 | PH06 | Policy-filtered rendered-resource outcome plus authorization context, suitable for printing without re-resolving or reloading resources | One render/export generation | PH09 applies allowlist, remote policy, sanitization, and CSP before settlement; PH06 consumes only that generation | `01_Product/07_PDF_EXPORT.md#print-scope`; `01_Product/09_ASSETS_AND_SECURITY.md#remote-content-policy` | PH09-R03, PH09-R04, PH09-R05 |
| PH09-C05 | PH09 | PH13 | Reusable canonical-root allowlist and traversal rejection, not an arbitrary file API | Workspace lifetime | Validate every requested path at use time | `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#9-llm-data-flow-and-privacy` | PH09-R02, PH09-R07 |
| PH09-C06 | PH09 | PH10 | Static asset scan and representative runtime network scenarios prove scoped offline policy | Per release candidate | Build scan precedes runtime trace review | `03_NonFunctional/04_OFFLINE.md#5-verification-approach` | PH09-R04, PH09-R06 |
| PH09-C07 | PH09 | PH08, PH13 | Resolved typed configured-root contract and canonical allowlist snapshot; no consumer receives arbitrary filesystem authority | Application/workspace lifetime | Acknowledged root changes invalidate old authority before UI projection or tool use | `01_Product/09_ASSETS_AND_SECURITY.md#allowlist`; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#9-llm-data-flow-and-privacy` | PH09-R02, PH09-R07, PH09-R08 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-ASSET-1 | primary | `01_Product/09_ASSETS_AND_SECURITY.md#edge-cases` | PH09-R02, PH09-R03 | Relative traversal is rejected before disk read and renders a placeholder. | `internal/assets/handler_test.go::TestRelativeTraversal (EC-ASSET-1)` |
| EC-ASSET-2 | primary | `01_Product/09_ASSETS_AND_SECURITY.md#edge-cases` | PH09-R03 | Missing allowed file preserves alt/placeholder without repeated UI noise. | `frontend/src/logic/markdown/renderer.test.tsx::missing asset (EC-ASSET-2)` |
| EC-ASSET-3 | primary | `01_Product/09_ASSETS_AND_SECURITY.md#edge-cases` | PH09-R04 | Ask blocks first, shows banner, and loads only after an explicit choice. | `frontend/src/ui/widgets/ExternalContentBanner.test.tsx::ask policy (EC-ASSET-3)` |
| EC-ASSET-4 | primary | `01_Product/09_ASSETS_AND_SECURITY.md#edge-cases` | PH09-R04, PH09-R06 | Always block creates no resource request and no banner. | `frontend/src/logic/markdown/renderer.test.tsx::always block (EC-ASSET-4)` |
| EC-ASSET-5 | primary | `01_Product/09_ASSETS_AND_SECURITY.md#edge-cases` | PH09-R02 | Absolute/symlink escape is rejected before read. | `internal/assets/handler_test.go::TestAbsoluteAndSymlinkEscape (EC-ASSET-5)` |
| EC-ASSET-6 | primary | `01_Product/09_ASSETS_AND_SECURITY.md#edge-cases` | PH09-R01, PH09-R02 | Unsaved buffer uses only workspace/configured roots. | `internal/assets/handler_test.go::TestUnsavedBufferRoots (EC-ASSET-6)` |
| EC-RENDER-5 | regression | `01_Product/05_RENDERING_AND_EXTENSIONS.md#edge-cases` | PH09-R05 | PH09 re-proves that PH04's inert baseline remains non-executable under the selected security/CSP policy. | `frontend/src/logic/markdown/renderer.test.tsx::sanitization policy (EC-RENDER-5)` |
| EC-RENDER-7 | regression | `01_Product/05_RENDERING_AND_EXTENSIONS.md#edge-cases` | PH09-R03 | PH09 re-proves that PH04's placeholder layout survives guarded missing/rejected assets. | `frontend/e2e/assets.spec.ts::placeholder layout (EC-RENDER-7)` |
| EC-PDF-4 | precursor | `01_Product/07_PDF_EXPORT.md#edge-cases` | PH09-R04, PH09-R05 | PH09 proves that the rendered-resource outcome supplied to PH06 excludes policy-blocked remote resources; PH06 owns the primary export assertion. | `frontend/src/ui/widgets/PreviewView.test.tsx::blocked export policy precursor (EC-PDF-4)` |

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH09-W01 | Implement canonical path resolution and reusable allowlist policy. | M | `internal/assets/`; `internal/file/` | filesystem/symlink fixtures | PH09-R01, PH09-R02, PH09-R07 | PH01 F2 read-only identity/path contract; PH03 workspace root; PH09-X04 resolution for configured roots |
| PH09-W02 | Wire the guarded AssetServer and Markdown local-resource overrides. | M | `internal/assets/`; `internal/application/`; `logic/markdown/`; `logic/adapter/` | `main.go`; generated bindings if required | PH09-R03 | PH09-W01; PH04 component override |
| PH09-W03 | Define the typed remote-policy contract and enforce banner choices. | M | `logic/markdown/`; `logic/store/`; `internal/settings/`; `ui/widgets/` | policy fixtures | PH09-R04 | PH00 settings registry; PH09-X01 resolution; PH09-X03 resolution |
| PH09-W04 | Define and enforce sanitization/CSP/offline guards. | M | `logic/markdown/`; `internal/application/` | CSP configuration; static asset/network checks | PH09-R05, PH09-R06 | PH09-W02; PH09-W03; PH09-X01; PH09-X02 |
| PH09-W05 | Define, persist, and invalidate user-configured asset roots after the specification supplies their contract. | M | `internal/assets/`; `internal/settings/`; `logic/adapter/` | root-lifecycle fixtures | PH09-R08 | PH00 settings registry; PH09-X04 resolution |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH09-E01 | PH09-R01, PH09-R02, PH09-R03, PH09-R07 | automated | asset handler/renderer traversal, symlink, missing-file, and context-change suites | macOS, Windows, Linux path semantics | tester | current HEAD | yes |
| PH09-E02 | PH09-R04, PH09-R05 | automated | remote-policy, banner, sanitization, dangerous-URL, and CSP contract suites | Ask/allow/block; raw HTML | security reviewer | current HEAD | yes |
| PH09-E03 | PH09-R06 | automated | static shipped-asset remote-URL scan plus `just check` | production bundle | tester | current HEAD | yes |
| PH09-E04 | PH09-R01, PH09-R02, PH09-R03, PH09-R05 | real-runtime | `docs/phase-evidence/PH09-assets-security.md` | native Wails local/missing/traversal/malicious documents | security reviewer | current release candidate | yes |
| PH09-E05 | PH09-R04, PH09-R06 | real-runtime | network traces in `docs/phase-evidence/PH09-network-policy.md` | Ask untouched, Always block, Load once, Always allow | security reviewer | current release candidate | yes |
| PH09-E06 | PH09-R03, PH09-R04 | human | `docs/phase-evidence/PH09-banner-approval.md` | banner and placeholders at 375/768/1280 | product owner | current release candidate | yes |
| PH09-E07 | PH09-R01, PH09-R02, PH09-R07, PH09-R08 | automated | configured-root default/persistence/canonicalization/change-invalidation and consumer-boundary suites | saved and unsaved documents; workspace/no-workspace | security reviewer | current HEAD after PH09-X04 resolution | yes |

## Open specification conflicts

| ID | Conflicting or missing sources | Required decision | Blocked requirements |
|---|---|---|---|
| PH09-X01 | `01_Product/09_ASSETS_AND_SECURITY.md#remote-content-policy` and `03_NonFunctional/04_OFFLINE.md#4-document-referenced-remote-assets` permit user-authorized remote document assets, while `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-exit-criteria` requires Stage-1/2 traces with zero network connections without stating whether authorized document loads are excluded or which policy/scenario governs the trace. | Define the stage-exit network-evidence scenarios and whether user-authorized webview document requests are compatible with or excluded from the zero-connection assertion. | PH09-R04, PH09-R06 |
| PH09-X02 | `01_Product/05_RENDERING_AND_EXTENSIONS.md#sanitization`, `01_Product/09_ASSETS_AND_SECURITY.md#csp`, and `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#4-webview-csp` require a security/sanitization level but do not enumerate levels, defaults, allowed tags/attributes/URL schemes, or exact CSP directives and policy-dependent changes. | Define the supported level(s), default schema, URL protocol rules, exact CSP directives, and how remote-policy changes alter resource permissions. | PH09-R05 |
| PH09-X03 | `01_Product/09_ASSETS_AND_SECURITY.md#banner` says Load once applies to the "current view only" but does not define whether identity is a document id, tab activation, render generation, Preview/Reader mount, arrangement, or content revision, nor which switch/re-render/unmount ends the grant. | Define the grant identity, creation point, survival across re-render/arrangement/tab changes, revocation boundary, and stale-request handling. | PH09-R04 |
| PH09-X04 | The allowlist sources require "user-configured roots", but `01_Product/11_SETTINGS.md#content-privacy-group` defines no setting key, type, default, UI control, canonical storage form, persistence/error behavior, change lifecycle, or interaction with in-flight requests. | Define the configured-root setting contract and ownership, including default roots, add/remove validation, canonical persisted representation, multi-instance behavior, and authorization invalidation on change. | PH09-R01, PH09-R02, PH09-R07, PH09-R08 |

## Clarification revision

2026-07-21 — Split the former L handler work into bounded authorization and integration packages; made PH09 consume PH01's Stage-1 F2 identity/path seam and produce policy-filtered rendered resources for later PH06 plus typed remote/configured-root contracts for PH08. Corrected PH04/PDF edge roles and recorded unresolved Load-once identity/lifetime, configured-root lifecycle, network-evidence, and CSP conflicts rather than selecting security behavior.
