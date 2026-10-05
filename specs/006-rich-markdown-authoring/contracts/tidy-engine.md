# Contract: Tidy engine (Format, Compact, Lint)

**Owner**: `frontend/src/logic/tidy/`. **Consumers**: the tidy action handler (toolbar, Format menu group, editor
context menu, shortcuts), the on-save hook in `useDocumentWrites`, the problems panel and the status bar. The
engine knows nothing of Monaco, Redux or the bridge.

## Client

```ts
type TidyOp = 'format' | 'compact' | 'lint';

interface TidyPreferences {
    bullet: '-' | '*' | '+';
    emphasis: '_' | '*';
    heading: 'atx' | 'setext';
}

interface TidyRequest {
    op: TidyOp;
    text: string; // LF-normalised working copy of the active document
    prefs: TidyPreferences; // snapshot taken when the run starts
}

interface TidyControl {
    signal: AbortSignal;
    onProgress(done: number, total: number): void;
}

type TidyOutcome =
    | { kind: 'edits'; edits: TextEdit[] } // format, compact; an empty list means nothing to change
    | { kind: 'findings'; findings: LintFinding[]; total: number } // lint
    | { kind: 'refused'; reason: 'render-differs' }
    | { kind: 'cancelled' }
    | { kind: 'failed' }
    | { kind: 'stale' }; // set by the action handler, never by the worker

function runTidy(request: TidyRequest, control: TidyControl): Promise<TidyOutcome>;
```

`runTidy` is a plain client of the tidy worker and resolves with one of the first five kinds. The action handler
turns a result it discards into `stale` (see Applying results); the on-save hook and the operation slot see the
handler's outcome.

## Worker protocol

| Direction      | Message                                                                          |
| -------------- | -------------------------------------------------------------------------------- |
| main to worker | `{ id, op, text, prefs }`                                                        |
| worker to main | `{ id, type: 'progress', done, total }` zero or more times                       |
| worker to main | `{ id, type: 'result', outcome }` exactly once                                   |
| cancel         | `worker.terminate()`; no message is sent back; the next run creates a new worker |

A warm worker may be reused between runs; a cancelled worker never is. Progress is reported per chunk. A worker
error becomes `failed`.

## Parsing

- Parse with `syntaxPlugins('full')` whatever the selected standard; `.txt` documents are handled as Markdown.
- A document of up to 256 KiB is parsed as one chunk. A larger document is split at column-0 ATX headings that
  follow a blank line and lie outside front matter, HTML blocks, HTML comments, `$$` blocks and backtick or
  tilde fences; a `#` line inside any of those constructs never starts a chunk. Each chunk is parsed, edited
  and (when it has edits) re-verified alone. Text before the first qualifying heading is the first chunk. Edit
  offsets are translated back to whole-document offsets.
- A chunk that fails the guard makes the whole run return `refused` with no edits.
- A document above 10 MiB is read-only and is never sent to Format or Compact; Lint accepts it and uses the
  same chunking.

## Format

With the default preferences Format produces:

- bullets `-`, emphasis `_` (intraword emphasis keeps `*`), strong `**`, ATX headings (levels 1 and 2 written
  as Setext when the preference is Setext; levels 3 to 6 stay ATX);
- GFM tables with columns padded to equal display width (East Asian wide characters count as width 2), cell text
  byte-identical, rows not padded to the header width;
- exactly one blank line between blocks outside lists, no trailing spaces or tabs except a hard-break run of two
  or more spaces, a single final newline.

Format never edits: paragraph line breaks, hard breaks, list tightness, ordered-list numbering style (`1. 1. 1.`
and `1. 2. 3.` each keep theirs), the separation of adjacent lists (their markers alternate), indented code,
link and image destinations and titles, front matter, raw HTML, math, and the contents of every fenced or
indented code block.

Edit rules:

1. Bullet: replace the marker character at each list item's start offset.
2. Emphasis and strong: replace the opening and closing delimiters. Use `_` only when both outside neighbours
   are whitespace, punctuation or the edge. Never produce delimiter runs that merge with a neighbouring
   delimiter (`_*x*_` becomes `*_x_*`). `__` becomes `**`.
3. Heading: ATX to Setext only for levels 1 and 2, and only when re-parsing the content plus underline yields one
   heading of the same depth; underline length is `max(3, display width)`. Setext to ATX only for single-line
   content.
4. Table: whitespace around cells only.
5. Line pass: collapse blank-line runs, strip trailing whitespace outside protected ranges, ensure one final
   newline. Protected ranges come from `code`, `html`, `math`, `yaml` and multi-line `inlineCode` nodes; hard
   breaks come from `break` nodes.
6. Nested lists are not re-indented.

## Compact

Rule 5 only: replace each run of two or more blank lines with one, and strip trailing spaces and tabs outside
protected ranges, keeping a run of two or more spaces that forms a hard line break.

## Guard and idempotence

- For Format and Compact, the worker applies the edits to a copy, parses the copy with the Full syntax and
  compares the two mdast trees with positions removed and adjacent text nodes merged. Any difference returns
  `refused: 'render-differs'` and no edits. "Renders the same" is therefore judged at the Full standard.
