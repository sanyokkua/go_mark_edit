**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../00_Foundation/06_IMPLEMENTATION_STAGES.md`, `../01_Product/10_THEMING.md`, `../01_Product/11_SETTINGS.md`, `../01_Product/12_KEYBOARD_SHORTCUTS.md`, `../02_Architecture/02_BACKEND_GO.md`, `../02_Architecture/03_FRONTEND_REACT.md`, `../02_Architecture/05_STATE_AND_PERSISTENCE.md`, `../03_NonFunctional/05_ACCESSIBILITY.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 08 — Theming & Settings

## Goal

Deliver the complete Stage-1/2 visual and control surface: exact token-only themes, live appearance resolution, typed immediate settings, accessible dialogs/menu/shortcuts, and backend-authoritative durable window/layout state that remains extensible for Stage 3.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH08 | sequential | Stage 1 / M1 shell; Stage 2 / M2 action bindings | PH00, PH01, PH02, PH03, PH04, PH05, PH06, PH07, PH09 | once for the Stage-1/2 settings and theming capability set |

## Scope

- Exact canonical token values for Liquid Glass, Material, and Minimal in light/dark modes.
- Auto/Light/Dark resolution and live system-appearance observation across editor, preview, reader, portals, and overlays.
- Stage-1/2 Settings groups and defaults, immediate typed persistence, and safe fallback behavior.
- Accessible Settings, Shortcuts, About, and menu surfaces plus a single platform-aware shortcut registry.
- Backend-owned, write-through window geometry/sidebar persistence and restore; arrangement precedence remains explicitly blocked until resolved.
- F4 additive settings growth for later AI/Providers and AI Context groups without rendering them early.

## Out of scope

