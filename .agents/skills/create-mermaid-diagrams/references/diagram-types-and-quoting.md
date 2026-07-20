# Diagram Types and Quoting Rules

Which Mermaid diagram type to use for a given intent, and the exact syntax rules that keep it
parsing and rendering.

## Which diagram type for which intent

| Diagram type (spell EXACTLY) | Use for |
|---|---|
| `flowchart TD` / `flowchart LR` | Use-case and data flows (the inward-pointing `thunk → adapter → handler → service → repository` path). `TD` for layered architecture, `LR` for a left-to-right pipeline. |
| `sequenceDiagram` | Request/response and event interactions (an agent progress/stream event stream, an OS file-open via `OnFileOpen`). |
| `stateDiagram-v2` | Lifecycles (the story lifecycle `draft → ready → in-progress → done → superseded`; a document's clean/dirty states). **`-v2`, not v1.** |
| `erDiagram` | Related tables (the settings KV table and the recent-files table). |

A wrong-case keyword fails with *"No diagram type detected"* (`gitgraph` fails, `gitGraph` works —
GoMarkEdit's spec doesn't currently use `gitGraph`, but the case-sensitivity rule applies to every
keyword above too: `stateDiagram-v2` fails silently as `statediagram-v2`).

## Node IDs

- Letters, digits, and underscore only; must **start with a letter**.
- No spaces, hyphens, or dots in an id.
- Unique within the diagram.
- Descriptive: `handler`, `adapter`, `repo` — never `A`/`B`/`n1`. A descriptive id keeps future edits
  legible and doubles as self-documentation when the diagram is skimmed in a PR diff.

## Reserved words — never a bare id

`end`, `class`, `subgraph`, `graph`, `state`, `direction`, `default` must never appear as a bare node
id.

- **The `end` gotcha**: a bare `end` used as an id silently **closes a `subgraph`** instead of
  producing an error — the diagram renders wrong with no warning. Use `endNode` (or `endState` in a
  `stateDiagram-v2`), or if the literal word must appear as a label, quote it: `["end"]`.

## Label quoting — the most common failure cause

**Quote any label** containing a space, slash, arrow, parenthesis, `|`, or `#`:

```
H["Handlers (Result envelopes, no ctx)"]
```

not

```
H[Handlers (Result envelopes)]
```

An unquoted `(`, `|`, or `#` inside a label is the single most common parse failure across every
diagram type — it produces *"Syntax error in text"* with no indication of which character caused it.
When in doubt, quote the label.

### Optional: HTML-entity encoding for characters that collide with Mermaid syntax

For labels that need to display a character Mermaid itself uses as syntax (rather than just spacing),
quoting alone isn't always enough — encode the character instead:

| Character | Entity |
|---|---|
| `"` | `#34;` |
| `(` | `#40;` |
| `)` | `#41;` |
| `[` | `#91;` |
| `]` | `#93;` |
| `{` | `#123;` |
| `}` | `#125;` |
| `<` | `#60;` |
| `>` | `#62;` |
| `\|` | `#124;` |
| `\` | `#92;` |
| `#` | `#35;` |

Reach for this only when plain quoting still fails to render (e.g. a label that itself contains a
quote character). For GoMarkEdit's diagrams — module names, method calls, envelope types — plain
`["quoted label"]` is almost always sufficient; don't over-encode simple labels.

## Edge labels

Use the pipe form, and always quote a label containing a `(`:

```
FM -->|"OnFileOpen (macOS)"| app
```

A dashed form also works for a labelled edge: `A -- "label" --> B`.

## Matching block openers with `end`

Every block opener needs a matching `end`:

- `subgraph` / `end`
- Sequence diagram `alt` / `opt` / `loop` / `rect` — each opens a block that needs its own `end`.

A missing `end` breaks the whole diagram from that point forward; an extra bare `end` (see the
reserved-word gotcha above) silently closes the wrong block.

## Direction

A flowchart declares its direction on **line 1**: `TD` / `LR` / `BT` / `RL`. There is no default —
omitting it is a parse error, not a fallback to `TD`.

## Size and formatting discipline

- Keep one diagram to **one idea** — a data-flow diagram doesn't also try to show error handling and
  the settings schema.
- If a diagram exceeds **~15–20 nodes**, split it into multiple focused diagrams (per subsystem or per
  flow) rather than growing one sprawling graph.
- Comments go on their own line — never inline after a statement.
- No trailing semicolons.
