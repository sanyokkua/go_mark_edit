# Chatting about a document

## What it's for

An action answers a question you already knew how to ask. A conversation is for the ones you don't:
"what's inconsistent between this and the other file", "why does this section feel long", "rewrite the
second half in the voice of the first". It is also where the model gets to *look things up* — read the
selection, list the folder, open a neighbouring note — instead of being handed one blob of text and
guessing.

The whole design is built around one refusal: the model never writes anything. It proposes, you decide.

## What you can do

Type in the composer at the bottom of the assistant sidebar and press send. The assistant may answer,
may read things first — you see each read as a row in the transcript — and may propose an edit, which
arrives as a diff card with **Apply**, **Re-run** and **Discard**.

The conversation is per document. Switching tabs shows that document's own transcript. It is not kept
after the app closes.

`Ctrl/Cmd+J` shows and hides the sidebar. While a run is in flight, Cancel is available.

## Rules

### One loop serves actions, chat and custom instructions {#one-loop-three-modes}
- A quick action, a chat message and a custom instruction all seed the **same** loop and the **same**
  transcript. They differ only in what starts them.
- A run terminates when the model returns a final message, or a proposed edit, or both — or when a limit
  is reached.

Examples: Proofread and a typed question appear in one transcript, in order · three separate execution
paths → three sets of bugs in the same shape.

### The loop is bounded and cancellation is checked every iteration {#loop-is-bounded}
- Each iteration: the app sends the conversation, and the model either requests a tool call — which the
  app executes and feeds back as an observation — or returns a final message.
- The loop checks for cancellation at every iteration boundary.
- The default maximum number of iterations is **8**.
- **If** the iteration limit is reached, **then** whatever partial result exists is returned and the
  transcript posts `Reached the tool-iteration limit`.

Examples: a model that keeps reading files without converging → stopped at 8 with an honest notice · an
unbounded loop → the gate is held indefinitely and the only exit is quitting the app.

### One wall-clock budget per run, and it wins {#one-wall-clock-budget}
- Attempts are **`1 + maxRetries`**. Three retries means four attempts.
- Every attempt's deadline is `min(perAttemptTimeout, timeRemainingInRunBudget)`.
- The run budget **pre-empts** retries and iterations both. It is not a fourth independent limit sitting
  outside them.
- A retry neither consumes an iteration nor emits a new iteration progress event.

Examples: a 60-second per-attempt timeout, 3 retries and 8 iterations composed by multiplication → one
click on Proofread can hold the gate for roughly half an hour before any limit fires · the same three
bounds under one run budget → the run ends when the budget does.

### Two further termination rules, because an iteration cap is not enough {#extra-termination-rules}
- **When** the model requests the **same tool with the same arguments twice in a row**, the run stops.
- **When** a second **consecutive** argument-validation failure occurs, the run ends.
- A single validation failure returns an error observation **with the schema echoed back** and consumes
  one iteration.

Examples: a small model calling `read_document` with identical arguments repeatedly → stopped on the
second · malformed arguments once → the schema is sent back and the model usually recovers, because for
a small model malformed arguments are the normal case rather than an exception.

### There are five tools and no others {#the-five-tools}

| Tool | Does | Available |
|---|---|---|
| `read_document` | Returns the current document's content, honouring the active scope, with an approximate token count | always |
| `read_selection` | Returns the current editor selection only | always |
| `list_workspace_files` | Lists Markdown and text files under the open workspace root, as relative paths | only while a folder is open |
| `read_workspace_file` | Reads one allowlisted Markdown or text file under the workspace root | only while a folder is open |
| `propose_edit` | Returns a proposed edit for the user to review | always |

- There is **no** arbitrary filesystem tool, no shell, no process, and no network tool.
- Tool descriptions are kept concise, because every schema is re-sent on every call and costs tokens
  each time.

Examples: a loose file open with no folder → the two workspace tools are absent from the tool set
entirely, and a call to one returns a "no workspace open" observation · a general `read_file` tool → the
model can read anything on the machine.

### Every tool argument is untrusted and validated before anything runs {#tool-arguments-are-validated}
- Every argument is validated before the tool executes: a path is inside the allowlist, a scope value is
  a known enum member, a size is within limits.
- **If** validation fails, **then** the call is rejected with a validation error observation and the tool
  does **not** run.
- A workspace path that escapes the allowlist through `..`, an absolute path or a symlink is rejected
  **before any file I/O**, and the rejection is logged locally.

Examples: `read_workspace_file("../../.ssh/id_rsa")` → rejected before anything is opened, and the
rejection never leaves the machine · validating after reading → the read already happened.

