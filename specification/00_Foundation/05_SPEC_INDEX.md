**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder
**Last Updated:** 2026-07-10

# Spec Index (Canonical Clause Anchors)

Stories cite spec clauses as `<file>#<anchor>`. This index lists each product/architecture document
and the **canonical heading anchors** it must contain, so stories authored before/after a document is
written still cite stable ids. Anchors are the GitHub-style slug of the `## N. Heading` text.

## 01_Product

- `01_FUNCTIONAL_REQUIREMENTS.md` — `#fr-editor`, `#fr-viewer`, `#fr-files`, `#fr-workspace`,
  `#fr-tabs`, `#fr-recent`, `#fr-autosave`, `#fr-standards`, `#fr-rendering`, `#fr-format-lint`,
  `#fr-pdf`, `#fr-associations`, `#fr-assets`, `#fr-theming`, `#fr-settings`, `#fr-shortcuts`,
  `#fr-i18n`, `#edge-cases`.
- `02_EDITOR_AND_VIEWER_MODES.md` — `#editor-mode`, `#viewer-reading-mode`, `#split-view`,
  `#view-mode-toggle`, `#per-document-view-state`, `#default-open-mode`.
- `03_FILES_TABS_WORKSPACE.md` — (+ `#drag-and-drop-open`) `#new-open-save`, `#save-as`, `#autosave`, `#dirty-state`,
  `#encoding-and-line-endings`, `#tabs`, `#open-folder`, `#tree-filter`, `#recent`, `#reopen-last`,
  `#multi-instance`.
- `04_MARKDOWN_STANDARDS.md` — `#standard-levels`, `#minimal-commonmark`, `#gfm`, `#full-extensions`,
  `#standard-setting`, `#plugin-mapping`.
- `05_RENDERING_AND_EXTENSIONS.md` — `#pipeline`, `#gfm-features`, `#math-katex`, `#code-highlighting`,
  `#mermaid`, `#components-override`, `#sanitization`, `#preview-debounce`.
- `06_FORMAT_AND_LINT.md` — `#format`, `#compact`, `#lint`, `#lint-rules`, `#on-save`, `#canonical-style`,
  `#problems-surface`.
- `07_PDF_EXPORT.md` — `#export-flow`, `#print-scope`, `#styled-vs-clean`, `#limitations`.
- `08_FILE_ASSOCIATIONS.md` — `#declared-extensions`, `#macos`, `#windows`, `#linux`, `#onfileopen`,
  `#open-in-default-mode`, `#set-as-default`, `#multi-instance-routing`.
- `09_ASSETS_AND_SECURITY.md` — `#relative-path-resolution`, `#allowlist`, `#path-traversal`,
  `#remote-content-policy`, `#banner`, `#csp`.
- `10_THEMING.md` — `#themes`, `#appearance-auto-light-dark`, `#unified-theme`, `#token-model`,
  `#reading-mode-chrome`, `#no-custom-themes`.
- `11_SETTINGS.md` — `#settings-surface`, `#appearance-group`, `#editor-group`, `#markdown-group`,
  `#export-group`, `#content-privacy-group`, `#language-group`, `#persistence`, `#defaults`.
- `12_KEYBOARD_SHORTCUTS.md` — `#shortcut-registry`, `#format-shortcuts`, `#file-shortcuts`,
  `#view-shortcuts`, `#platform-mapping`.
- `13_I18N.md` — `#i18n-layer`, `#string-catalog`, `#adding-a-locale`, `#formatting`.

## 01_Product — LLM assistant (Stage 3)

- `14_LLM_ASSISTANT_OVERVIEW.md` — `#assistant-sidebar`, `#modes-actions-chat`, `#scope-selection-vs-document`,
  `#privacy-and-network`, `#forward-compat`.
- `15_ACTIONS_LIBRARY.md` — `#action-model`, `#proofread`, `#reformat-targets`, `#confluence-wiki`,
  `#article`, `#qa`, `#other-actions`, `#custom-instruction`, `#extensibility`.
