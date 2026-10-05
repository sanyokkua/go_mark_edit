# Tasks

> Reconstructed after the fact from the specification and the delivered code; the original task list was not kept in this form.

## 1. Markdown rendering pipeline

- [x] 1.1 Build the per-standard pipeline and one sanitization allowlist, with local-only link and image handling
- [x] 1.2 Add GFM constructs, front matter, math with limits, GitHub alerts and admonitions
- [x] 1.3 Add heading anchors with in-preview fragment navigation
- [x] 1.4 Add code highlighting that follows the theme
- [x] 1.5 Add Mermaid rendering with scrubbed output, error boxes, diagram limit and theme redraw

## 2. Format, Compact and Lint

- [x] 2.1 Implement the tidy engine as worker-based minimal edits with the render-equivalence guard
- [x] 2.2 Implement Lint findings, editor markers, status count and problems list navigation
- [x] 2.3 Add the operation slot, progress, cancel and stale-result handling
- [x] 2.4 Wire toolbar, Format menu, context menu and shortcuts, with read-only availability rules
- [x] 2.5 Run Format and Lint on explicit save according to settings

## 3. Following local links

- [x] 3.1 Add the link classifier and backend resolver with refusal notices
- [x] 3.2 Open linked documents from the preview and from editor Cmd/Ctrl-click, with fragment scroll
- [x] 3.3 Reveal in-folder targets in the folder tree

## 4. Settings and editor highlighting

- [x] 4.1 Add Markdown standard and tidy preference settings with backend defaults and live preview update
- [x] 4.2 Add Monaco language highlighting for fenced code and Mermaid source

## 5. Verification and documentation

- [x] 5.1 Add unit, integration and real-backend end-to-end coverage for the above
- [x] 5.2 Update architecture documentation and bundled-asset offline checks