### A tool failure is an observation, not a crashed run {#tool-failures-continue-the-loop}
- **If** a tool fails — a missing file, a read error, an unavailable buffer — **then** a structured error
  observation goes back to the model and the loop continues, letting it recover or explain.
- Repeated failures still terminate at the limits above.

Examples: a file deleted between the listing and the read → the model is told, and it tries another ·
the run crashing → the user loses the whole conversation over one missing file.

### The model never writes anything {#the-model-never-writes}
- `propose_edit` is the model's only way to change content, and it produces a **proposal**.
- Nothing reaches disk except through the normal save or autosave path, after the user applies and the
  buffer changes.

Examples: a run that rewrites a document → a diff card; the file on disk is untouched until the user
applies and then saves. · the same run with the user closing the tab before applying → nothing
reached disk, so there is nothing to undo

### A proposal is a card with a diff and three actions {#the-proposal-card}
- A proposal renders as a card naming the scope — `✎ Proposed edit — release-notes.md`, or `— the
  selection` — with a coloured diff and an action row: **Apply**, **Re-run**, **Discard**.
- The model returns the **intended new text**; the app computes the diff for display.
- A run may return no proposal, or one. Never more.
- **If** the model claims an edit but returns empty or unparsable content, **then** the assistant's
  message is shown with a note that no applicable edit was produced — not an empty diff.
- **Discard** drops the proposal, and the transcript keeps a record that it was discarded.

Examples: a pure question → a message, no card · a rewrite → a message and one card.

*Why full text rather than a patch:* small local models cannot reliably produce a valid unified diff.
The app computes the diff itself, and the cost of that choice is paid in the reply reserve; see
`how-much-fits-in-context.md#reserve-follows-the-scope`.

### Apply goes through the document seam, and its shape follows the scope {#apply-through-the-seam}
- **Apply** writes into the **editor buffer** through the document-command seam.
- A **Selection**-scoped edit replaces only the selected range. A **Whole document**-scoped edit replaces
  the buffer.
- Applying sets the document modified; it does not write to disk.
- After Apply, Format may optionally be run on the applied region — a setting, not an automatic surprise.

Examples: a selection-scoped proposal applied → only those lines change · reaching into the editor
widget directly → a second way to change a document, and a second set of bugs.

### A stale proposal is flagged, never force-applied {#stale-proposals}
- **If** the buffer changed between the proposal being made and Apply being pressed, so the proposal's
  base text no longer matches, **then** the proposal is marked **stale** and Re-run is offered.
- A stale selection-scoped proposal whose range no longer exists is likewise flagged rather than
  force-applied.

Examples: type while a run is in flight, then press Apply → the card says it is stale and offers Re-run
· blindly overwriting → everything typed since the run started is silently discarded.

### Cancelling stops at the next iteration boundary and reports what completed {#cancellation}
- A run is cancellable and cancellation is checked each iteration.
- Cancelling releases the gate, returns the trigger control to its normal label, and reports what
  actually **completed** — never the loop index.
- Cancelling is a normal outcome, not an error.

Examples: cancel during iteration 3 with two tool reads done → "cancelled after 2 reads" · "cancelled
after step 3" when step 3 never finished → a message that lies, and a real defect found in a shipped
application.

### One inference runs at a time, application-wide {#single-inference}
- The assistant acquires the same single long-operation gate that export and format-all use.
- **If** the gate is held, **then** a second run is refused immediately with the busy message. It does
  not queue.

Examples: an export running, an action pressed → refused at once · a second gate for inference → two
memory-hungry operations at once, which is what the gate exists to prevent.

### Streaming is an enhancement, never a requirement {#streaming-is-optional}
- **While** the provider supports it, assistant text streams into the transcript.
- Non-streaming is the fallback, and correctness never depends on streaming.

Examples: a provider without streaming → the reply appears at once when it is done, and everything
else behaves identically. · a provider that streams and then drops the connection halfway → the same
failure the non-streaming path would have produced, because correctness never depended on the stream

### The transcript is per document and per session {#transcript-is-per-document-per-session}
- History is kept per document for the session and is **not** persisted across launches.
- Switching tabs shows that document's transcript. Closing a tab discards it.
- Trimming for the context budget affects only what is **sent** to the model, never what is shown.

Examples: two documents open → two conversations · relaunch → both are gone · a trimmed transcript that
also disappears from the sidebar → the user loses a conversation they were reading.

### The composer says what the agent can reach {#context-row}
- The composer's context row shows what this turn may access: the current document always, and workspace
  files only while a folder is open.

Examples: a loose file open → no workspace chip, and the workspace tools are genuinely absent. · a
folder open → the workspace chip appears and the workspace tools are reachable in that same turn

