# ADR-0030 — Constrain document HTML with a level-derived allowlist and a fixed Content-Security-Policy

**Status:** accepted
**Date:** 2026-07-25
**Deciders:** project owner, architect

> **Historical vocabulary — this record is not rewritten.** The `DD-…` and `EC-…` identifiers below cite the retired 78-entry design-decision registry, last present in git at `e1bd33f` under `specification/00_Foundation/` as `04_DESIGN_DECISIONS.md`; every one of those decisions now lives in the sentence of the feature file that needs it. Links into `_archive-2026-07-28-specification/` are the pre-conversion specification, kept so a citation still resolves, and **not normative**. See `README.md`. A decision record says what was decided against what was known then, so neither is translated forward.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

## Context and problem statement

Three accepted documents require the rendered preview to be sanitized "according to the security
level" — `../../_archive-2026-07-28-specification/01_Product/05_RENDERING_AND_EXTENSIONS.md`, `../../_archive-2026-07-28-specification/01_Product/09_ASSETS_AND_SECURITY.md`, and
`EC-RENDER-5`. **No document says what the levels are.** There is no allowlist of tags, attributes or
URL schemes, no Content-Security-Policy directive list anywhere in the specification, and no
sanitization package in `../../_archive-2026-07-28-specification/05_Dependencies/02_FRONTEND_DEPENDENCIES.md`.

`PHASE_06_RICH_AND_SAFE.md` names this as a blocking hole rather than a disagreement, and it is right
to: sanitization is in the render pipeline from its first line, so it cannot be added afterwards.

Two further facts make the shape of the answer non-obvious, and both are easy to get wrong:

1. **Adding a sanitizer with its stock schema deletes maths and syntax highlighting.** KaTeX emits
   MathML elements and `className` on `span`; highlight.js emits `className` on `span`. The default
   `rehype-sanitize` schema strips both. The most likely first symptom of "we added security" is "the
   formulas disappeared."
2. **Two renderers bypass the sanitizer entirely.** Mermaid output is injected as an SVG string, and
   KaTeX output is produced after the sanitize stage. Neither passes through it. Whatever the allowlist
   says, those two are governed by their own configuration or not at all.

## Decision drivers

- The default must be safe without anyone opting in.
- The cheapest safe level should require adding nothing, so that the safe path is also the lazy path.
- Whatever we decide has to survive being read by someone who has never seen a hast schema.
- The three Markdown standards (Minimal / GFM / Full) already exist as a user-facing choice; a second,
  independent "security level" control would be a second thing to explain.

## Considered options

- **A.** No raw HTML at all, at any level. Escape it and render it as text.
- **B.** A user-facing "security level" control, independent of the Markdown standard.
- **C.** Sanitization derived from the Markdown standard the user already picked, with no separate
  control, and raw HTML permitted only at the highest standard.

## Decision outcome

Chosen: **C** — with the explicit consequence that "level" stops being a user-facing word.

- **Minimal and GFM escape raw HTML.** This is `react-markdown`'s default behaviour, so it costs no
  dependency and no configuration. A document containing `<script>` renders the literal text
  `<script>`, which is both safe and honest.
- **Full permits a bounded subset of raw HTML**, and only at Full. This is the only level that adds
  `rehype-raw` followed by `rehype-sanitize`, in that order.
- **The Full allowlist is enumerated in `../../_archive-2026-07-28-specification/01_Product/19_SANITIZATION_AND_CSP.md`**, expressed as the
  library's default schema plus a written set of additions. It permits inline and block formatting
  elements, tables, images, links, and `details`/`summary`. It permits **no** `script`, `style`,
  `iframe`, `object`, `embed`, `form`, `input`, `base` or `srcdoc`; **no** `on*` event attribute; and
  **no** URL scheme outside `http`, `https`, `mailto` and the app's own asset scheme — in particular
  not `javascript:` and not `data:`.
- **The schema is extended for KaTeX and highlight.js**, deliberately and in writing: `className` on
  `span`, `code`, `pre` and `div`, and the MathML element set KaTeX emits. Without this, Full renders
  less than GFM does, which is the opposite of what the name says.
- **Mermaid is governed by `securityLevel: 'strict'`, not by the allowlist**, and the document says so
  in the same section rather than leaving the reader to assume it is covered. `strict` also disables
  `htmlLabels` and click directives, which are the two script-injection surfaces in a `loose` config.
- **KaTeX is governed by `trust: false`**, which is its default and which is what stops `\href`,
  `\url` and `\includegraphics` from emitting URLs the sanitizer never sees.
- **A single Content-Security-Policy applies to the whole app**, at every standard, enumerated in
  `../../_archive-2026-07-28-specification/03_NonFunctional/03_SECURITY_AND_PRIVACY.md`. It is not derived from the standard, because the
  standard is a per-document setting and the CSP is a per-process one. It must include
  `worker-src 'self' blob:` — Monaco's editor worker does not load without it, and discovering that
  during a phase is worse than writing it down now.

### Consequences

- Positive: the safe default costs nothing. Two of three standards need no sanitizer at all.
- Positive: there is one thing to explain to a user — how much Markdown — not two.
- Positive: the two bypass routes are named in the same document as the allowlist, so a reader cannot
  conclude that the sanitizer covers them.
- Negative: a user who wants raw HTML must also accept Full's other extensions (directives,
  frontmatter, footnote syntax). We judge this an acceptable coupling; anyone embedding HTML in
  Markdown is not looking for a restricted dialect.
- Negative: `rehype-raw` reparses the whole tree at Full and is measurably slower. It is confined to
  the one standard that asked for it.
- Neutral: `EC-RENDER-5` and the other clauses stop saying "the security level" and start pointing at
  `19_SANITIZATION_AND_CSP.md`.

## Pros and cons of the options

### Option A — never allow raw HTML

- Good: the simplest possible story, no sanitizer, no schema, nothing to maintain.
- Bad: real Markdown in the wild contains `<details>`, `<br>`, `<sub>`, alignment `<div>`s and embedded
  tables. Rendering all of it as literal text makes the app wrong on documents people already have.

### Option B — an independent security-level control

- Good: orthogonal; a user could have Full Markdown with locked-down HTML.
- Bad: a second control, in a settings group that has no home for it, whose failure mode is a user
  wondering why their document renders differently on two machines. The combinations are mostly
  meaningless.

### Option C — derived from the Markdown standard _(chosen)_

- Good: one control, safe default, and the expensive machinery only where it was asked for.
- Bad: couples two concerns that are theoretically separate.

## Links

- Design decisions: DD-14, DD-19 (standard → plugin set), DD-21, DD-22 (remote content policy)
- Spec clauses: ../../_archive-2026-07-28-specification/01_Product/19_SANITIZATION_AND_CSP.md` (new, owns the detail),
../../_archive-2026-07-28-specification/01_Product/05_RENDERING_AND_EXTENSIONS.md#sanitization`,
  ../../_archive-2026-07-28-specification/01_Product/04_MARKDOWN_STANDARDS.md`,
../../_archive-2026-07-28-specification/01_Product/09_ASSETS_AND_SECURITY.md`,
  ../../_archive-2026-07-28-specification/03_NonFunctional/03_SECURITY_AND_PRIVACY.md`,
../../_archive-2026-07-28-specification/05_Dependencies/02_FRONTEND_DEPENDENCIES.md`
- Phase: `specification/07_Phases/PHASE_06_RICH_AND_SAFE.md` — this closes its blocking question.
- Stories: the Phase 06 stories, not yet written.
