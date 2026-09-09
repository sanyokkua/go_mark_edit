**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-25
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md` (DD-14, DD-19, DD-21, DD-22), `01_Product/04_MARKDOWN_STANDARDS.md`, `01_Product/05_RENDERING_AND_EXTENSIONS.md`, `01_Product/09_ASSETS_AND_SECURITY.md`, `03_NonFunctional/03_SECURITY_AND_PRIVACY.md`, `05_Dependencies/02_FRONTEND_DEPENDENCIES.md`, ADR-0030

# Sanitization and Content-Security-Policy

What HTML a document is allowed to contain, and what the application process is allowed to do.
Realises ADR-0030, which closed a hole three accepted documents depended on: they each required
sanitization "according to the security level", and no document said what the levels were.

**A Markdown document is untrusted input.** It arrives from the internet, from a colleague, from a
repository, from an AI model. It is rendered inside a webview that has a bridge to a Go process with
filesystem access. That is the whole reason this document exists.

## Table of Contents

1. [There is no separate security level](#there-is-no-separate-security-level)
2. [What each standard permits](#what-each-standard-permits)
3. [The Full allowlist](#the-full-allowlist)
4. [What the sanitizer does not cover](#what-the-sanitizer-does-not-cover)
5. [Content-Security-Policy](#content-security-policy)
6. [Links and images](#links-and-images)
7. [The adversarial corpus](#the-adversarial-corpus)
8. [Edge cases](#edge-cases)

## There is no separate security level

Sanitization is **derived from the Markdown standard the user already chose** — Minimal, GFM or Full.
There is no second "security level" control, and the word "level" should not appear in a settings
label.

One control, not two: a user reasoning about "how much Markdown do I want" is reasoning about the same
axis as "how much HTML do I trust", and the combinations of two independent controls are mostly
meaningless. Anyone embedding raw HTML in Markdown is not looking for a restricted dialect.

## What each standard permits

| Standard          | Raw HTML         | Mechanism                           | Cost                                   |
| ----------------- | ---------------- | ----------------------------------- | -------------------------------------- |
| **Minimal**       | escaped          | react-markdown's default            | nothing — no package, no configuration |
| **GFM** (default) | escaped          | react-markdown's default            | nothing                                |
| **Full**          | a bounded subset | `rehype-raw` then `rehype-sanitize` | a full tree reparse                    |

**The safe path is also the lazy path**, and that is deliberate. At Minimal and GFM, a document
containing `<script>alert(1)</script>` renders the literal text `<script>alert(1)</script>` — safe,
honest, and achieved by adding nothing at all. Only Full needs the sanitizer, and only Full pays for it.

Order matters and is not negotiable: `rehype-raw` **then** `rehype-sanitize`. Reversed, the sanitizer
inspects a tree that does not yet contain the raw HTML, and every one of the rules below is bypassed.

## The Full allowlist

Expressed as `rehype-sanitize`'s default schema, plus additions, minus nothing — the default is already
conservative and re-deriving it from scratch is how a gap gets introduced.

**Permitted elements**, beyond the default set: `details`, `summary`, `figure`, `figcaption`, `mark`,
`abbr`, `sub`, `sup`, `kbd`, `dl`, `dt`, `dd`.

**Permitted attributes**, added to the default:

- `className` on `span`, `code`, `pre`, `div` and `section`.
- `style` on **nothing**. An inline style is a rendering surface with its own injection history
  (`url()`, `expression()`, `position:fixed` overlays) and no Markdown document needs it.
- `align` on `td`, `th`, `table` — GFM already produces these.
- `open` on `details`.
- `id` on headings only, and only values the app itself generated for anchors.

**Refused, at every standard, without exception:**

`script`, `style`, `iframe`, `object`, `embed`, `applet`, `form`, `input`, `button`, `select`,
`textarea`, `base`, `link`, `meta`, `template`, `slot`, `noscript`, `svg`, `math`, `portal`.

- **Every `on*` attribute.** `onerror` on an `img` and `onload` on anything are the two shortest paths
  from a pasted document to arbitrary code, and neither needs `<script>`.
- **`srcdoc`** — an iframe's entire contents as an attribute value. `iframe` is refused anyway; this is
  belt and braces.
- **`base`** — a single tag that silently re-targets every relative URL in the document, including the
  ones the asset handler resolves.
- **`svg`** — raw SVG carries `<script>`, `<use xlink:href>` and `<foreignObject>`. Diagrams come from
  Mermaid, which is handled separately and deliberately.

**Permitted URL schemes**, on `href` and `src`: `http`, `https`, `mailto`, and the application's own
asset scheme. Everything else is dropped and the element renders as inert text. Explicitly refused:

- **`javascript:`** — the classic, and the reason schemes are allowlisted rather than blocklisted.
- **`data:`** — a `data:text/html` link is a same-origin document; a `data:image/svg+xml` image is a
  script host. The cost of refusing it is that inline base64 images do not render, which is an
  acceptable trade.
- **Protocol-relative `//host/path`**, which inherits the app's own scheme and is easy to miss when
  reading a document.

### The extension that is not optional

The stock schema **strips KaTeX's MathML and highlight.js's `className`**. Adding `rehype-sanitize`
without extending it therefore makes Full render _less_ than GFM does: the formulas disappear and every
code block goes monochrome. The most likely first symptom of "we added security" is "the maths broke."

