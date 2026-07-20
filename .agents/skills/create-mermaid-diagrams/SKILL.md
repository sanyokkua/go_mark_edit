---
name: create-mermaid-diagrams
description: Use when authoring or updating an architecture, data-flow, sequence, state-machine, or entity-relationship diagram inside a GoMarkEdit specification Markdown file. Covers picking the right Mermaid diagram type, the label-quoting/encoding rules that prevent "Syntax error in text", and keeping the diagram in sync with the prose and the module inventory. Do NOT use for UI window/dialog surfaces — those are HTML mockups under specification/mockups/, a separate concern.
allowed-tools: Read, Write, Edit, Glob, Grep
references:
  - references/diagram-types-and-quoting.md
  - references/gomarkedit-examples.md
  - references/troubleshooting.md
assets:
  - assets/diagram-skeletons.md
---

# Creating Mermaid Diagrams

All technical diagrams in the GoMarkEdit spec — flow, sequence, state, entity-relationship — are
**Mermaid fenced code blocks** embedded in the spec Markdown (e.g. the data-flow diagram in
`specification/02_Architecture/01_SYSTEM_ARCHITECTURE.md`). A diagram must **parse**, render, and stay
consistent with the spec text and module names it illustrates.

> **Parse is not render.** A diagram can look syntactically fine and still fail to render with *"Syntax
> error in text"* — almost always an unquoted special character in a label. Prefer the simplest construct
> that conveys the meaning.

## When to use

Adding or editing a flow/sequence/state/ER diagram in a spec `.md` file, or a spec change means an
existing diagram no longer matches the prose beside it.

## When NOT to use

Do NOT use for UI surfaces (windows, dialogs, toolbars) — those are **HTML mockups** under
`specification/mockups/` (e.g. `mockups/gomarkedit-mockup.html`), never Mermaid. Do not conflate the two:
a Mermaid diagram documents structure/flow/lifecycle/data, an HTML mockup documents a visual surface.

Also distinguish this skill's job from the app's own runtime feature: `ui/components/MermaidBlock`
(see the module inventory) is the GoMarkEdit **product's** renderer that displays a user's `mermaid`
fenced block inside a previewed document at runtime. This skill instead authors diagrams **into the
spec's own Markdown** as a documentation author — a different concern that happens to use the same
underlying syntax.

## Workflow

1. **Pick the diagram type.** Match the thing you're depicting (flow, interaction, lifecycle, or data
   model) to the exact keyword using the table in `references/diagram-types-and-quoting.md`.
2. **Author the diagram** following the label-quoting, node-id, and block-closing rules in
   `references/diagram-types-and-quoting.md`. Before writing from scratch, check
   `references/gomarkedit-examples.md` for a worked, in-repo example of the same diagram type — reuse its
   shape rather than inventing new conventions. `assets/diagram-skeletons.md` has copy-paste starting
   skeletons for each type.
3. **Use real names.** Every node/participant/entity label must use an actual module or layer name from
   `specification/06_Process_and_Traceability/01_MODULE_INVENTORY.md` (`internal/*`, `logic/*`, `ui/*`) —
   never an invented name. Keep the diagram consistent with the surrounding spec prose; the prose itself
   is **frozen** — this skill adds/updates the diagram, it does not rewrite spec text to fit the diagram.
4. **Validate before saving** using the checklist below. If a diagram fails to parse/render, or you're
   unsure why, check `references/troubleshooting.md` for the specific fix.

## Reference Index

| Reference file | Load when |
|---|---|
| `references/diagram-types-and-quoting.md` | Choosing a diagram type, or writing/debugging quoting, node-id, or block-closing syntax |
| `references/gomarkedit-examples.md` | You need a worked, in-repo example of the diagram type before writing your own |
| `references/troubleshooting.md` | A diagram fails to parse/render, or you're doing a final pre-commit sanity pass |

## Mandatory validation

- [ ] It parses and renders — no unquoted `(`, `|`, `#`, `/`, or space in a bare label.
- [ ] Every label with spaces/punctuation is `["quoted"]`; node ids are letters/digits/underscore only,
      unique, and never a bare reserved word (`end`, `class`, `subgraph`, `graph`, `state`, `direction`,
      `default`).
- [ ] The diagram type keyword is spelled exactly (`flowchart TD`/`LR`, `sequenceDiagram`,
      `stateDiagram-v2`, `erDiagram`).
- [ ] Every `subgraph`/`alt`/`opt`/`loop`/`rect` opener has a matching `end`.
- [ ] Flowchart declares a direction on line 1.
- [ ] The type matches the intent (flow vs. sequence vs. state vs. ER) — see
      `references/diagram-types-and-quoting.md`.
- [ ] Labels use **real** module/layer names from `01_MODULE_INVENTORY.md`, consistent with the prose
      beside the diagram.
- [ ] It fits on screen (≤ ~15–20 nodes); split into multiple diagrams if it sprawls.
- [ ] It is not modeling a UI window/dialog — that belongs in an HTML mockup under
      `specification/mockups/`.

## Gotchas

- Unquoted `(`, `|`, or `#` in a label → *"Syntax error in text"* — the single most common failure.
- A bare `end` node id silently closes a `subgraph` instead of raising an error.
- A wrong-case keyword (`statediagram`, `gitgraph`) → *"No diagram type detected"*; case is significant.
- Full troubleshooting list, including literal-`\n` and placeholder-id mistakes: `references/troubleshooting.md`.

## Spec references

- `specification/02_Architecture/01_SYSTEM_ARCHITECTURE.md`
- `specification/06_Process_and_Traceability/01_MODULE_INVENTORY.md`
- `specification/06_Process_and_Traceability/02_STORY_FORMAT.md`
