**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_ROADMAP.md`, `../01_Product/04_MARKDOWN_STANDARDS.md`, `../01_Product/05_RENDERING_AND_EXTENSIONS.md`, `../01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `../02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md`, `../03_NonFunctional/02_PERFORMANCE.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 04 — Rendering & Extensions

## Goal

Bring the rendering pipeline to full fidelity: a Markdown-standard selector (Minimal / GFM / Full)
that drives per-standard plugin sets, KaTeX math, code-syntax highlighting, and Mermaid diagrams
(each with a defined inline error state), plus the distraction-free reading (Viewer) mode that hides
all chrome, and the large-file preview auto-pause with manual refresh. Completes the "faithful offline
rendering" goal.
Refines: `../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-standards` and
`../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-rendering`.

## Depends on

- Phase 01 (base MarkdownView pipeline, view-mode toggle).
- Phase 02 (file open path — the large-file preview-pause threshold of EC-DOCS-4 applies to opened files).

## Scope

- `standard` setting (Minimal/GFM/Full) + the standard→plugin-set map in `logic/markdown`
  (`../01_Product/04_MARKDOWN_STANDARDS.md#minimal-commonmark`, `../01_Product/04_MARKDOWN_STANDARDS.md#gfm`,
  `../01_Product/04_MARKDOWN_STANDARDS.md#standard-setting`).
- Large-file preview auto-pause: above the size threshold the live preview pauses
  (`editor.pauseLivePreview` setting), showing the last rendered snapshot plus a manual refresh control
  (`../02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#large-file-strategy`,
  `../02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#preview-debounce`,
  `../03_NonFunctional/02_PERFORMANCE.md#4-large-file-handling`) — the base debounce itself is Phase 01
  (STORY-015).
- KaTeX math (remark-math + rehype-katex) with inline error tokens.
- Code highlighting (rehype-highlight); unknown language → plain block.
- `MermaidBlock` async component intercepting ` ```mermaid ` fences; invalid syntax → inline error.
- Full-extensions plugin set (footnotes, directives/admonitions, frontmatter).
- `ReaderView` reading mode hiding sidebar/tabs/toolbar/menu/status bar.

## Out of scope

- Format/lint — Phase 05.
- PDF export — Phase 06.
- Remote-content policy/banner, asset allowlist — Phase 09 (this phase renders local/relative images naively; the guarded handler lands in Phase 09).
- Full theme token values for the reader chrome — Phase 08.

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-029 | Add the Markdown-standard setting and the standard→plugin-set mapping driving parse and render | M | `logic/markdown/`, `logic/store/`, `internal/settings/` | `01_Product/04_MARKDOWN_STANDARDS.md#standard-levels`, `01_Product/04_MARKDOWN_STANDARDS.md#minimal-commonmark`, `01_Product/04_MARKDOWN_STANDARDS.md#gfm`, `01_Product/04_MARKDOWN_STANDARDS.md#standard-setting`, `01_Product/04_MARKDOWN_STANDARDS.md#plugin-mapping`, `00_Foundation/04_DESIGN_DECISIONS.md#4-markdown-behaviour`, `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#large-file-strategy`, `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#preview-debounce`, `03_NonFunctional/02_PERFORMANCE.md#4-large-file-handling` | STORY-011, STORY-018 |
| STORY-030 | Render KaTeX math with an inline error token for invalid expressions | M | `logic/markdown/`, `ui/components/` | `01_Product/05_RENDERING_AND_EXTENSIONS.md#math-katex`, `01_Product/05_RENDERING_AND_EXTENSIONS.md#pipeline` | STORY-029 |
| STORY-031 | Add code-syntax highlighting with a plain fallback for unknown languages | S | `logic/markdown/`, `ui/components/` | `01_Product/05_RENDERING_AND_EXTENSIONS.md#code-highlighting` | STORY-029 |
| STORY-032 | Intercept mermaid fences into an async MermaidBlock with an inline error block on invalid syntax | M | `ui/components/`, `logic/markdown/` | `01_Product/05_RENDERING_AND_EXTENSIONS.md#mermaid`, `01_Product/05_RENDERING_AND_EXTENSIONS.md#components-override` | STORY-029 |
| STORY-033 | Enable the Full-standard extension set (footnotes, directives/admonitions, frontmatter) | M | `logic/markdown/` | `01_Product/04_MARKDOWN_STANDARDS.md#full-extensions`, `01_Product/05_RENDERING_AND_EXTENSIONS.md#gfm-features` | STORY-029 |
| STORY-034 | Add the ReaderView reading mode that hides all chrome | M | `ui/widgets/`, `logic/store/`, `ui/styles/` | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#viewer-reading-mode`, `00_Foundation/04_DESIGN_DECISIONS.md#9-theming--ux` | STORY-013 |

## Edge cases

- **EC-RENDER-1** — Invalid Mermaid → inline error block, rest renders (STORY-032).
- **EC-RENDER-2** — Invalid KaTeX → inline error token, continues (STORY-030).
- **EC-RENDER-3** — Unknown code-fence language → plain block (STORY-031).
- **EC-RENDER-5** — Raw HTML handled per sanitization level (STORY-029/033; sanitization hardening finalised in Phase 09).
- **EC-RENDER-6** — Feature above active standard renders literally (STORY-029).
- **EC-RENDER-7** — Broken/missing image → alt/placeholder, no layout break (STORY-029).
- **EC-SET-3** — Changing the standard re-renders open documents (STORY-029).
- **EC-DOCS-4** — A file over the large-file threshold opens in Editor mode but the live preview auto-pauses (`editor.pauseLivePreview`), leaving a manual refresh control; editing stays responsive (STORY-029).

## Phase exit checklist

Automated:

- [ ] A document with a table, `$E=mc^2$`, a fenced `js` block, and a mermaid block renders `<table>`, a KaTeX node, an `.hljs` block, and a `.gme-mermaid svg` with no console errors (P4).
- [ ] Invalid Mermaid and invalid KaTeX each produce an inline error, not a crash (EC-RENDER-1/2).
- [ ] Switching Minimal→Full re-renders open documents; math renders literally under Minimal (EC-RENDER-6 / EC-SET-3).
- [ ] Reading mode removes every chrome element and restores on exit (EC state transition, P2).
- [ ] Opening a document over the large-file threshold pauses the live preview and shows the refresh control; refresh re-renders once (EC-DOCS-4).
- [ ] `just check` green.

Manual:

- [ ] In `wails dev`: `Ctrl/Cmd+Enter` enters a chrome-free reader; exiting restores the editor layout.
- [ ] A Mermaid diagram and inline math render in all three standards as specified.

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Stage 1 (Viewer); contributes to Milestone **M1**.