- Idempotence (Format on formatted text yields no edits) is a property of the rules, proven by corpus tests,
  not checked at run time.

## Lint

Ten rules; a finding has `rule`, `severity`, a range, and message and hint keys (data model `LintFinding`).

| Rule id           | Severity | Detects                                                                                         |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `ul-marker`       | warning  | unordered-list marker differs from the bullet preference (adjacent-list alternation exempt)     |
| `emphasis-marker` | warning  | emphasis delimiter differs from the preference, except intraword emphasis and nesting adjacency |
| `strong-marker`   | warning  | strong delimiter is not `**`                                                                    |
| `heading-style`   | warning  | heading style differs from the preference; levels 3 to 6 always accepted as ATX                 |
| `list-indent`     | warning  | items of one list start at inconsistent columns (right-aligned ordered numbers exempt)          |
| `single-h1`       | warning  | more than one level-1 heading (reported on each after the first)                                |
| `trailing-space`  | error    | trailing whitespace other than a hard-break run; skipped inside code, html, math, front matter  |
| `blank-lines`     | warning  | consecutive blank lines outside protected ranges; one finding per run                           |
| `fence-language`  | warning  | fenced code with no language                                                                    |
| `final-newline`   | error    | text does not end with a newline                                                                |

Format and Lint share the marker classification, intraword and adjacency exemptions and protected ranges from
`rules.ts`, so Lint reports nothing on text Format just produced, except `fence-language`, `single-h1` and
`list-indent`, which Format does not fix. `markdownlint` is a test oracle only.

## Operation slot

- Every run holds the window's operation slot (data model `OperationSlot`): the handler acquires it before
  sending the request and releases it exactly once, whatever the outcome.
- While the slot is held, Format, Compact and Lint are disabled with the reason "another operation is in
  progress", except the running action's Cancel. A second run cannot start.
- When the document is larger than 1 MiB, or once the run has lasted longer than one second, progress
  (`done/total` chunks) is shown and Cancel replaces the triggering control until the outcome. A run that
  ends within one second on a document of up to 1 MiB holds the slot without showing progress or Cancel.

## Applying results (owner: the action handler)

- A result is applied only if the same document is still active and its editor text equals the text the run
  started with. Otherwise the handler discards it, keeps the user's text and the previous findings, shows the
  `tidy-stale` notice and reports `stale`.
- Edits (up to 20,000) are applied with one `executeEdits` between undo stops; above 20,000, one whole-text
  replacement between undo stops. Either way it is one undo step (`CodeEditorHandle.applyEdits` and
  `replaceAll` share `applyEdit`), the text flows through `useSyncedBuffer` to the backend, and the document
  becomes dirty. An empty edit list leaves the document and its undo history unchanged.
- The caret stays on the same logical line where that line still exists.
- Lint findings become markers (`setModelMarkers(model, 'gme-lint', …)`) for the first 1,000 findings in
  document order, each with a hover message naming the rule, severity and hint. Editing the document marks the
  summary stale; markers stay until the next run, or until another document becomes active or the document
  closes, which discards the summary and clears the markers.
- `refused`, `cancelled`, `failed` and `stale` leave the document text and the previous findings unchanged.

## Limits

| Bound                    | Value                   | Above the bound                             |
| ------------------------ | ----------------------- | ------------------------------------------- |
| Single-chunk parse       | 256 KiB                 | split at qualifying headings                |
| Progress and Cancel      | 1 MiB or 1 s of running | shown until the outcome                     |
| Format and Compact input | 10 MiB (editable limit) | disabled, document is read-only             |
| Lint markers             | 1,000                   | count stays exact                           |
| Problems list rows       | 10,000                  | "N more not shown"                          |
| Edits via `executeEdits` | 20,000                  | whole-text replacement, still one undo step |

## Tests

Engine tests live under `frontend/tests/unit/tidy/`; editor-facing tests under `frontend/tests/integration/`.

- Corpus of at least 30 varied documents: Format twice equals Format once; Format and Compact never change the
  Full-syntax tree; every code block is byte-identical; a document that fails the guard is refused untouched.
- Story 2 scenarios with their edge cases: hard break, intraword emphasis, adjacent lists, numbering styles,
  Setext preference, table alignment with wide characters.
- Chunking: a document above 256 KiB with YAML front matter holding `# comment` lines and a `$$` block holding
  a line that starts with `# ` is never split inside either construct, and its Format and Lint results equal
  those of an unsplit parse; a document of up to 256 KiB is one chunk; a chunk that fails the guard refuses
  the whole run.
- `.txt`: a `.txt` document with Markdown content gets the same edits and findings as the same text in a `.md`
  document.
- Caret (integration, `CodeEditorHandle.applyEdits`): after Format or Compact the caret stays on the same
  logical line where that line still exists.
- Lint counts for 0, 1, 10, 1,500 and 12,000 findings; marker cap; problems-list cap; stale state;
  problems-list keyboard activation.
- Slot: a busy slot disables all three actions; progress and Cancel appear at the start of a run on a document
  above 1 MiB and after one second on a smaller document whose run lasts longer; cancellation terminates the
  worker and leaves text and findings unchanged; an edit or an activation change during a run yields `stale`
  with the notice and applies nothing.
