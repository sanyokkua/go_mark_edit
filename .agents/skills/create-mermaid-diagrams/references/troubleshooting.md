# Common Mistakes and Troubleshooting

Failure symptoms you'll actually see, and the fix for each — check this when a diagram you just wrote
doesn't parse or renders wrong.

- **Unquoted `(`, `|`, or `#` in a label** → *"Syntax error in text"*. Quote the whole label:
  `H["Handlers (Result envelopes)"]`, not `H[Handlers (Result envelopes)]`.
- **A bare `end` node id** silently closes a `subgraph` instead of erroring — the diagram renders with
  a block cut off in the wrong place and no warning. Rename the id to `endNode` (or `endState`), or
  quote a literal label: `["end"]`.
- **Wrong-case keyword** (`statediagram`, `gitgraph`, `Statediagram-v2`) → *"No diagram type
  detected"*. Match the case exactly: `stateDiagram-v2`, `sequenceDiagram`, `erDiagram`, `flowchart`.
- **Literal `\n` in a label** does not produce a line break and often breaks parsing outright — use
  `<br/>` instead.
- **Placeholder ids** (`A`, `B`, `n1`) parse fine but make the diagram illegible and hard to diff —
  use meaningful ids (`handler`, `adapter`, `repo`) so future edits stay legible.
- **Diagram drifted from the prose** — a diagram edited without updating the paragraph beside it (or
  vice versa) becomes actively misleading. Update both together, and always use real module/layer
  names from `01_MODULE_INVENTORY.md`, never invented placeholder names.
- **Modeling a UI window as Mermaid** — a window, dialog, or toolbar surface does not belong in a
  Mermaid diagram at all; it belongs in an HTML mockup under `specification/mockups/`. If you find
  yourself trying to lay out buttons and panels in a `flowchart`, stop and switch artifacts.
- **A diagram that "looks right" in source but fails to render** — remember parse is not render: a
  missing quote or an unmatched `end` can produce syntactically plausible-looking Mermaid that still
  throws *"Syntax error in text"* at render time. Re-check every label against the quoting rules in
  `references/diagram-types-and-quoting.md` rather than assuming the source is fine because it reads
  cleanly.
