# STORY-062 — Ship the ten theme tokens STORY-058 left out

**STATUS:** planned — ready to build.
**Phase:** 02

## What you'll be able to do

Nothing new appears on screen, and that is the point: this story makes the palette complete so the
stories after it have something to build on. Ten tokens that the Tier-A mockup uses everywhere —
window backdrop, raised surfaces, the two stroke weights, muted and faint text, the hover wash and
the assistant's user bubble — are declared for all six palettes and become readable through
`getComputedStyle(document.documentElement)`. The visible consequence arrives in STORY-059, where
`--stroke` and `--hover` become Monaco's widget border and current-line highlight, and in Phase 03,
where the components that need `--surface-2`, `--faint` and the rest are drawn.

Scope is exactly those ten rows of one table. **This is not a re-plan of STORY-058** — everything
STORY-058 built stays as it is.

## How it works now

- `frontend/src/ui/styles/tokens.css` declares 108 distinct custom properties across eight selector
  blocks: `:root` (which *is* Material light — there is no `[data-theme='material']` selector, because
  Material is the base), `:root[data-theme='glass']` and `:root[data-theme='minimal']` for the
  theme-identity overrides, `:root[data-mode='dark']` for the shared dark inversion, and the four
  `[data-theme][data-mode]` combinations at lines 161–192. A `@media (prefers-reduced-motion: reduce)`
  block at line 193 collapses the three duration tokens.
- Ten tokens named by the rule below have **zero** occurrences anywhere under `frontend/src/`:
  `--canvas`, `--elevated`, `--surface-2`, `--surface-3`, `--stroke`, `--stroke-soft`, `--muted`,
  `--faint`, `--hover`, `--user-bubble`. The other thirteen rows of the same table are all present.
- Why they are missing: STORY-058 copied this rule with 11 of its 24 table rows. The implementer built
  exactly what was in front of them. `just story-check 058` reports it; nothing in 2026-07 could,
  because no check counted table rows and the story's static-analysis gate had recorded `exit 5,
  0 findings` and could not fail. Both are written up in `../plan/KNOWN_ISSUES.md` items 6 and 14.
- `frontend/src/ui/styles/tokens.test.ts` already asserts computed custom-property values by mounting
  a document element with `data-theme` and `data-mode` set — it does not scan the stylesheet source.
  Extend that file; do not add a new pattern.
- The colour-literal scan in `just archtest` (`frontend/scripts/archtest.mjs`) permits colour literals
  **only** inside `tokens.css`. Every value added here therefore belongs in that file and nowhere else.

## Rules this story owns


### Each theme has one accent, one radius and one font across both appearances {#theme-identity-is-stable}
*(from `spec/product/themes-and-appearance.md#theme-identity-is-stable` — copied verbatim)*

- Within a theme, `--accent`, `--win-radius`, `--font` and the blur and shadow character are the same in
  light and dark. Only surfaces and text invert.

