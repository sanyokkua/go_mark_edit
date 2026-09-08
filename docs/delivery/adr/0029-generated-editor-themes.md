# ADR-0029 — Generate the editor's and the preview's colours at build time from one syntax-token family

**Status:** accepted
**Date:** 2026-07-25
**Deciders:** project owner, architect

> **Historical vocabulary — this record is not rewritten.** The `DD-…` and `EC-…` identifiers below cite the retired 78-entry design-decision registry, last present in git at `e1bd33f` under `specification/00_Foundation/` as `04_DESIGN_DECISIONS.md`; every one of those decisions now lives in the sentence of the feature file that needs it. Links into `_archive-2026-07-28-specification/` are the pre-conversion specification, kept so a citation still resolves, and **not normative**. See `README.md`. A decision record says what was decided against what was known then, so neither is translated forward.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

## Context and problem statement

DD-29 and `../../_archive-2026-07-28-specification/01_Product/10_THEMING.md` promise a unified theme:

> Monaco's colours, the preview typography, code-highlight colours, and Mermaid SVG fills all read from
> the same token set.

**As written, that is not implementable.** Monaco does not read CSS custom properties. It is configured
through `monaco.editor.defineTheme()`, which takes literal colour strings in a `rules[]` array and a
`colors{}` map. Handing it `var(--text)` does nothing. The same is true of Mermaid, which resolves
`themeVariables` into baked hex values in the emitted SVG.

So a promise that reads like a CSS statement is actually a build step, and nobody had scheduled it.

The problem has a second half that is easy to miss and more consequential in practice. GoMarkEdit needs
**two** syntax palettes, not one:

- the colours of **Markdown source** in the editor — the `#` of a heading, the `**` of bold, a link
  target, a `>` quote;
- the colours of a **programming language inside a fenced block** — keywords, strings, comments — which
  must match on **both** sides of a split view, since the editor renders the fence via Monaco's embedded
  grammar and the preview renders it via highlight.js.

The mockup defines one set (`--c-h`, `--c-b`, `--c-em`, `--c-q`, `--c-c`, `--c-fn`, `--c-code`,
`--gutter`), none of which appear in the normative token table, and it has no equivalent for the second
family at all. Both shipped reference implementations we reviewed ship `rehype-highlight` with **no
theme stylesheet whatsoever**: the parser runs, emits `hljs-keyword` and `hljs-string` spans, and every
code block renders in a single colour. Neither author noticed. That is the failure mode this ADR exists
to make impossible.

## Decision drivers

- DD-30: no component hard-codes a colour. Six hand-written Monaco themes are six hand-written colour
  files.
- Six palettes × two engines is twelve places for the same colour to drift.
- The split view is the app's signature screen. Code that is purple on the left and grey on the right
  is the most visible possible failure of "unified".
- Whatever we choose must be checkable, because the failure is silent — nothing errors, the code is just
  the wrong colour.

## Considered options

- **A.** Hand-write six Monaco theme objects and one highlight.js stylesheet per mode.
- **B.** Read the resolved token values from `getComputedStyle` at runtime and call `defineTheme()` on
  every theme change.
- **C.** Generate the Monaco themes and the highlight stylesheet at build time from one source of token
  values, and swap the pre-built theme by name at runtime.

## Decision outcome

Chosen: **C**.

- **One source of values.** `../../_archive-2026-07-28-specification/01_Product/10_THEMING.md` is normative; `frontend/src/ui/styles/tokens.css`
  is authored from it. A build step reads the token values and emits both the six Monaco theme objects
  and the token→`hljs-*` stylesheet.
- **Two token families, named and separated** (`../../_archive-2026-07-28-specification/01_Product/10_THEMING.md#the-two-syntax-palettes`): `--md-*` for
  Markdown source in the editor, `--hl-*` for languages inside fences. The `--hl-*` family has **two
  consumers** — the preview's highlight stylesheet and the embedded-language rules of the generated
  Monaco theme. That shared family is the entire mechanism by which the two sides of a split view agree.
- **Both families are scoped by appearance, not by theme.** Sixteen values, not forty-eight. Syntax
  colouring is a legibility system; three variants would be three sets to keep readable for a difference
  nobody asked for. The theme still changes the fence background, border, font and gutter around the
  code.
- **Runtime does nothing but swap a name.** On a theme or appearance change the app calls
  `monaco.editor.setTheme('gme-<theme>-<mode>')`. No colour is computed, parsed or resolved while the
  user is waiting.
- **A colour that is not traceable to a token is a build failure.** The generator is the only thing that
  writes a literal colour into a `defineTheme()` call, and the visual gate asserts that a rendered fence
  contains **more than one distinct colour** — which is what would have caught both reference
  implementations.

### Consequences

- Positive: "unified theme" becomes a mechanism instead of an assertion, and the mechanism is one file.
- Positive: adding a theme means adding a column to the table; the six editor themes follow.
- Positive: no runtime `getComputedStyle` work on a user-visible interaction.
- Positive: the failure is loud — a missing token breaks the build rather than rendering grey.
- Negative: a build step to own and to run. It is small (a table in, two files out) but it is real, and
  the tokens file and the generated output can go out of sync if the step is skipped. It runs as part of
  the normal frontend build, not as a manual command.
- Negative: because the generated output is committed, a token change produces a diff in three files.
  This is a feature — a colour change is visible in review — but it will look like noise the first time.
- Neutral: Mermaid is handled by the same principle but not the same code path; it takes
  `themeVariables` from the resolved tokens at runtime, because Mermaid re-renders per diagram anyway.
  `../../_archive-2026-07-28-specification/01_Product/10_THEMING.md#diagrams-and-maths` covers it.

## Pros and cons of the options

### Option A — hand-write six themes
- Good: no tooling; complete control over every value.
- Bad: six files of literal colours in an application whose first design decision is that no component
  hard-codes a colour. They drift from the table the first time someone tunes one in isolation.

### Option B — read tokens at runtime, redefine on change
- Good: one source of truth, no build step, and it genuinely works.
- Bad: `getComputedStyle` on every theme change, on the main thread, at the exact moment the user is
  watching for a smooth transition; and it needs a resolved DOM before the editor can be themed at all,
  which conflicts with painting the first frame already correct. It also cannot catch a missing token at
  build time — a typo yields an undefined value and a black-on-black editor.

### Option C — generate at build time *(chosen)*
- Good: one source, zero runtime cost, and a missing or misnamed token fails the build.
- Bad: a build step and committed generated output.

## Links

- Design decisions: DD-28, DD-29, DD-30, DD-69
- Spec clauses: ../../_archive-2026-07-28-specification/01_Product/10_THEMING.md#the-two-syntax-palettes`,
  `#editor-theme`, `#diagrams-and-maths`,
  ../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#theme`,
  ../../_archive-2026-07-28-specification/05_Dependencies/02_FRONTEND_DEPENDENCIES.md`
- Related: ADR-0005 (token theming — this ADR supplies the mechanism its editor half was missing)
- Phase: `specification/07_Phases/PHASE_02_EVERY_THEME_LOOKS_RIGHT.md` (steps 2 and 3)
- Stories: the Phase 02 stories, not yet written.
