# The launcher — one panel, drawn from the binding

**Requirement**: FR-FT-045, FR-FT-055 (surface governs shape), Constitution I
(the surface artifact is the authority) and VI (every colour from the token
system).
**Decision**: session decision 7 — fix the launcher properly against the
design's `.launcher` / `.lc`: spacing, colours, button styling, card treatment.
**Branch**: `feature/v1-implementation--003-launcher-design`.

## What was actually broken

The launcher was **two different components in one file**.

`Launcher.tsx:37-39` reads `?parity-case` off the URL and adds a
`styles.parityLauncher` class. Everything resembling the binding lived in
`.parityLauncher …` overrides (`Launcher.module.css:67-154`). The default
branch — the panel a real user sees, and the *first screen of every launch*
because there is no session restore — was a different design entirely: a
bordered `--surface` card with `--dialog-padding` and `--win-radius`,
left-aligned, `--control-padding` buttons, no accent primary, no uppercase
section label, no `--stroke-soft` divider.

**Parity screenshots passed the launcher because they only ever exercised the
parity branch.** The shipped branch was never compared with anything.

It also carried two `font-size` declarations reading tokens that do not exist:

```css
.panel h1 { font-size: var(--launcher-title-size); }   /* :28 */
.panel h2 { font-size: var(--launcher-section-size); } /* :32 */
```

Neither `--launcher-title-size` nor `--launcher-section-size` is defined
anywhere in the repository — verified across `frontend/src`, `frontend/e2e` and
`frontend/public`. An invalid `var()` makes `font-size` compute to `unset`,
which inherits, so **the launcher title and the "Recent" heading both rendered
at body size** instead of 20px and 10.5px.

## The fix: promote the binding to the base

The binding's rules were already in the file — trapped inside overrides that
only applied on the parity route. They are now the base rules, so the shipped
launcher *is* the design, and `.parityLauncher` keeps only what the harness
genuinely needs: the fixed reference content-band heights (313 / 316 / 301px)
and the flex/overflow adjustments the T045 test names.

Every declaration now carries its `mockup.html` line. Rules restored that
production had simply dropped:

| Binding rule | Was | Now |
|---|---|---|
| `.lc .acts button{border:1px solid var(--stroke)}` (:109) | absent — user-agent border | applied |
| `.lc .acts button{border-radius:9px}` (:109) | absent | applied |
| `.lc .acts button{background:var(--surface)}` (:109) | absent — user-agent background | applied |
| `.lc .acts button{padding:8px 14px}` (:109) | `--control-padding` (6px 10px) | applied |
| `.lc h2{font-size:20px}` (:106) | undefined token → inherited | `20px` |
| `.lc .rec .lbl{font-size:10.5px…}` (:111) | undefined token → inherited | applied with letter-spacing and uppercase |
| `.lc .rec .r{padding:6px 8px}` (:112) | `8px 14px` even on the parity route | `6px 8px` |
| `.lc{no card}` (:105) | `--surface` card with border, radius and `--dialog-padding` | no background, border, radius or padding |
| `.lc{text-align:center}` (:105) | left-aligned | centred |
| `.lc .rec{border-top:1px solid var(--stroke-soft)}` (:111) | absent | applied |
| rows adjacent, no gap | `--control-gap`, and `1px` on the parity route | no gap |
| `.lc .sub{color:var(--muted)}` (:107) | `--text-muted` | `--muted` |

**The mockup has no global `button {}` reset** (`mockup.html` has no such rule),
so each of the border / radius / background declarations is load-bearing. Base
CSS in production has no button reset either (`frontend/src/ui/styles/base.css`,
all 116 lines), which is exactly why omitting them produced user-agent buttons.

`overflow` was also removed. The binding declares none; the recents list is
clamped to six rows inside a 430px block, so the content is bounded; and making
this a scroll container would have cost ~332 deterministic antialiasing pixels
for no benefit, per the compositing behaviour recorded in
`t062-renderer-determinism.md`.

The narrow-width `.actions{display:grid}` override was dropped: the binding's
`.acts` already declares `flex-wrap:wrap`, which is how it reflows.

## Evidence — computed style, not source text

The launcher's only unit test asserted the **CSS source text** of
`.parityLauncher` (`Launcher.test.tsx:11-28`). That is why none of the drift
above was ever caught: a source-text assertion cannot see an undefined token, a
missing declaration, or the user-agent fallback that replaces it.

`frontend/e2e/launcher-binding.test.ts` is new and reads computed style off the
real control, in four cases:

| Case | Asserts |
|---|---|
| frame and block | `.launcher` display/alignment/padding, no overflow, and `.lc`'s 430px width, centring, and **absence** of card background, border, radius and padding |
| type scale | title 20px/4px, message 12.5px/18px in `--muted`, section label 10.5px uppercase with 0.945px tracking in `--faint` |
| actions | secondary button 8px 14px, radius 9px, 1px solid `--stroke`, `--surface` background, 12.5px; primary `--accent` on `--accent-contrast` at weight 600 |
| recents | `--stroke-soft` top rule, 12px padding, rows flex with 9px gap at 6px 8px, radius 8px, and `--hover` on hover |

Colour comparisons resolve the token through a throwaway element so the browser
converts hex to `rgb()`; the assertion stays exact rather than being loosened to
a substring match.

**All four were confirmed to catch the drift.** With `Launcher.module.css`
stashed and the tests unchanged, all four fail; with it restored, all four pass.

## Gate

`just check` green — 75 suites / 487 tests, lint 0 errors and the 2 baseline
`react-refresh` warnings.

`launcher-binding.test.ts` 4 passed. `real-files-and-tabs.test.ts` unchanged at
its 2 pre-existing failures / 6 passed (`e2e-baseline-failures.md`), so the
launcher change introduced no e2e regression.

## Named differences that remain, and why

Decision 7 names spacing, colours, button styling and card treatment. Three
differences remain outside that scope and are recorded rather than silently
left:

1. **The recent rows have no file icon.** The binding draws a 15px
   `svg.ic` (`#i-file`) in every row (`mockup.html:695-698`) and the parity
   reference adapter keeps it (`reference-adapter.ts:520-525`), so the icon
   column exists on the reference side and not on production's. This is markup,
   not styling, and closing it changes the compared row geometry — it belongs
   with the icon inventory work, not with this styling pass.
2. **The parity route hard-codes English literals** (`Launcher.tsx:48-95`:
   `'GoMarkEdit'`, `'New file'`, `'Open file…'`, and a `'~/Notes/projects'`
   parent fabricated from a substring test). This bypasses the catalogue rule
   enforced by `frontend/eslint.architecture.config.js:39-65`. It exists because
   the catalogue strings and the mockup strings genuinely differ —
   `launcher.title` is "Start a document", the binding says "GoMarkEdit". That
   is a content decision about the catalogue, not a styling defect, and
   resolving it needs a specification clarification rather than an edit here.
3. **The third action is disabled** where the binding draws it enabled. This is
   the existing deferred-Open-Folder decision, already locked in on both sides
   (`real-files-parity.test.ts:1250-1252` and the reference adapter patches the
   reference to disabled too), so the comparison stays honest.