- User-authored themes and certified screen-reader/WCAG audits.
- PH09 remote-content enforcement and setting contract; this phase consumes that contract to render the control.
- PH10 i18n implementation; controls become `t()` consumers when it lands.
- PH11 Stage-3 AI settings tabs and PH15 release-version injection; PH08 is not reopened for either consumer.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH08-R01 | Exactly three fixed themes use the canonical token values and one shared layout; every component color, spacing, radius, and font comes from tokens keyed by `data-theme` and `data-mode`. | `01_Product/10_THEMING.md#themes`; `01_Product/10_THEMING.md#token-model`; `01_Product/10_THEMING.md#canonical-theme-tokens` | DD-28; DD-30; no custom themes; bundled fonts | PH08-W01 |
| PH08-R02 | Material/Auto are the defaults; Auto follows OS appearance live, Light/Dark pin it, and invalid persisted values fall back without blocking startup. | `01_Product/10_THEMING.md#appearance-auto-light-dark`; `01_Product/10_THEMING.md#no-custom-themes`; `01_Product/11_SETTINGS.md#defaults` | DD-29; root attributes update editor/preview/reader/portals | PH08-W02 |
| PH08-R03 | The Stage-1/2 Settings dialog and quick settings expose every specified group/value/default, stay synchronized, and persist each typed change immediately without an OK/Cancel commit. | `01_Product/11_SETTINGS.md#settings-surface`; `01_Product/11_SETTINGS.md#appearance-group`; `01_Product/11_SETTINGS.md#editor-group`; `01_Product/11_SETTINGS.md#markdown-group`; `01_Product/11_SETTINGS.md#export-group`; `01_Product/11_SETTINGS.md#content-privacy-group`; `01_Product/11_SETTINGS.md#language-group`; `01_Product/11_SETTINGS.md#defaults` | F4; generic KV; no Stage-3 tabs yet | PH08-W03; PH08-W04 |
| PH08-R04 | Settings persistence remains multi-instance-safe, uses typed registry access, and falls back or fails only according to the accepted persistence policy. | `01_Product/11_SETTINGS.md#persistence`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#multi-instance-db` | DD-08; DD-10; DD-13; F4 | PH08-W03 |
| PH08-R05 | AppMenuBar, Settings, Shortcuts, and About use accessible primitives, trap/restore focus, remain keyboard-navigable, and keep actions reachable under responsive/long-string layouts. | `01_Product/11_SETTINGS.md#settings-surface`; `03_NonFunctional/05_ACCESSIBILITY.md#2-keyboard-operability`; `03_NonFunctional/05_ACCESSIBILITY.md#3-focus-management`; `03_NonFunctional/05_ACCESSIBILITY.md#4-radix-a11y-baseline` | DD-31; DD-36; token-only | PH08-W05 |
| PH08-R06 | One shortcut registry owns action id, binding, label, and scope; platform modifiers, focus scopes, menu labels, tooltips, dialog entries, and chord precedence derive from it. | `01_Product/12_KEYBOARD_SHORTCUTS.md#shortcut-registry`; `01_Product/12_KEYBOARD_SHORTCUTS.md#platform-mapping`; `01_Product/12_KEYBOARD_SHORTCUTS.md#edge-cases` | DD-31; editor/document/global scope; no duplicate bindings | PH08-W06 |
| PH08-R07 | Window geometry and sidebar visibility mutate through `internal/appmodel.SetUILayout`, persist on change, flush pending continuous values on close, and restore before show with last-writer-by-change semantics, independently of unresolved document/view-arrangement precedence. | `02_Architecture/05_STATE_AND_PERSISTENCE.md#window-state`; `02_Architecture/02_BACKEND_GO.md#application-model`; `01_Product/11_SETTINGS.md#persistence` | DD-60; DD-61; DD-62–64 | PH08-W07 |
| PH08-R08 | PH02/PH05/PH06/PH07 actions and settings plug into the menu, shortcut, and settings surfaces without duplicating their behavior or reaching into Monaco/Wails directly. | `01_Product/12_KEYBOARD_SHORTCUTS.md#format-shortcuts`; `01_Product/12_KEYBOARD_SHORTCUTS.md#file-shortcuts`; `01_Product/12_KEYBOARD_SHORTCUTS.md#view-shortcuts` | adapter/command boundaries; F3/F7/F8 | PH08-W06 |
| PH08-R09 | The typed settings registry accepts Stage-3 AI/Providers and AI Context groups additively while Stage-1/2 builds contain no provider UI or network client. | `01_Product/11_SETTINGS.md#settings-surface`; `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open`; `00_Foundation/06_IMPLEMENTATION_STAGES.md#4-what-each-stage-explicitly-does-not-build` | F4; F6; DD-53; additive-only | PH08-W03 |
| PH08-R10 | Persisted application arrangement, persisted per-document mode, and `view.defaultOpenMode` are restored/applied only according to one resolved precedence and transition rule for launch, new window, first open, and reopen. | `02_Architecture/05_STATE_AND_PERSISTENCE.md#window-state`; `01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state`; `01_Product/02_EDITOR_AND_VIEWER_MODES.md#default-open-mode` | DD-10; DD-15; DD-60; blocked by PH08-X01 | PH08-W08 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH08-T01 | App initializes theme | Persisted theme/appearance may be absent or invalid | Read typed values; validate/fallback; resolve Auto against current OS; set root attributes before themed UI settles; start OS watcher only for Auto | Unified theme applies to all surfaces | Invalid input uses Material/Auto; watcher cleanup prevents duplicate subscriptions | PH08-R01, PH08-R02 |
| PH08-T02 | OS appearance changes under Auto | Auto is active and watcher mounted | Resolve new effective mode; update root `data-mode` once; notify dependent editor/render integrations | Editor, preview, reader, portals, and overlays update live | Stale/unmounted listeners do nothing; pinned modes remain unchanged | PH08-R02 |
| PH08-T03 | User changes a setting | Control maps to a typed registered key | Validate; issue backend update; persist; project acknowledged value; update synchronized quick/full controls | Change applies immediately everywhere | Failed write retains last acknowledged value and reports through envelope/toast | PH08-R03, PH08-R04 |
| PH08-T04 | User invokes menu/shortcut/dialog | Registry entry is available in current scope | Resolve platform binding and focus scope; invoke shared action; update all labels from registry | Exactly one intended action fires | Inactive scope is a no-op; collision follows documented focus/chord precedence | PH08-R05, PH08-R06, PH08-R08 |
| PH08-T05 | Sidebar visibility or another non-arrangement discrete layout value changes | Appmodel and settings service are ready | Send SetUILayout for that field; mutate model; persist only the changed key; emit state patch | All projections and future windows observe the last acknowledged non-arrangement value | Persistence failure preserves prior authoritative state/error semantics | PH08-R07 |
| PH08-T06 | Window is resized or closes | A debounced geometry value may be pending | Debounce resize writes; on close flush only that window's pending changed value; never rewrite the whole layout | Last window to change each value wins | A later-closing unchanged window cannot clobber another window's value | PH08-R07 |
| PH08-T07 | New window/application starts | Durable geometry/sidebar values may be absent/invalid | Read and validate geometry/sidebar; apply valid values before show; use specified fallbacks for absent/invalid values | Window opens with durable geometry/sidebar independently of arrangement resolution | Unknown/out-of-range geometry/sidebar values do not prevent open | PH08-R07 |
| PH08-T08 | Launch, new window, first open, or reopen requires an arrangement | PH08-X01 has been resolved and the relevant application/per-document/default values are known | Read the applicable values; apply the resolved precedence for this trigger; persist only mutations required by that rule; project the authoritative arrangement | One deterministic arrangement is visible without discarding unrelated per-document state | Until PH08-X01 is resolved no implementation or test may guess precedence; invalid values follow the resolved fallback | PH08-R10 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH08-C01 | PH08 | `ui/components/`, `ui/widgets/` | Stable token names and root theme/mode attributes | Document lifetime, including portals | Attributes update before dependent theme adapters repaint | `01_Product/10_THEMING.md#token-model` | PH08-R01, PH08-R02 |
| PH08-C02 | PH04, PH05, PH06, PH07, PH09 | PH08 | Feature-owned typed keys/defaults, validation, update actions, and effect contracts for Markdown standard, format/lint, PDF style, default-open mode, remote policy, and configured asset roots | Application lifetime | Each producer defines its contract before PH08 renders/persists the control; PH08 never redefines feature semantics | `01_Product/11_SETTINGS.md#defaults`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema` | PH08-R03, PH08-R04, PH08-R08 |
| PH08-C03 | PH02, PH05, PH06, PH07 | PH08 | Public command/action functions consumed by registry/menu controls | Relevant active-document lifetime | Registry resolves scope before invoking shared action | `01_Product/12_KEYBOARD_SHORTCUTS.md#shortcut-registry` | PH08-R06, PH08-R08 |
| PH08-C04 | PH08 | PH10 | User-facing surfaces expose stable translation keys/overflow-safe layout when i18n is applied | UI lifetime | PH10 replaces literals without restructuring controls | `01_Product/13_I18N.md#i18n-layer`; `01_Product/13_I18N.md#edge-cases` | PH08-R05 |
| PH08-C05 | PH08 | PH11, PH12, PH13, PH14 | Growable settings registry and reserved AI group insertion points | Application/repository lifetime | Additive groups/tables only; no Stage-3 rendering early | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open` | PH08-R09 |
| PH08-C06 | PH08 | PH15 | About dialog has one version display input; PH15 supplies `AppVersion` | About-dialog lifetime | Display reads injected value; no second version constant | `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#1-version-injection` | PH08-R05 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-THEME-1 | primary | `01_Product/10_THEMING.md#edge-cases` | PH08-R02 | OS change under Auto updates tokens live once. | `frontend/src/logic/theme/theme.test.ts::auto system change (EC-THEME-1)` |
| EC-THEME-2 | primary | `01_Product/10_THEMING.md#edge-cases` | PH08-R01, PH08-R02 | Reader restyles live without exposing chrome. | `frontend/src/logic/theme/theme.test.ts::reader switch (EC-THEME-2)` |
| EC-THEME-3 | primary | `01_Product/10_THEMING.md#edge-cases` | PH08-R02, PH08-R04 | Missing/invalid theme values use Material/Auto. | `frontend/src/logic/theme/theme.test.ts::invalid fallback (EC-THEME-3)` |
| EC-SET-2 | regression | `01_Product/11_SETTINGS.md#edge-cases` | PH08-R04 | Corrupt/newer schema follows the resolved PH00 persistence policy. | `internal/settings/settings_test.go::TestSchemaFailure (EC-SET-2)` |
| EC-SET-5 | primary | `01_Product/11_SETTINGS.md#edge-cases` | PH08-R07, PH08-R10 | New window/launch restores geometry/sidebar before show and, after PH08-X01 is resolved, applies arrangement by the exact precedence rule. | `internal/application/window_state_test.go::TestRestoreBeforeShow (EC-SET-5)` |
| EC-SET-6 | primary | `01_Product/11_SETTINGS.md#edge-cases` | PH08-R07 | Last writer by change wins; closing unchanged window cannot clobber it. | `internal/application/window_state_test.go::TestLastWriterByChange (EC-SET-6)` |
| EC-SET-7 | primary | `01_Product/11_SETTINGS.md#edge-cases` | PH08-R07, PH08-R10 | Invalid geometry/sidebar values fall back and, after PH08-X01 is resolved, invalid arrangement inputs follow its defined fallback without blocking open. | `internal/application/window_state_test.go::TestInvalidLayoutFallback (EC-SET-7)` |
| EC-I18N-3 | precursor | `01_Product/13_I18N.md#edge-cases` | PH08-R05 | Dialog/menu actions remain reachable under long-string fixtures. | `frontend/e2e/settings.spec.ts::long strings (EC-I18N-3)` |

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH08-W01 | Author canonical three-theme token sets. | M | `ui/styles/` | visual baselines | PH08-R01 | PH00 token skeleton; frozen mockup |
| PH08-W02 | Resolve/apply appearance and watch system changes. | M | `logic/theme/`; `logic/hooks/`; `logic/store/` | system-theme fixtures | PH08-R02 | PH08-W01 |
| PH08-W03 | Compose feature-owned typed settings/defaults and preserve additive registry growth. | M | `internal/settings/`; `logic/adapter/`; `logic/store/` | generated bindings if signatures change | PH08-R03, PH08-R04, PH08-R09 | PH00 settings contract; PH04/PH05/PH06/PH07/PH09 typed setting contracts |
| PH08-W04 | Build Stage-1/2 Settings groups and synchronized quick controls. | M | `ui/widgets/`; `ui/primitives/`; `logic/store/` | responsive fixtures | PH08-R03, PH08-R05 | PH08-W02; PH08-W03 |
| PH08-W05 | Build accessible menu, Settings, Shortcuts, and About surfaces. | M | `ui/widgets/`; `ui/components/`; `ui/primitives/` | mockup baselines | PH08-R05 | PH08-W01; PH08-W04 |
| PH08-W06 | Implement registry, platform/scope/chord resolution, and action bindings. | M | `logic/hooks/`; `ui/widgets/`; `ui/components/` | registry fixtures | PH08-R06, PH08-R08 | PH02/PH05/PH06/PH07 action contracts; PH08-W05 |
| PH08-W07 | Persist and restore backend-authoritative geometry/sidebar state. | M | `internal/appmodel/`; `internal/settings/`; `internal/application/`; `logic/adapter/`; `logic/store/` | `main.go`; window lifecycle evidence | PH08-R07 | PH01 layout contract; PH00 settings registry |
| PH08-W08 | Apply and prove the resolved arrangement/default/per-document precedence. | M | `internal/appmodel/`; `internal/settings/`; `internal/application/`; `logic/adapter/`; `logic/store/` | precedence matrix fixtures | PH08-R10 | PH08-W07; PH02 view-state contract; PH07 default-mode contract; PH08-X01 resolution |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH08-E01 | PH08-R01, PH08-R02 | automated | theme/token architecture tests and `just verify-ui` | 3 themes x light/dark; 375/768/1280 | tester | current HEAD | yes |
| PH08-E02 | PH08-R03, PH08-R04, PH08-R09 | automated | typed settings/default/round-trip/additive-growth suites | multi-instance | tester | current HEAD | yes |
| PH08-E03 | PH08-R05, PH08-R06, PH08-R08 | automated | keyboard/focus/registry/action integration suites | macOS and Windows/Linux mapping | tester | current HEAD | yes |
| PH08-E04 | PH08-R07 | automated | geometry/sidebar persistence, deferred resize, close flush, and multi-window ordering tests | all | tester | current HEAD | yes |
| PH08-E05 | PH08-R01, PH08-R02, PH08-R05, PH08-R07 | real-runtime | `docs/phase-evidence/PH08-runtime.md` | native Wails on macOS, Windows, Linux | tester | current release candidate | yes |
| PH08-E06 | PH08-R01, PH08-R05 | human | `docs/phase-evidence/PH08-visual-approval.md` | frozen mockup; all responsive widths | product owner | current release candidate | yes |
| PH08-E07 | PH08-R10 | automated | launch/new-window/first-open/reopen precedence matrix with invalid-value cases | all application and document arrangement inputs | tester | current HEAD after PH08-X01 resolution | yes |

## Open specification conflicts

| ID | Conflicting or missing sources | Required decision | Blocked requirements |
|---|---|---|---|
| PH08-X01 | `02_Architecture/05_STATE_AND_PERSISTENCE.md#window-state` persists application-level `ui.viewArrangement` and a separate per-document view mode, while `01_Product/02_EDITOR_AND_VIEWER_MODES.md#default-open-mode` applies a default on file-system open; no accepted source defines precedence when these values disagree. | Define precedence and transition behavior among restored application arrangement, persisted per-document mode, and default-open mode for launch, new-window, first-open, and reopen paths. | PH08-R10 |

## Clarification revision

2026-07-21 — Split the former L settings task into bounded registry, UI, accessibility, shortcut, geometry, and arrangement-precedence capabilities. Reversed feature-setting contracts so PH04/PH05/PH06/PH07/PH09 produce semantics and PH08 composes their controls, kept geometry/sidebar work executable while arrangement precedence remains blocked, and preserved the PH11 additive-registry seam without reopening PH08.