- `16_CHAT_AND_AGENTIC_WORKFLOW.md` — `#chat`, `#agentic-loop`, `#tools`, `#tool-scope`, `#edit-proposals`,
  `#apply-and-diff`, `#cancellation`, `#streaming`, `#limits`.
- `17_PROVIDERS_MODELS_SETTINGS.md` — `#provider-kinds`, `#provider-config`, `#auth-env-var`,
  `#model-discovery`, `#verification`, `#inference-params`, `#persistence`, `#defaults-local`.
- `18_TOKENIZER_AND_CONTEXT.md` — `#token-estimation`, `#safety-margin`, `#reply-reserve`, `#fit-meter`,
  `#over-context-strategy`, `#context-budget`, `#history-strategy`.

## 02_Architecture

- `01_SYSTEM_ARCHITECTURE.md` — `#overview`, `#process-model`, `#data-flow`, `#layer-boundaries`.
- `02_BACKEND_GO.md` — `#layering`, `#error-envelope`, `#di-two-phase`, `#packages`, `#dialogs`,
  `#file-io`, `#persistence`, `#long-ops-gate`, `#application-model`.
- `03_FRONTEND_REACT.md` — `#structure`, `#adapter-layer`, `#store`, `#state-ownership`, `#theme`,
  `#components`, `#bridge-mock`, `#markdown-pipeline`.
- `04_WAILS_INTEGRATION.md` — `#embed`, `#bind-enumbind`, `#lifecycle`, `#dialogs-runtime`,
  `#file-associations`, `#file-drop`, `#assetserver-handler`, `#generate-bindings`.
- `05_STATE_AND_PERSISTENCE.md` — `#file-first`, `#in-memory-application-model`, `#kv-schema`,
  `#migrations`, `#recent`, `#window-state`, `#multi-instance-db`.
- `06_ERROR_HANDLING.md` — `#error-codes`, `#wire`, `#result-envelopes`, `#frontend-parseerror`,
  `#toasts`.
- `07_LARGE_FILES_AND_CONCURRENCY.md` — `#large-file-strategy`, `#preview-debounce`, `#gate`,
  `#events-progress`.
- `08_LLM_INTEGRATION.md` — `#overview`, `#provider-abstraction`, `#agent-loop`, `#tool-registry`,
  `#context-budgeter`, `#tokenizer`, `#streaming`, `#gate-and-cancellation`, `#events`, `#error-codes`,
  `#persistence`, `#forward-compat-seams`.

Edge-case ids are defined in `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#edge-cases` and the relevant
feature clause, using the scheme `EC-<AREA>-<N>` where AREA ∈ {DOCS, WS, TABS, RENDER, ASSET, ASSOC,
FMT, LINT, PDF, THEME, SET, I18N, DND, LLM, REL}. The `DND` set is enumerated in
`01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open`; the Stage-3 `LLM` set is enumerated across
`01_Product/14_LLM_ASSISTANT_OVERVIEW.md`, `16_CHAT_AND_AGENTIC_WORKFLOW.md`,
`17_PROVIDERS_MODELS_SETTINGS.md`, and `18_TOKENIZER_AND_CONTEXT.md`; the release `REL` set is
enumerated in `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md#5-edge-cases-rel`.

## 03_NonFunctional / 04_Build_and_Release / 05_Dependencies anchors

These docs use numbered headings; their GitHub-slug anchors include the number. Stories cite them by
the real slug. Registered anchors:

- `03_NonFunctional/02_PERFORMANCE.md` — `#1-startup-budget`, `#2-editor-responsiveness`,
  `#3-preview-debounce-targets`, `#4-large-file-handling`, `#5-bundle-size-monaco`, `#6-memory`.
- `03_NonFunctional/03_SECURITY_AND_PRIVACY.md` — `#1-offline-invariant`,
  `#2-asset-allowlist-and-traversal`, `#3-remote-content-policy`, `#4-webview-csp`, `#5-no-telemetry`,
  `#6-local-logs-only`, `#7-parameterized-queries`, `#8-no-secrets`, `#9-llm-data-flow-and-privacy`.