| Token | Liquid Glass | Material | Minimal |
|---|---|---|---|
| `--accent` | `#7aa2ff` | `#4f6bed` | `#10b981` |
| `--accent2` (gradients only) | `#c58bff` | `#4f6bed` | `#10b981` |
| `--accent-ink` (text on `--accent-soft`) | `#cdd8ff` | `#0a1a52` | `#047857` |
| `--accent-soft` | `rgba(122,162,255,.16)` | `#dfe4ff` | `#ecfdf5` |
| `--accent-contrast` (text on `--accent`) | `#0b1024` | `#ffffff` | `#ffffff` |
| `--canvas` (window backdrop) | aurora: radials `#3b2f7a` + `#1d4e8f` + `#7a2f6a` over linear `#0d1022 → #0a0d1c → #0b0f1e` | `#d9d7e6` | `#e9e9ec` |
| `--app-bg` | `rgba(255,255,255,.10)` | `#faf8ff` | `#fbfbfa` |
| `--surface` | `rgba(28,30,54,.82)` | `#ffffff` | `#ffffff` |
| `--elevated` | `rgba(28,30,54,.82)` | `#f3f1fb` | `#ffffff` |
| `--surface-2` | `rgba(255,255,255,.07)` | `#eceaf6` | `#f3f3f2` |
| `--surface-3` | `rgba(255,255,255,.16)` | `#e6e3f2` | `#eaeae9` |
| `--stroke` | `rgba(255,255,255,.18)` | `#e3e1ee` | `#e4e4e7` |
| `--stroke-soft` | `rgba(255,255,255,.11)` | `#eceaf6` | `#ececee` |
| `--text` | `#eaf0ff` | `#1b1b22` | `#1f2328` |
| `--muted` | `rgba(234,240,255,.60)` | `#5c5c69` | `#6b7280` |
| `--faint` | `rgba(234,240,255,.32)` | `#9aa1ab` | `#9aa1ab` |
| `--hover` | `rgba(255,255,255,.16)` | `rgba(0,0,0,.05)` | `rgba(0,0,0,.04)` |
| `--user-bubble` | `rgba(122,162,255,.14)` | `#dfe4ff` | `#ecfdf5` |
| `--win-radius` | `16px` | `16px` | `12px` |
| `--win-shadow` | `0 24px 80px rgba(0,0,0,.55)` | `0 12px 32px rgba(27,27,34,.16)` | `0 8px 24px rgba(31,35,40,.10)` |
| `--blur` | `blur(28px) saturate(160%)` | `none` | `none` |
| `--font` | system stack — `-apple-system, "SF Pro Display", "Segoe UI", Inter, …` | `"Roboto", "Segoe UI", Inter, …` | `"Inter", -apple-system, …` |
| `--mono` | `"SF Mono", "JetBrains Mono", ui-monospace, …` | same | same |

The values above are each theme's **native** appearance — Glass dark, Material light, Minimal light. The
counterpart appearance inverts surfaces and text and keeps everything else.

Examples: Material dark keeps `--accent: #4f6bed` and `--win-radius: 16px` · Material dark with a
different accent → the theme reads as a fourth theme rather than the same one at night.

## Implementation plan

1. Add the ten missing tokens to `:root` in `tokens.css`, using the **Material** column of the table
   above — `:root` is the Material light palette, so the Material value is the base value.
2. Add the Liquid Glass values to `:root[data-theme='glass']` and the Minimal values to
   `:root[data-theme='minimal']`, but **only where they differ from the base**. `--win-radius` is
   already handled this way and is the model to follow.
3. Decide each token's dark counterpart and add it to `:root[data-mode='dark']` and to the four
   `[data-theme][data-mode]` blocks, following the rule's own statement that the table gives each
   theme's **native** appearance — Glass dark, Material light, Minimal light — and that the
   counterpart appearance *inverts surfaces and text and keeps everything else*. `--canvas`,
   `--elevated`, `--surface-2`, `--surface-3`, `--stroke`, `--stroke-soft`, `--muted`, `--faint` and
   `--hover` are surface-and-text tokens and therefore invert; `--user-bubble` is an accent
   derivative and follows `--accent-soft`, which does not.
4. Where a dark counterpart is not derivable from the rule — Glass light's `--canvas`, whose native
   value is an aurora gradient of three radials over a linear ramp — **stop and ask** rather than
   inventing a colour. A value invented here becomes a value nobody can trace to the table.
5. Extend `tokens.test.ts` with one test that reads all ten tokens in all six palettes and asserts
   each resolves to a non-empty value, and one that asserts the identity subset is stable across
   light and dark within a theme.
6. Change nothing else. No component consumes these tokens yet; making one consume them is STORY-059
   or Phase 03, and doing it here widens the diff past what the rule requires.

## Where the code goes

- `frontend/src/ui/styles/tokens.css` — the ten declarations, added to the eight existing palette
  blocks. No new selector block, and no new file.
- `frontend/src/ui/styles/tokens.test.ts` — two added tests asserting computed values.

