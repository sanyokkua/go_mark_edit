**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/05_RENDERING_AND_EXTENSIONS.md`, `01_Product/11_SETTINGS.md`, `mockups/gomarkedit-mockup.html`

# Markdown Standards

GoMarkEdit's Markdown feature level is a user setting with three levels that drive both parsing and
rendering (DD-14). Refines `01_FUNCTIONAL_REQUIREMENTS.md#fr-standards`. The concrete plugin wiring is
detailed in `05_RENDERING_AND_EXTENSIONS.md`.

## Table of Contents

1. [Standard levels](#standard-levels)
2. [Minimal (CommonMark)](#minimal-commonmark)
3. [GFM](#gfm)
4. [Full extensions](#full-extensions)
5. [Standard setting](#standard-setting)
6. [Plugin mapping](#plugin-mapping)
7. [Edge cases](#edge-cases)

## Standard levels

Three mutually exclusive levels exist: **Minimal (CommonMark)**, **GFM** (default), and **Full**. The
level is a single global setting (not per-document in v1) and applies uniformly to every open
document's preview and reading mode. A feature that belongs to a higher level renders **literally** at
a lower level (EC-RENDER-6) — e.g. `$x^2$` is plain text under Minimal.

## Minimal (CommonMark)

The strict CommonMark baseline: headings, paragraphs, emphasis, links, images, blockquotes, lists,
fenced/indented code, thematic breaks, and inline HTML subject to sanitization. No tables, task lists,
strikethrough, autolinks, footnotes, math, or directives. Use this for maximum portability and to
preview exactly what a CommonMark-only renderer would show.

## GFM

The default. CommonMark **plus** GitHub-Flavored Markdown: tables, task-list items, strikethrough,
literal autolinks, and footnotes. This matches what most users expect from "Markdown" and is
GoMarkEdit's default renderer configuration. Code highlighting applies to fenced blocks regardless of level (it is a
rendering concern, `05_RENDERING_AND_EXTENSIONS.md#code-highlighting`).

## Full extensions

GFM **plus** the extended feature set: **math** (`$…$` / `$$…$$` via KaTeX),
**admonitions/directives** (container/leaf/text directives), and **frontmatter** (YAML block at the
top of the document, parsed and hidden from the rendered body). Footnotes are **not** new at Full —
they are already part of GFM (`remark-gfm`, see [GFM](#gfm) and the [Plugin mapping](#plugin-mapping)
table) and remain available here. Full is the richest level and is the intended level for technical
notes with formulae and callouts.

## Standard setting

The level is chosen in two places (kept in sync): the **Settings menu** radio ("Markdown standard")
and the **Settings dialog** Markdown group ("Standard"). Default is **GFM**. Persisted in the KV store
(`11_SETTINGS.md#persistence`). Changing the level re-renders open documents immediately (EC-SET-3)
and updates the preview/status standard badge (e.g. `GFM`). Mermaid is available at all levels via the
`components` override (`05_RENDERING_AND_EXTENSIONS.md#components-override`), independent of the remark
plugin set.

## Plugin mapping

Which remark/rehype plugins are active per level. Sanitization and highlighting apply at every level;
math/footnotes/directives/frontmatter are gated to Full.

| Capability | remark/rehype plugin(s) | Minimal | GFM | Full |
|---|---|:--:|:--:|:--:|
| Core CommonMark parse | `react-markdown` (remark-parse core) | yes | yes | yes |
| Tables / task lists / strikethrough / autolinks | `remark-gfm` | no | yes | yes |
| Footnotes | `remark-gfm` (footnotes) | no | yes | yes |
| Math (`$…$`, `$$…$$`) | `remark-math` + `rehype-katex` | no | no | yes |
| Directives / admonitions | `remark-directive` (+ handler) | no | no | yes |
| Frontmatter (YAML) | `remark-frontmatter` | no | no | yes |
| Code highlighting | `rehype-highlight` | yes | yes | yes |
| Mermaid fences | `components` override → MermaidBlock (DD-19) | yes | yes | yes |
| HTML sanitization | security level (`05_RENDERING_AND_EXTENSIONS.md#sanitization`) | yes | yes | yes |

Note: GFM footnotes are folded into `remark-gfm`; Full re-uses the GFM set and adds the extension
plugins. The exact plugin objects and options live in the frontend `logic/markdown` module
(`renderer.ts`).

## Edge cases

- **EC-RENDER-6** — A higher-level feature at a lower level renders literally (math text in Minimal,
  a table as raw pipes in Minimal).
- **EC-SET-3** — Switching level re-renders all open documents and updates the standard badge.
- **EC-RENDER-3** — Unknown code-fence language still renders as a plain code block at every level.