- `03_NonFunctional/04_OFFLINE.md` — `#1-the-requirement`, `#2-bundled-assets`, `#3-no-cdn-at-runtime`,
  `#4-document-referenced-remote-assets`, `#5-verification-approach`,
  `#6-network-policy-revision-stage-3-llm`.
- `03_NonFunctional/05_ACCESSIBILITY.md` — `#1-v1-scope`, `#2-keyboard-operability`,
  `#3-focus-management`, `#4-radix-a11y-baseline`, `#5-out-of-scope-for-v1`.
- `04_Build_and_Release/01_BUILD_MATRIX.md` — `#1-supported-os-baseline`, `#2-artifact-matrix`,
  `#3-per-os-build-prerequisites`, `#4-cgo-free--pure-go-sqlite`, `#5-why-each-os-builds-on-its-own-runner`,
  `#6-wails-build-flags`, `#7-dev-vs-prod-isdev-folder-isolation`, `#8-signing-notarization-and-install-caveats`.
- `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md` — `#1-declaration-source-wailsjson-fileassociations`,
  `#2-app-icon-requirements`, `#3-macos-cfbundledocumenttypes--infoplist`, `#4-windows-nsis-installer--progid`,
  `#5-linux-desktop--mime--nfpm`, `#6-extension-set-consistency`.
- `04_Build_and_Release/03_CI_AND_HOOKS.md` — `#1-justfile-command-taxonomy`, `#2-git-hooks-lefthook`,
  `#3-ordering-why-frontend-builds-before-go`, `#4-ci-gate-set`, `#5-github-actions-build--release-matrix`,
  `#6-traceability-gate`.
- `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md` — `#1-version-injection`,
  `#2-app-icon-pipeline`, `#3-release-workflow`, `#4-cidev-isolation-from-production-data`,
  `#5-edge-cases-rel`.
- `05_Dependencies/01_GO_DEPENDENCIES.md` — `#1-runtime-dependencies`, `#2-dev--cli-tools-not-linked`,
  `#3-explicit-exclusions`, `#4-pure-go--no-cgo-requirement`, `#5-go-version`.
- `05_Dependencies/02_FRONTEND_DEPENDENCIES.md` — `#1-core-runtime`, `#2-markdown-rendering-pipeline`,
  `#3-format--lint-markdown`, `#4-export--print`, `#5-state-ui-primitives-i18n-utils`, `#6-dev--tooling`,
  `#7-must-bundle-for-offline-assets`, `#8-explicitly-excluded`.
- `05_Dependencies/03_DEPENDENCY_POLICY.md` — `#1-offline--no-cdn-rule`, `#2-no-telemetry--network-dependencies`,
  `#3-license-compatibility-mit`, `#4-version-pinning--lockfiles`, `#5-how-to-add-a-dependency`,
  `#6-avoid-heavy--native-dependencies`, `#7-generated-code-is-not-a-dependency-you-edit`.

> Note: anchors in phase-file story tables are indicative; the `architect` finalizes exact clause
> anchors when authoring each story, validated by `just trace-check`.

## 06_Process_and_Traceability anchors

- `07_PHASE_FORMAT.md` — `#identifiers`, `#required-document-order`, `#phase-metadata`,
  `#requirement-ledger`, `#state-and-transition-model`, `#cross-phase-contracts`,
  `#edge-and-failure-cases`, `#non-normative-work-packages`, `#phase-exit-evidence`,
  `#open-specification-conflicts`, `#clarification-revision`, `#completion-semantics`.
- `02_STORY_FORMAT.md` — `#identifiers`, `#front-matter-schema-copy-exactly`,
  `#body-template-fixed-section-order--copy-exactly`, `#sizing`, `#lifecycle`.
- `03_TRACEABILITY.md` — `#the-chain`, `#traceabilityyaml-schema`,
  `#how-a-test-declares-the-ac-it-proves`, `#the-two-commands`, `#phase-commands`.
