**Status:** Accepted
**Owner:** architect
**Audience:** architect, tester
**Last Updated:** 2026-07-10

# Acceptance-Criteria Patterns

Every acceptance criterion must be **independently verifiable by an automated test** (unit,
integration, or e2e-smoke) or, for pure-visual criteria, by a named screenshot check against a
mockup. Use one of these patterns.

## P1 — Given/When/Then (behaviour)

> **Given** an open document with CRLF line endings, **when** the user saves it, **then** the file on
> disk retains CRLF and no BOM is added.

Use for backend behaviour and user flows. The proving test sets up the Given, performs the When, and
asserts the Then.

## P2 — State transition

> **When** the appearance is set to `auto` and the OS switches to dark, the effective theme becomes
> `dark` within one animation frame and `data-mode="dark"` is set on `document.documentElement`.

Use for UI/state-machine behaviour.

## P3 — Contract / API shape

> The bound method `DocsHandler.Save(req)` returns `apperr.VoidResult`; on a write error it returns a
> populated `Error` with `ErrorCode == CodeInternal` and no partial file is left on disk.

Use for handler/adapter contracts. The proving test asserts the envelope shape and error code.

## P4 — Rendering assertion

> A document containing a GFM table, `$E=mc^2$`, a fenced `js` block, and a ` ```mermaid ` block
> renders, respectively: an HTML `<table>`, a KaTeX node, an `.hljs` code block, and a
> `.gme-mermaid svg` — with no console errors.

Use for the renderer. Proven by a jsdom/e2e test asserting DOM selectors (use the GoMarkEdit preview selectors `.gme-preview`, `.gme-mermaid`).

## P5 — Guard / negative

> A relative image path that escapes the allowlist (e.g. `../../secret.png` outside the document root)
> is **rejected** by the asset handler with HTTP 403 and is not read from disk.

Use for security/edge cases; always pair with the `EC-` id it satisfies.

## P6 — Visual reference (UI only)

> The Editor toolbar matches `mockups/gomarkedit-mockup.html` in structure (format groups, view
> segmented control, Format/Lint actions) in all three themes × light/dark.

Use sparingly, only for purely visual criteria; back it with a Playwright screenshot check where
possible (the `verify:ui` harness).

## Writing rules

- One assertion of value per AC; split compound criteria.
- No implementation detail in the AC text (that belongs in Test plan / Design constraints).
- Every `edge_cases:` id must appear as (or within) at least one AC's proving test.
- Prefer P1–P5 (automatable) over P6; a story should not be all-P6.