Nothing else changes. Not `base.css`, not a widget, not a component, not `en.json` — these tokens have
no user-visible string and no consumer yet. If a change seems to need one, that is a signal the story
has drifted into STORY-059.

Relevant patterns: [adding a theme token](../architecture/patterns/adding-a-theme-token.md) — read it
first; it is exactly this job — and [writing a test](../architecture/patterns/writing-a-test.md).

## Technical constraints


### Only the adapter imports `wailsjs/` {#only-the-adapter-imports-wailsjs}
*(from `architecture/rules.md#only-the-adapter-imports-wailsjs` — copied verbatim)*

**Applies to:** `frontend/src/**`
**Enforced by:** `just archtest` (ESLint `no-restricted-imports`)

- Files under `frontend/src/logic/adapter/` may import from `wailsjs/`. No other file may — not a
  component, a widget, a slice, a thunk, a hook, or a utility.
- Each generated binding is wrapped once, in `guardArity(name, bound)`, and exposed as a method on an
  adapter singleton.

Examples: `import { GetState } from '../../wailsjs/go/appmodel/AppModelHandler'` inside `EditorView.tsx`
→ rejected by lint · the same import inside `logic/adapter/services.ts` → correct.

*Why:* `wailsjs/` is generated and its shape changes with every backend signature change. One wrapping
layer means a signature change has one place to fix, and it is also the only seam the tests can mock —
a component that imports the binding directly cannot be tested without a running Go process.

*Do instead of:* importing a binding directly "just for one call" · mocking `wailsjs/` in a test.

---

### No colour outside a token {#no-colour-outside-a-token}
*(from `architecture/rules.md#no-colour-outside-a-token` — copied verbatim)*

**Applies to:** `frontend/src/ui/**`
**Enforced by:** `just archtest` (colour-literal scan)

- No hex colour, `rgb()`, `rgba()`, `hsl()` or CSS colour keyword appears anywhere under
  `frontend/src/ui/` except in `frontend/src/ui/styles/tokens.css`.
- A component reads `var(--token-name)`. A new visual value is a new token first.

Examples: `border: 1px solid var(--editor-pane-border-color)` → correct · `color: #16201e` in a module
CSS file → rejected · `background: white` in a `.tsx` inline style → rejected.

*Why:* there are three themes and each has a light and a dark appearance — six combinations. A literal
colour is correct in at most one of them, and it is invisible in the other five until someone switches.

*Do instead of:* a literal "just for the disabled state" · a colour in an inline `style` prop.

---

### The theme is set on the document element only {#theme-on-the-root-element}
*(from `architecture/rules.md#theme-on-the-root-element` — copied verbatim)*

**Applies to:** `frontend/src/logic/theme/**`, `frontend/src/ui/**`
**Enforced by:** review

- `data-theme` and `data-mode` are set on `document.documentElement` and nowhere else.
- `data-mode` is always the resolved value `light` or `dark`. The literal `auto` never reaches the DOM.

Examples: a dropdown rendered through a Radix portal inherits the theme because it is inside the same
document element · setting `data-theme` on the app shell instead → every portal renders unthemed.

*Why:* Radix renders overlays into a portal at the end of `<body>`, outside the React tree. Only an
attribute on the root element covers them.

*Do instead of:* wrapping the app in a themed div · passing the theme down as a prop to style each
component.

---

### Every user-visible string goes through `t()` {#strings-go-through-t}
*(from `architecture/rules.md#strings-go-through-t` — copied verbatim)*

**Applies to:** `frontend/src/**`
**Enforced by:** `just archtest` (ESLint), review

- Text a user reads is a key in `frontend/src/i18n/locales/en.json`, rendered with `t('key')`.
- This includes button labels, headings, placeholder text, empty-state copy, error messages, tooltips,
  and accessible labels.

Examples: `t('editor.emptyState.title')` → correct · `<button>Save</button>` → rejected ·
`aria-label="Close tab"` → rejected, `aria-label={t('tabs.close')}` → correct.

*Why:* a hard-coded string is invisible to translation and, more immediately, invisible to review — the
catalogue is where all the product's copy can be read and made consistent in one sitting.

