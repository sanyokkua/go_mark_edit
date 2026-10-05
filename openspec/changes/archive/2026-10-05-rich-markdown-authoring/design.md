# Design

## Context

Preview rendering used one GFM pipeline; Format, Compact and Lint only had buttons. All work had to stay offline, keep typing responsive and keep Markdown files as the source of truth.

## Goals / Non-Goals

- Goals: render every common construct safely; tidy documents with minimal, undoable, render-preserving edits; open linked local documents through the one existing open path.
- Non-goals (not built): zoom and pan or a full-window viewer for Mermaid diagrams, an image control, a standalone Mermaid document type, diagram or PDF export, reading and print modes, a command palette, lint quick fixes, per-rule switches, and responsive rendering of very large previews.

## Decisions

- Pipeline order is fixed: parse, standard-specific syntax plugins, remark-rehype with raw HTML, raw, source-line marks, sanitize, render limits, heading ids, alerts, KaTeX, highlight. Sanitize runs before every step that adds classes or styles. One allowlist applies at every standard; scripts, styles, frames, forms, SVG and similar elements are stripped with their content, and `javascript:` and `data:` addresses are dropped. A lower standard shows unsupported syntax as source text, not an error.
- Math uses a custom `$` text rule so prices such as "$5 and $10" stay prose; limits are 1,000 formulas and 10,000 characters per formula, with placeholders beyond. KaTeX runs untrusted-safe (`trust: false`) with bundled fonts. A bad formula or diagram fails locally.
- Mermaid is lazily loaded, strict security level, rendered through one serial queue, redrawn on theme change, limited to 50 diagrams, and its SVG is scrubbed of scripts, images and activatable links. Stale results are discarded.
- Admonitions (`:::note` and similar) are rewritten to the GitHub alert shape before sanitize. Only container directives are parsed.
- Headings share one extractor for preview ids and editor navigation; duplicates get `-1` suffixes and non-ASCII letters are kept.
- Tidy runs in a worker as minimal text edits (not re-serialization), applied as one undo step. The edited text is parsed again and must produce an identical tree, otherwise the run is refused and nothing changes. Large documents are chunked at safe headings, show progress and can be cancelled. Lint is in-house and shares predicates with Format; the editor underlines at most 1,000 findings while the status bar and list keep the full count. One operation slot allows a single tidy run at a time and discards results that arrive for changed text.
- Format on save (off by default) and Lint on save (on) apply to explicit saves only, never autosave.
- Links: the frontend classifier only reads the spelling (anchor, external, local document, refused); the backend resolver decides existence, folder membership and support. Supported documents open anywhere on disk; other files get a notice with "Reveal in file manager" and no program is launched; UNC and device paths, `file:` and other schemes are refused. Tree reveal happens only for targets inside the open folder.
- Settings defaults live only in the backend: Full, `-` bullets, `_` emphasis, ATX headings; invalid stored values read as defaults.
- Monaco loads individual language contributions plus small in-repo grammars (Mermaid, JSON, diff, makefile) instead of the full language bundle.

## Risks / Trade-offs

- Raw HTML that spells an allowed element (such as `<table>`) renders as that element; accepted.
- The parser is superlinear on some synthetic inputs; chunking, progress and cancel bound the cost rather than removing it.
- The render guard refuses a rare real-world document instead of risking a changed rendering.
