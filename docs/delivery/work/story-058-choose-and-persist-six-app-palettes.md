# STORY-058 — Choose and persist six complete app palettes

## What you'll be able to do

Open the compact Settings menu or the minimum Appearance dialog and choose Liquid Glass, Material, or Minimal with Auto, Light, or Dark appearance. Both controls show one persisted choice and update together after the write succeeds. App chrome, preview, and the status bar receive a complete root-token palette. Missing or invalid stored values are silently Material and Auto.

STORY-059 owns Monaco-theme generation; STORY-060 owns live OS observation while Auto is chosen; STORY-061 owns persisted first paint. In this story, Auto resolves once when the in-session theme is initialized, while its persisted choice stays Auto.

## How it works now

- internal/settings/model.go:6-57 defines the three allowed themes, three appearance choices, and Material/Auto defaults.
- internal/settings/service.go:30-56 reads the complete typed group; lines 121-132 normalize missing, malformed, and future persisted values to those defaults; lines 159-170 reject invalid writes.
- internal/settings/repository_sqlite.go:41-56 reads the existing KV keys with explicit defaults and lines 106-115 writes the full appearance group. A failure travels through service.go:59-71 and handler.go:43-57.
- frontend/src/logic/adapter/index.ts:1-30 exposes the guarded settings adapter. services.ts:28-63 guards and unwraps the read/write calls. The dev mock persists its cloned group at frontend/src/dev/bridge-mock/go/settings/SettingsHandler.ts:42-95.
- No theme state or appearance surface exists. App.tsx:24-96 only bootstraps the app-model projection; AppShell.tsx:16-27 only reserves its three layout regions; tokens.css:1-65 has layout tokens but no palette; base.css:1-10 leaves browser defaults.
- The current EditorView contains unrelated literal-copy debt at lines 166-169, 252-254, and 276-279. This story must not broaden into that remediation.

A setting is authoritative only after settingsAdapter.updateAppearance resolves. On rejection leave both controls and root attributes unchanged; the existing unwrap path reports the error. Successful theme changes are silent. STORY-061, not this story, solves the launch-frame flash.

## Rules this story owns