So the schema also permits: the MathML element set KaTeX emits (`math`, `semantics`, `annotation`,
`mrow`, `mi`, `mn`, `mo`, `msup`, `msub`, `mfrac`, `msqrt`, `mtable`, `mtr`, `mtd`, and their siblings)
**as produced by KaTeX only**, together with `className` and `aria-hidden` on them. This is the one
place where `math`-family elements are allowed, and it is scoped to the rendering pipeline's own output
rather than to arbitrary document content.

## What the sanitizer does not cover

Two renderers bypass it completely. Stating this here is the point of this section — a reader who
assumes the allowlist covers everything will not go looking.

**Mermaid** produces an SVG string that is injected with `dangerouslySetInnerHTML`, after the sanitize
stage, into a container the sanitizer never sees. It is governed by **`securityLevel: 'strict'`**,
pinned in `10_THEMING.md#diagrams-and-maths` and repeated here because it is a security control, not a
theming one. `strict` also disables `htmlLabels` and click directives — the two script-injection
surfaces in a `loose` configuration.

**KaTeX** renders after sanitization and is governed by **`trust: false`** (its default, stated
explicitly so nobody "fixes" a missing feature by turning it on). With `trust: true`, `\href`, `\url`
and `\includegraphics` emit URLs the sanitizer never inspects.

## Content-Security-Policy

One policy for the whole application process, at every standard. It is **not** derived from the
Markdown standard: the standard is a per-document setting and the CSP is a per-process one.

| Directive     | Value                                                                                  | Why                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default-src` | `'self'`                                                                               | Deny by default.                                                                                                                                    |
| `script-src`  | `'self'`                                                                               | No inline script, no `eval`, no CDN.                                                                                                                |
| `style-src`   | `'self' 'unsafe-inline'`                                                               | Monaco and KaTeX both set inline styles on elements they create. This is the one concession, and it is why `style` is refused on document elements. |
| `img-src`     | `'self'` + the asset scheme, and `https:` **only while the content policy permits it** | DD-22's Ask / Always allow / Always block is enforced here as well as in the renderer.                                                              |
| `font-src`    | `'self'`                                                                               | Every font is bundled.                                                                                                                              |
| `connect-src` | `'self'`, plus the configured provider origin once the assistant is configured         | The single outbound socket in the product.                                                                                                          |
| `worker-src`  | `'self' blob:`                                                                         | **Monaco's editor worker does not load without `blob:`.** Discovering this during a phase is worse than writing it down now.                        |
| `frame-src`   | `'none'`                                                                               | `iframe` is refused by the allowlist; this makes it structural.                                                                                     |
| `object-src`  | `'none'`                                                                               |                                                                                                                                                     |
| `base-uri`    | `'none'`                                                                               | Backs the refusal of `<base>`.                                                                                                                      |
| `form-action` | `'none'`                                                                               | Nothing in the app submits a form.                                                                                                                  |

`connect-src` is the directive that makes the offline invariant enforceable rather than merely
intended: before a provider is configured it names no external origin, so a stray `fetch` fails at the
platform level rather than silently succeeding.

## Links and images

Independent of sanitization, and easy to get wrong in a webview:

- **An external link never navigates the webview.** Clicking `https://example.com` in a rendered
  document must open the platform browser, not replace the application with a web page — which is what
  a plain `<a href>` does in a Wails window, and it destroys the running application. Every rendered
  link goes through the open-external path, and its scheme is checked there as well as in the sanitizer.
- **A relative link to another Markdown file opens that document** in the app, resolved like an asset
  (`09_ASSETS_AND_SECURITY.md`) — not passed to the browser.
- **Local images** resolve through the guarded asset handler, relative to the document, traversal
  rejected. **Remote images** obey the content policy (DD-22).

## The adversarial corpus

The allowlist is only true while something checks it. A fixture set lives beside the renderer's golden
files and is run at every standard, asserting that the rendered DOM contains no executable surface:

`<script>` in body and in an attribute · `javascript:` in `href` and in `src` · `data:text/html` ·
`data:image/svg+xml` · protocol-relative `//` · `onerror` on a broken `img` · `onload` · `<iframe>` ·
`<iframe srcdoc>` · `<base href>` · `<style>` and an inline `style` with `url()` · raw `<svg>` with an
embedded script · `<svg><use xlink:href>` · `<form>` with `formaction` · `<meta http-equiv="refresh">` ·
a Mermaid block containing a click directive · a KaTeX `\href`.

Because sanitization is a property of the **rendered DOM**, at least one of these also runs as a
browser-level smoke flow, not only as a unit test.

## Edge cases

- **EC-SANITIZE-1** — A document containing `<script>` at Minimal or GFM → rendered as literal text, no
  execution, no warning. Escaping is the normal path, not an error.
- **EC-SANITIZE-2** — The same document at Full → the element is removed by the allowlist; surrounding
  content still renders.
- **EC-SANITIZE-3** — A link with a `javascript:` target → rendered as inert text with no `href`.
- **EC-SANITIZE-4** — An external `https` link is clicked → the platform browser opens; the webview does
  not navigate.
- **EC-SANITIZE-5** — Display maths at Full → MathML survives the sanitizer and renders. (This is the
  regression the schema extension exists to prevent.)
- **EC-SANITIZE-6** — A fenced Go block at Full → highlight classes survive and the block renders in
  more than one colour.
- **EC-SANITIZE-7** — A Mermaid block containing a click directive → the diagram renders and the
  directive does nothing, because `securityLevel` is `strict`.
- **EC-SANITIZE-8** — The user switches standard from Full to GFM with a document open → the document
  re-renders under the stricter pipeline, and previously rendered raw HTML becomes escaped text.