*Do instead of:* a literal "because it is only a placeholder" · a template literal assembling a sentence
from fragments, which cannot be translated as one.

---

### The shell reserves three regions {#shell-reserves-three-regions}
*(from `architecture/rules.md#shell-reserves-three-regions` — copied verbatim)*

**Applies to:** `frontend/src/ui/widgets/**`, `frontend/src/ui/styles/**`
**Enforced by:** review

- `AppShell` lays out a left region (the file tree), a centre region (the document area) and a right
  region (the assistant), and the right region's grid slot, width token and show/hide plumbing exist
  even while nothing renders into it.
- **While** the assistant does not exist, the right region has width `var(--shell-assistant-collapsed-width)`,
  which is `0`.

Examples: opening the assistant later sets one token and mounts one child → correct · adding a third
column to the grid when the assistant is built → rejected, because every layout test and every width
breakpoint written before then has to be redone.

*Why:* changing the shell's structure late invalidates the responsive verification of every screen built
on top of it.

*Do instead of:* a two-column layout with the intention of "adding a column when we get there".

---

### The app makes no background network call {#no-background-network}
*(from `architecture/rules.md#no-background-network` — copied verbatim)*

**Applies to:** `**`
**Enforced by:** `just archtest`, review

- The app makes **no** unsolicited outbound request: no update check, no telemetry, no crash report, no
  font, plugin or theme fetch, no CDN asset.
- Before the assistant phases exist, the app makes no outbound request at all.
- **When** the assistant exists, the only outbound requests are inferences to the provider the user
  configured, and only in direct response to the user invoking an action or sending a message. The
  default provider is a local one, so a default install still talks to nothing off the machine.
- Remote images and stylesheets referenced *inside a user's document* are a separate matter: the user
  chooses Ask, Always allow or Always block, and this rule does not cover them.

Examples: launching the app with a network monitor open and using it for five minutes → zero requests ·
a `<link>` to Google Fonts in `index.html` → rejected · `fetch('https://api.github.com/…')` to check for
a new version → rejected.

*Why:* people write private things in a text editor. "It only sends a version number" is a promise the
user cannot verify, so the product's answer is that there is nothing to verify.

*Do instead of:* an opt-out update check · loading KaTeX or Mermaid from a CDN instead of bundling it ·
a "anonymous usage statistics" toggle.

---

### A test proves behaviour, not a document {#tests-prove-behaviour}
*(from `architecture/rules.md#tests-prove-behaviour` — copied verbatim)*

**Applies to:** `internal/**/*_test.go`, `main_test.go`, `frontend/src/**/*.test.ts`, `frontend/src/**/*.test.tsx`
**Enforced by:** review

- A test asserts a user-visible outcome or a returned value. It does not assert on the contents of a
  Markdown file, the `justfile`, a CI workflow, or anything under `.claude/`.
- The only permitted source-scanning tests are the architecture invariants in this file, which cannot be
  checked any other way.
- The component under test is rendered, not mocked. Collaborators are mocked at `logic/adapter`, never at
  `wailsjs/`.
- Frontend queries are by accessible role, label or text — not by class name or test id.
- Go tests run under `-race` and use fakes satisfying the package's own interface, not a real database.

Examples: `expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()` → correct ·
`jest.mock('./AppShell')` inside `AppShell.test.tsx` → rejected, and this mistake is live in the
repository today · a Go test asserting a phase document contains a heading → rejected.

*Why:* a test that reads a document passes while the software is broken, and roughly 4,200 lines of
exactly that were deleted from this repository on 2026-07-25. A mocked subject asserts that the mock
works.

*Do instead of:* asserting a function was called · snapshotting a large DOM tree as the primary
assertion · deleting a failing test to make the suite green.

## Definition of done

### Baseline