### Three themes, and no way to add a fourth {#three-themes}
*(from docs/delivery/spec/product/themes-and-appearance.md#three-themes — copied verbatim)*

- The app ships exactly three themes: glass (Liquid Glass), material (Material) and minimal (Minimal). The default is **Material**.
- There is no theme editor, no imported theme file, and no custom accent colour.

Examples: a persisted theme of material → Material · a persisted theme of dracula → falls back to Material, see #invalid-settings-fall-back.

*Why no custom accent:* each theme's accent is part of its identity and is chosen to stay legible against that theme's own surfaces. A user-chosen hue would have to be validated against six backgrounds, three status colours and both syntax palettes, and there is no way to do that at the moment they pick it.

### The choice and the resolved value are stored separately {#choice-and-resolved-are-separate}
*(from docs/delivery/spec/product/themes-and-appearance.md#choice-and-resolved-are-separate — copied verbatim)*

- Two values are kept: the user's **choice**, one of auto, light, dark; and the **resolved** appearance, one of light, dark.
- The data-mode attribute always carries the resolved value. The literal string auto never reaches the DOM.
- **When** the appearance is read back from storage, it is the choice that is read.

Examples: choice auto on a light system → stored choice auto, data-mode="light" · restart on a now-dark system → still auto, now data-mode="dark" · storing only light because that is what it resolved to on first run → Auto is silently destroyed and the user's setting never worked.

### Every visual value is a token on the root element {#tokens-on-the-root-element}
*(from docs/delivery/spec/product/themes-and-appearance.md#tokens-on-the-root-element — copied verbatim)*

- Colours, spacing, radii, fonts, shadows, durations and stacking levels are CSS custom properties whose values are selected by data-theme and data-mode on document.documentElement.
- Both attributes are set on the document element and on no other element.
- No component contains a colour literal.

Examples: a dropdown rendered through a portal at the end of body picks up the theme, because the attribute is above it · setting the attributes on the app shell instead → every menu, tooltip and toast renders unthemed.

### Each theme has one accent, one radius and one font across both appearances {#theme-identity-is-stable}
*(from docs/delivery/spec/product/themes-and-appearance.md#theme-identity-is-stable — copied verbatim)*

- Within a theme, --accent, --win-radius, --font and the blur and shadow character are the same in light and dark. Only surfaces and text invert.

| Token | Liquid Glass | Material | Minimal |
|---|---|---|---|
| --accent | #7aa2ff | #4f6bed | #10b981 |
| --accent2 (gradients only) | #c58bff | #4f6bed | #10b981 |
| --accent-ink | #cdd8ff | #0a1a52 | #047857 |
| --accent-soft | rgba(122,162,255,.16) | #dfe4ff | #ecfdf5 |
| --accent-contrast | #0b1024 | #ffffff | #ffffff |
| --win-radius | 16px | 16px | 12px |
| --win-shadow | 0 24px 80px rgba(0,0,0,.55) | 0 12px 32px rgba(27,27,34,.16) | 0 8px 24px rgba(31,35,40,.10) |
| --blur | blur(28px) saturate(160%) | none | none |
| --font | system stack | Roboto stack | Inter stack |
| --mono | SF Mono, JetBrains Mono, ui-monospace | same | same |

The values above are each theme's **native** appearance — Glass dark, Material light, Minimal light. The counterpart appearance inverts surfaces and text and keeps everything else.

Examples: Material dark keeps --accent: #4f6bed and --win-radius: 16px · Material dark with a different accent → the theme reads as a fourth theme rather than the same one at night.

### Roboto and Inter are bundled {#fonts-are-bundled}
*(from docs/delivery/spec/product/themes-and-appearance.md#fonts-are-bundled — copied verbatim)*

- Roboto and Inter ship as woff2 subsets in frontend/src/ui/fonts/ and are loaded from the bundle.
- Nothing is fetched at runtime.

Examples: the app launched with no network → Material still renders in Roboto · the fonts left unbundled → Material and Minimal both fall back to the same system stack and two of the three themes stop being distinguishable, which is checkable rather than a matter of taste.

### Status colours follow the appearance, not the theme {#status-colours-follow-appearance}
*(from docs/delivery/spec/product/themes-and-appearance.md#status-colours-follow-appearance — copied verbatim)*

- --ok, --warn and --err have two values each, keyed by data-mode only.

| Token | Light | Dark |
|---|---|---|
| --ok | #1f8a54 | #39d98a |
| --warn | #b7791f | #ffcf6b |
| --err | #b3261e | #ff7a90 |

Examples: an error toast in Minimal light and in Material light → the same red.

### Selection, focus and scrollbars are tokens {#interaction-tokens}
*(from docs/delivery/spec/product/themes-and-appearance.md#interaction-tokens — copied verbatim)*

- --selection-bg and --selection-fg set the text-selection colours, and they apply to ::selection in the preview **and** to the editor's own selection colour.
- --focus-ring is a two-layer ring, 0 0 0 2px var(--app-bg), 0 0 0 4px var(--accent), so it reads on every surface.
- --scrollbar-track, --scrollbar-thumb and --scrollbar-thumb-hover style the scrollbars.

Examples: selecting a paragraph in dark Liquid Glass → the app's selection colour, not the operating system's default blue · six palettes shipped with default operating-system scrollbars → six palettes that all look unfinished.

### Overlay stacking is a fixed scale {#stacking-scale}
*(from docs/delivery/spec/product/themes-and-appearance.md#stacking-scale — copied verbatim)*

- Nothing sets a numeric z-index. Every stacked surface uses one of eight tokens.

| Token | Value | Used by |
|---|---|---|
| --z-base | 1 | raised in-flow content |
| --z-sticky | 10 | sticky headers, tab strip |
| --z-resize | 20 | window resize zones |
| --z-dropdown | 30 | menus and comboboxes |
| --z-overlay | 60 | modal scrim |
| --z-modal | 70 | dialogs |
| --z-popover | 80 | tooltips/popovers |
| --z-toast | 90 | notifications |

Examples: an error raised by a dialog → the toast is visible above the dialog, because --z-toast exceeds --z-modal.

### Motion is tokenised and the theme flip is not animated {#motion-tokens}
*(from docs/delivery/spec/product/themes-and-appearance.md#motion-tokens — copied verbatim)*

- Every animated property uses --dur-fast (120ms), --dur-base (180ms) or --dur-slow (300ms), with --ease-out (cubic-bezier(.2,.8,.2,1)) or --ease-in-out (cubic-bezier(.4,0,.2,1)).
- **While** the operating system reports prefers-reduced-motion: reduce, one rule sets every duration token to 0ms.
- Switching theme or appearance is **not** animated.

Examples: a menu opening → 120 ms · switching from Material light to Glass dark → instant · the same switch cross-faded over 300 ms → six palettes changing at once reads as a rendering glitch, not a transition.

## Implementation plan

1. Add frontend/src/logic/theme/ with typed allowed values, normalization, a pure resolver returning light or dark, and a root-only attribute applier. It reads Auto as the persisted choice but does not subscribe to system changes; STORY-060 adds that watcher.
2. Add the complete six-palette root token table to frontend/src/ui/styles/tokens.css: surfaces, text, typography, status, selection, focus, scrollbar, motion and stacking tokens. Restyle base.css and the existing shell/editor/preview/status/menu/toast CSS only with variables; preserve the three AppShell regions.
3. Add woff2 Roboto and Inter subsets in frontend/src/ui/fonts/ and local face declarations plus documented fallback stacks. There is no URL, head link, or runtime fetch.
4. Add widget-owned SettingsMenu and AppearanceDialog controls. Presentational swatch/segmented/dialog pieces accept props only. Both offer exactly three themes and Auto/Light/Dark; Auto says “Follows system”; all visible/accessible copy uses t().
5. The widget reads settingsAdapter.getSettings on mount, normalizes and applies the root palette, then passes the same shared choice to both controls. On action it preserves defaultOpenMode, writes the complete group, and only then changes shared UI/root state. A failed write changes neither.
6. Test the pure theme lifecycle, root-only attributes, keyboard paths, synchronized successful/rejected writes, and observable token behaviour. Mock at logic/adapter only. Extend the dev mock only if deterministic reset/failure control is needed.
7. Add numbered Phase 02 rows to docs/delivery/plan/testing/live-plan.md for real-build palette, bundled-font/offline, native scrollbar/selection, and reduced-motion checks. STORY-061 owns first-frame screenshots.

## Where the code goes

- frontend/src/logic/theme/*.ts and theme.test.ts — normalize, resolve, and apply root attributes with no store or Wails import.
- frontend/src/ui/styles/tokens.css and base.css — six palettes, faces, selection, scrollbar, motion, stacking, and token-only restyling.
- frontend/src/ui/fonts/*.woff2 — bundled Roboto and Inter subsets.
- frontend/src/ui/widgets/SettingsMenu.tsx, AppearanceDialog.tsx, adjacent CSS/tests — stateful controls calling the existing adapter.
- frontend/src/ui/primitives/ — only reusable prop-driven dialog/swatch pieces.
- frontend/src/i18n/locales/en.json — labels, help, and accessible names.
- frontend/src/App.tsx and App.test.tsx — in-session settings read/application, explicitly not first-paint work.
- docs/delivery/plan/testing/live-plan.md — real-build evidence.

No change belongs in internal/settings, internal/db, generated wailsjs, Redux, or app-model projection: the typed KV-backed command, defaults, validation, bridge envelope, and mock write-through already exist.

## Technical constraints

### Only the adapter imports wailsjs {#only-the-adapter-imports-wailsjs}
**Applies to:** frontend/src/**  
**Enforced by:** just archtest

- Files under frontend/src/logic/adapter/ may import from wailsjs/. No other file may.
- Each generated binding is wrapped once in guardArity and exposed on an adapter singleton.

*Do instead of:* importing a binding directly or mocking wailsjs in a test.

### The envelope is unwrapped in one place {#unwrap-in-one-place}
**Applies to:** frontend/src/logic/**  
**Enforced by:** review

- unwrap(result) is the only code that inspects an apperr result. It raises the error's toast and throws; callers get payload or exception.

*Do instead of:* per-call-site error branches or swallowing an error.

### No colour outside a token {#no-colour-outside-a-token}
**Applies to:** frontend/src/ui/**  
**Enforced by:** just archtest

- No hex colour, rgb(), rgba(), hsl() or CSS colour keyword appears anywhere under frontend/src/ui/ except in frontend/src/ui/styles/tokens.css.
- A component reads var(--token-name). A new visual value is a new token first.

*Do instead of:* a literal disabled-state colour or an inline style colour.

### The theme is set on the document element only {#theme-on-the-root-element}
**Applies to:** frontend/src/logic/theme/**, frontend/src/ui/**  
**Enforced by:** review

- data-theme and data-mode are set on document.documentElement and nowhere else.
- data-mode is always resolved light or dark. The literal auto never reaches the DOM.

*Do instead of:* a themed app-shell wrapper or passing a theme prop to every component.

### Every user-visible string goes through t() {#strings-go-through-t}
**Applies to:** frontend/src/**  
**Enforced by:** just archtest, review

- Text a user reads is a key in frontend/src/i18n/locales/en.json, rendered with t().
- This includes button labels, headings, placeholders, error messages, tooltips and accessible labels.

*Do instead of:* a literal placeholder or template-literal sentence fragments.

### Presentational components take props, not the store {#components-take-props}
**Applies to:** frontend/src/ui/components/**, frontend/src/ui/primitives/**  
**Enforced by:** review

- Nothing under ui/components or ui/primitives imports logic/store or logic/adapter.
- Data and callbacks arrive as props. Wiring happens in ui/widgets.

*Do instead of:* useSelector in a leaf component.

### The shell reserves three regions {#shell-reserves-three-regions}
**Applies to:** frontend/src/ui/widgets/**, frontend/src/ui/styles/**  
**Enforced by:** review

- AppShell lays out left file-tree, centre document, and right assistant regions; the right grid slot, width token, and show/hide plumbing exist even while empty.
- While the assistant does not exist, its right-region width is var(--shell-assistant-collapsed-width), which is 0.

*Do instead of:* a two-column shell intended to grow later.

### A test proves behaviour, not a document {#tests-prove-behaviour}
**Applies to:** frontend/src/**/*.test.ts and frontend/src/**/*.test.tsx  
**Enforced by:** review

- A test asserts a user-visible outcome or returned value, not document contents.
- The subject is rendered, not mocked. Collaborators are mocked at logic/adapter, never wailsjs.
- Frontend queries use accessible role, label, or text, not class or test id.

*Do instead of:* call-count assertions, large snapshots, or deleting failing tests.

Relevant patterns: [adding a theme token](../architecture/patterns/adding-a-theme-token.md), [adding a provider](../architecture/patterns/adding-a-provider.md), and [writing a test](../architecture/patterns/writing-a-test.md).

## Definition of done

### Baseline

Before any source edit, /build-story 058 runs just baseline STORY-058 and records it in ../baselines/story-058.md. A red architecture gate or a failure masking these paths stops the implementation.

### Mechanical

| # | Check | Command | Passes when |
|---|---|---|---|
| M1 | Format | just fmt-check | exit 0 |
| M2 | Types | just typecheck | exit 0, or exact baseline error set |
| M3 | Static analysis | just lint | no finding absent from baseline |
| M4 | Tests | just test | baseline-passing tests remain passing and all new tests pass |
| M5 | Architecture | just archtest | exit 0; never diffed, weakened, or suppressed |
| M6 | Build | just frontend-build and just build | exit 0 |
| M7 | New code tested | manual | every changed source file is tested |
| M8 | No placeholders | git diff baseline..HEAD | no TODO or no-op production logic |
| M9 | Gate configs untouched | git diff --name-only baseline..HEAD | gate configs and .github unchanged |
| M10 | Normative docs untouched | git diff --name-only baseline..HEAD -- docs/delivery/spec/ docs/delivery/architecture/ | empty |
| M11 | Descriptive docs current | manual | live plan updated; no stale descriptive docs |

### This story — rule-to-evidence map

| Rule | Proven by | Kind |
|---|---|---|
| themes-and-appearance#three-themes | normalizesOnlyDocumentedThemes in frontend/src/logic/theme/theme.test.ts | unit |
| themes-and-appearance#choice-and-resolved-are-separate | keepsAutoChoiceWhileApplyingResolvedMode in frontend/src/logic/theme/theme.test.ts | unit |
| themes-and-appearance#tokens-on-the-root-element | setsAttributesOnlyOnDocumentElement in frontend/src/logic/theme/theme.test.ts | unit |
| themes-and-appearance#theme-identity-is-stable | keepsThemeIdentityTokensStableAcrossModes in frontend/src/ui/styles/tokens.test.ts | style |
| themes-and-appearance#fonts-are-bundled | loadsBundledRobotoAndInterFaces in frontend/src/ui/styles/tokens.test.ts | style |
| themes-and-appearance#status-colours-follow-appearance | usesSameStatusTokensForThemesInAMode in frontend/src/ui/styles/tokens.test.ts | style |
| themes-and-appearance#interaction-tokens | exposesSelectionFocusAndScrollbarTokens in frontend/src/ui/styles/tokens.test.ts | style |
| themes-and-appearance#stacking-scale | definesEightNamedStackingTokens in frontend/src/ui/styles/tokens.test.ts | style |
| themes-and-appearance#motion-tokens | removesTokenizedMotionWhenReducedMotionIsRequested in frontend/src/ui/styles/tokens.test.ts | style |
| constraints#every-action-is-reachable-by-keyboard | changesAppearanceFromKeyboardReachableControls in frontend/src/ui/widgets/AppearanceControls.test.tsx | component |
| constraints#every-string-goes-through-t | rendersAppearanceControlLabelsFromCatalogue in frontend/src/ui/widgets/AppearanceControls.test.tsx | component |
| all, end to end | changesBothControlsOnlyAfterPersistedWriteSucceeds in frontend/src/ui/widgets/AppearanceControls.test.tsx | component |

Each test's first line is // Proves: feature#anchor. Style tests assert observable computed custom-property outcomes, never scan source.

### M12 — Added surface visual check

just verify-ui covers the controls at 375, 768, and 1280 px in three themes and two appearances. The live plan covers real bundled-font/offline, native scrollbar, system reduced-motion, and no-network checks.

### Walkthrough — a person does this on a real build (Or Computer Use via Agent)

1. Open a split document, choose **Liquid Glass** then **Dark** from Settings. Chrome, preview, status bar, selection, focus ring, and scrollbar change together; no browser-default white surface or blue selection remains.
2. Open **Appearance**. Liquid Glass and Dark are selected. Use Tab then Space to choose **Minimal** and **Light**; the Settings menu follows after the persisted write succeeds.
3. Choose **Auto** on a dark system. The control says **Follows system**, storage remains Auto, and the root has data-mode="dark", never data-mode="auto".
4. Force a write failure and choose Material. The palette and both controls stay on their prior selection; there is no success toast or half-updated control.
5. At exactly 375 px, tab through every option. Every focusable control has the two-layer ring and no option is clipped. Repeat in six palettes with reduced motion: palette changes are instantaneous.

### Unblocks

STORY-059 consumes the root token table for Monaco and the deferred preview-highlighter stylesheet. STORY-060 adds live system observation without changing the stored-choice contract. STORY-061 uses these attributes and persistence to prevent first-frame flash and run the full real-build visual/offline gate.