### The model chip opens a picker, and it filters {#model-chip-picker-filters}
- The model chip in the sidebar header names the model this conversation will use. Activating it opens a
  model picker over the configured provider's models.
- That picker carries the **same filter box, the same `N of M shown` header and the same clear control**
  as the one in Settings, and it obeys the same per-provider persisted filter — it is the same rule and
  the same component, specified in
  `connecting-an-ai-provider.md#every-model-picker-filters`.
- **When** the model is changed from the chip while a run is in flight, the in-flight run is unaffected
  and the change applies to the next run — the same behaviour as changing it in Settings, see
  `#config-change-affects-next-run` in that file.

Examples: filter `:free` in Settings, then open the chip → the chip's list is already filtered to
`12 of 327 shown` · a second picker with its own unfiltered list → the user filters twice and the two
disagree about what is available.

## What it looks like

- The chat transcript with tool-call rows and a proposal card —
  `../surface/mockup.html#material-light/assistant-chat`
- Selection scope and the token meter — `../surface/mockup.html#material-light/assistant-selection`
- The diff component — `../surface/mockup.html#material-light/diff-view`
- The assistant region before a provider exists —
  `../surface/mockup.html#material-light/assistant-reserved`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| The tool-iteration limit is reached | `Reached the tool-iteration limit`, with whatever partial result exists | Ask something narrower, or raise the limit |
| The run budget expires | The run ends and says so, naming what completed | Try again, or raise the budget |
| A tool call is rejected as invalid | A row in the transcript showing the rejection; the loop continues | Nothing — the model usually recovers |
| The buffer changed since the proposal | The card is marked stale, with Re-run offered | Re-run, or discard |
| A second run is started while one is in flight | `Something else is running` · `Wait for the current operation to finish, or cancel it.` | Wait, or cancel |
| The reply was truncated | `The model ran out of room to answer` · `Raise Max output tokens in Settings → AI → Context, then try again.` | Raise it |

## Edge cases

**Cancel is pressed mid tool call**
- *Trigger:* Cancel while a workspace file is being read.
- *Expected:* the loop stops at the next iteration boundary, the gate is released, and one terminal
  outcome is reported.
- *Avoid:* releasing the gate while the request is still in flight, so a second run starts against a
  provider that is still busy.

**The workspace is closed mid-run**
- *Trigger:* the folder is replaced while the model is between tool calls.
- *Expected:* the workspace tools stop being available and a call to one returns a "no workspace open"
  observation.
- *Avoid:* reading from a root that is no longer open.

**The tab is closed while its run is in flight**
- *Trigger:* `Ctrl/Cmd+W` during a run.
- *Expected:* the run is cancelled and its transcript is discarded with the tab.
- *Avoid:* a run that completes and tries to post into a transcript that no longer exists.

**A proposal is applied twice**
- *Trigger:* Apply pressed, then pressed again on the same card.
- *Expected:* the second press finds the base text no longer matches and the card is stale.
- *Avoid:* applying the same replacement twice, which for a selection-scoped edit duplicates content.

**The model returns a message and a proposal in one turn**
- *Trigger:* an ordinary rewrite request.
- *Expected:* both are shown — the message above, the card below.
- *Avoid:* dropping the message, which is usually where the model explains what it did and why.

## Not this

- **No arbitrary filesystem, shell, process or network tool.** See `#the-five-tools`.
- **No direct writes.** A model that changes a file without being asked is one the user has to audit
  after every run, which costs more than reviewing a diff before it lands.
- **No partial apply.** Accepting individual hunks needs conflict handling between the accepted and
  rejected parts, and the proposal is already reviewable in full before anything is applied.
- **No persistent chat history across launches in v1.** A stored transcript is stored document text, and
  it would need its own retention, export and deletion story.
- **No more than one proposal per run.** Two proposals means deciding what happens when one is applied
  and the other goes stale, and that is a whole feature.
- **No summarising of chat history.** See `how-much-fits-in-context.md#history-is-a-sliding-window`.

## Decisions

- *2026-07-25* — One wall-clock run budget that pre-empts retries and iterations, plus the
  same-tool-same-arguments and second-consecutive-validation-failure termination rules. Recorded in
  `../../adr/0034-assistant-execution-contract.md`.
- *2026-07-10* — An agentic tool-call loop rather than a fixed prompt chain. Recorded in
  `../../adr/0008-agentic-tool-call-loop.md`.
- *2026-07-10* — Edits are applied through the editor's document-command seam, never by writing a file.
  Recorded in `../../adr/0010-assistant-sidebar-apply-edit.md`.
- *2026-07-28* — The header's model chip opens a **filtering** picker, sharing one component and one
  per-provider persisted filter with the Settings picker. Two model lists that filter differently is two
  answers to "which models can I use".

## Open questions