Before any source edit, `/build-story 062` runs `just baseline STORY-062`. **Read the verdict column,
not just the exit column.** A gate marked `UNRELIABLE` — non-zero exit with zero findings — is a hard
stop: that is exactly the condition STORY-058 recorded and built through, and it is why this story
exists. `just lint` exits 0 today, so a non-zero here is new and is a defect to fix before starting.

### Mechanical

| # | Check | Command | Passes when |
|---|---|---|---|
| M1 | Format | `just fmt-check` | exit 0 |
| M2 | Types | `just typecheck` | exit 0, or exactly the baseline error set |
| M3 | Static analysis | `just lint` | no finding absent from the baseline, **and the gate exited 0** |
| M4 | Tests | `just test` | every baseline-passing test still passes; all new tests pass |
| M5 | Architecture | `just archtest` | exit 0. Never diffed, never weakened, never suppressed |
| M6 | Build | `just frontend-build` and `just build` | exit 0 |
| M7 | New code is tested | manual, against the diff | both added tests fail if a token is removed |
| M8 | No placeholders added | `git diff <sha>..HEAD` | no `TODO`, no token declared as `initial` or `unset` to fill a gap |
| M9 | Gate configs untouched | `git diff --name-only <sha>..HEAD` | no change to `frontend/scripts/archtest-allowlist.json`, `.golangci.yml`, an eslint config, the `justfile`, `.github/` or `lefthook.yml` |
| M10 | Normative docs untouched | `git diff --name-only <sha>..HEAD -- docs/delivery/spec/ docs/delivery/architecture/` | empty |
| M11 | Descriptive docs current | manual | `../plan/KNOWN_ISSUES.md` item 6's "still incomplete" paragraph is updated to say the ten tokens shipped |
| M12 | Every `Proves:` tag resolves | `just spec-check` | no tag names an anchor that does not exist |
| M13 | Scope declared | `git diff --name-only <sha>..HEAD` | exactly the two files in `## Where the code goes` |

### This story — rule-to-evidence map

| Rule | Proven by | Kind | Must not |
|---|---|---|---|
| `themes-and-appearance#theme-identity-is-stable` | `frontend/src/ui/styles/tokens.test.ts::resolvesEveryTableTokenInAllSixPalettes` | unit | assert that `tokens.css` *contains* a token name — read the computed value off the root element in each palette, or the test passes on a commented-out declaration |
| `themes-and-appearance#theme-identity-is-stable` | `frontend/src/ui/styles/tokens.test.ts::keepsIdentityTokensStableBetweenLightAndDark` | unit | compare only one theme — the rule is about all three, and Material is the one whose base values live in `:root` rather than a theme selector |

Each test's first comment line carries `// Proves: themes-and-appearance#theme-identity-is-stable`.

### Walkthrough — a person does this on a real build

| # | Do this | Expect | What actually happened |
|---|---|---|---|
| 1 | `just build`, launch the binary, open the webview inspector on the document element | All twenty-three tokens from the table resolve to a value. Specifically `--faint` is non-empty, where before this story it resolved to nothing | |
| 2 | Switch to Liquid Glass, then Dark | `--stroke` and `--stroke-soft` both change, and `--accent` stays `#7aa2ff` | |
| 3 | Switch to Material Dark | `--accent` is still `#4f6bed` and `--win-radius` is still `16px` — identity is stable; only surfaces and text inverted | |
| 4 | Look at the window | **Nothing visible changed.** A visible change means a component was edited, which is outside this story's scope | |
| 5 | `grep -c -- '--faint:' frontend/src/ui/styles/tokens.css` | non-zero — the concrete test that the gap closed | |

### Unblocks

STORY-059, which cannot be built before this one: `#editor-theme-is-generated` maps
`editorWidget.border` from `--stroke` and `editor.lineHighlightBackground` from `--hover`, and both
were absent. Generating six Monaco themes from an incomplete palette would repeat STORY-058's failure
one layer up, in a place where it is even harder to see.

STORY-061's first-frame check also depends on this: a first paint in "the persisted palette" is only
meaningful once the palette is complete.

### Scope

Files touched outside `## Where the code goes`, and why. `none` is the expected answer.
