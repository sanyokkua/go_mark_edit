# Proposal

## Why

The preview left common Markdown literal (tables, math, diagrams, alerts), the Format, Compact and Lint controls were stubs that did nothing, and links to other local Markdown files could not be followed. Together this broke the core read, write and tidy promise of a Markdown editor.

## What Changes

- Rich preview at three standards (Minimal, GFM, Full; Full is the default): tables, task lists, footnotes, front matter, math, Mermaid diagrams, GitHub alerts and admonitions, highlighted code, a strict HTML allowlist and stable heading anchors.
- Working Format, Compact and Lint with undo as one step, a render-equivalence guard, progress and cancel, editor markers and a problems list.
- Opening local documents from preview and editor links, revealing them in the folder tree when they live in the open folder; network paths and other schemes are refused.
- Settings for the standard, bullet, emphasis and heading style, Format on save and Lint on save.
- Editor highlighting for fenced languages and Mermaid source.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-preview`: rendering pipeline, sanitization, math, Mermaid, alerts, anchors.
- `tidy-format-lint`: Format, Compact, Lint, problems list, on-save behaviour.
- `local-links`: opening linked local documents and refusal rules.
- `editor`: syntax highlighting, markers, edits as one undo step.
- `settings`: Markdown standard and tidy preferences.
- `offline-privacy`: all rendering is local; no network requests.
- `folder-workspace`: tree reveal of a opened link target.

## Impact

Frontend `logic/markdown`, `logic/tidy`, preview and editor components, Monaco setup; backend settings defaults and the preview-link resolver; bundled fonts and libraries (KaTeX, Mermaid, highlighting). Current `openspec/specs` are authoritative.
