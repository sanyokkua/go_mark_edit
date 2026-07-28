**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md` (DD-40, DD-41, DD-42, DD-43, DD-44, DD-47, DD-48, DD-49, DD-51, DD-55), `01_Product/14_LLM_ASSISTANT_OVERVIEW.md`, `01_Product/15_ACTIONS_LIBRARY.md`, `01_Product/17_PROVIDERS_MODELS_SETTINGS.md`, `01_Product/18_TOKENIZER_AND_CONTEXT.md`, `01_Product/09_ASSETS_AND_SECURITY.md`, `mockups/gomarkedit-mockup.html`

# Chat and Agentic Workflow

The assistant is **agentic**: rather than one fixed prompt, the model runs a **bounded tool-call loop**
that gathers context with read tools and returns a reviewable edit proposal or a chat reply (DD-40).
This document specifies chat, the loop, the tool set and its scope, edit proposals and how they apply,
cancellation, streaming, and the hard limits — plus the loop's edge cases (`EC-LLM-*`).

The mockup (`mockups/gomarkedit-mockup.html`) shows the transcript with tool-call rows
(`read_document (scope=doc) ✓ 1.4k tok`, `propose_edit preserve formatting ✓`), a proposed-edit card
with a coloured diff and **Apply / Re-run / Discard**, and the composer with a context row.

## Table of Contents

1. [Chat](#chat)
2. [Agentic loop](#agentic-loop)
3. [Tools](#tools)
4. [Tool scope](#tool-scope)
5. [Edit proposals](#edit-proposals)
6. [Apply and diff](#apply-and-diff)
7. [Cancellation](#cancellation)
8. [Streaming](#streaming)
9. [Limits](#limits)

## Chat

Chat is a **multi-turn** conversation about the open document (DD-44). The user types questions or
instructions in the composer; the assistant answers, may read context via tools, and may propose edits.
Each turn appends to the transcript shown in the sidebar (user bubble, assistant bubble, interleaved
tool-call rows and edit cards).

- **Per-tab session history.** History is kept **per document/tab for the session** and is *not*
  persisted across app launches in v1 (DD-44). Switching tabs shows that document's own transcript;
  closing a tab discards its transcript. A run transcript (messages + tool calls + applied edits) is
  available for the current session (DD-55); persistent history is optional and, if ever added, stores
  local snapshots only.
- **Seeding.** A quick action or the **Custom instruction…** path seeds the same conversation: the
  action's directive (or the user's free text) becomes the first user turn of that run
  (`15_ACTIONS_LIBRARY.md`). Chat and actions share one transcript, one loop, one scope control.
- **Context indicator.** The composer's context row shows what the agent may access this turn: **current
  document** always, and **workspace files** only when a folder workspace is open (see
  [Tool scope](#tool-scope)).

## Agentic loop

A run is a bounded loop (DD-40): **Action → tool call → observation → decide → repeat**, terminating
when the model returns a final message and/or an edit proposal, or when a limit is hit.

Each iteration: the app sends the conversation (system prompt, directive, prior tool observations,
budgeted document/selection and history — `18_TOKENIZER_AND_CONTEXT.md#context-budget`) to the
provider; the model either (a) requests a tool call, which the app executes and feeds back as an
observation, or (b) returns a final assistant message, optionally with a `propose_edit` result. The
loop **checks for cancellation every iteration** (DD-47) and enforces **hard iteration and time
limits** (DD-40; see [Limits](#limits)).

The loop is the single execution path for all three interaction modes
(`14_LLM_ASSISTANT_OVERVIEW.md#modes-actions-chat`). Tool-call rows are rendered live in the transcript
so the user can see what the agent read and did.

- **EC-LLM-1 — Runaway loop.** If the model keeps calling tools without converging, the loop stops at
  the **max-iteration** limit (default 8, configurable — mockup *AI Context* → "Max agent tool
  iterations"), returns whatever partial result exists, and posts a clear "Reached the tool-iteration
  limit" notice instead of continuing indefinitely (DD-40).

## Tools

The agent may call a small, fixed set of tools (DD-41). Tool descriptions are **concise** because each
tool schema is re-sent every call and consumes the context budget (DD-51). The tools:

- **`read_document`** — returns the current document's content, honouring the active scope; reports an
  approximate token count.
- **`read_selection`** — returns the current editor selection (the selected range only).
- **`list_workspace_files`** — lists Markdown/text files under the open workspace root (relative paths);
  **available only when a folder workspace is open**.
- **`read_workspace_file`** — reads one allowlisted Markdown/text file under the workspace root;
  **available only when a folder workspace is open**.
- **`propose_edit`** — the model's only way to change content: it returns a **proposed edit** (the new
  text / a diff) for the user to review. It **never writes to disk or the buffer** (DD-42).

All tools are exposed through the reserved seams: document/selection via the document-command interface
(F2/F3), workspace files via the asset allowlist rules (`09_ASSETS_AND_SECURITY.md`).

## Tool scope

Tool access is **least-privilege and read-mostly** (DD-41):

- **Read-only by default.** Only `propose_edit` produces change, and it produces a *proposal*, not a
  write. There is **no** arbitrary filesystem, shell, process, or network tool.
- **Document vs workspace.** `read_document`/`read_selection` are always available (they read the open
  buffer). Workspace tools (`list_workspace_files`, `read_workspace_file`) are available **only when a
  folder workspace is open**; with a single loose file open they are absent from the tool set.
- **Allowlisted + traversal-rejected.** Workspace reads reuse the asset allowlist: workspace
  root only, filtered to `.md/.markdown/.mdown/.txt`; any path escaping the
  allowlist (via `..`, absolute paths, or symlink) is rejected (DD-41;
  `09_ASSETS_AND_SECURITY.md#path-traversal`).
- **Untrusted arguments.** Tool-call arguments from the model are treated as **untrusted input**: every
  argument is validated (path within allowlist, scope enum valid, size within limits) before the tool
  runs. Invalid arguments produce a tool error observation, not an action.

Edge cases:

- **EC-LLM-2 — Tool error.** A tool fails (file missing, read error, buffer unavailable): the app
  returns a structured error **observation** to the model and continues the loop, letting the model
  recover or explain; it does not crash the run. Repeated failures still terminate at the iteration
  limit (EC-LLM-1).
- **EC-LLM-3 — Invalid tool arguments.** The model calls a tool with malformed/missing/out-of-range
  arguments (bad scope value, unknown file, non-string path): the app rejects the call with a validation
  error observation and does not execute it (DD-41).
- **EC-LLM-13 — Workspace tool with no folder open.** The model attempts `list_workspace_files` /
  `read_workspace_file` while only a loose file is open: the tool is absent, and any call returns a "no
  workspace open" observation. The composer context row omits the workspace chip in this state.
- **EC-LLM-14 — Path traversal attempt.** A `read_workspace_file` argument resolves outside the
  allowlist: the call is **rejected** before any I/O, and the rejection is logged locally (no path
  leaked to a network, DD-33) and returned as an error observation.

## Edit proposals

The model **never writes files directly** (DD-42). When it wants to change content it calls
`propose_edit`, which yields an **edit proposal** rendered as a card in the transcript (the mockup's
`.editcard`): a header naming the scope (`✎ Proposed edit — release-notes.md` / `— the selection`), a
**coloured diff** (deletions struck through, insertions highlighted), and an action row.

A proposal reuses the reusable diff component (F9) built for Format/Lint. A run may return
zero proposals (a pure chat answer) or one proposal; the model returns the *intended* new text and the
app computes the diff against the current scope for display.

- **EC-LLM-12 — No / malformed edit.** If the model claims an edit but `propose_edit` returns empty or
  unparsable content, the app shows the assistant's message without a card and notes that no applicable
  edit was produced, rather than presenting an empty diff.

## Apply and diff

The user decides what happens to a proposal (DD-42). The card's action row offers:

- **Apply** — writes the proposed text into the **editor buffer** via the document-command seam
  (F3/F7): a **Selection**-scoped edit replaces only the selected range (`replace-range`); a **Whole
  document**-scoped edit replaces the buffer (`replace-all`) (DD-43). This sets the document dirty and
  flows to disk only through the normal save/autosave path — nothing is written to disk by the assistant
  itself.
- **Re-run** — runs the action again, against the current buffer. This is the remedy for a proposal you
  do not like *and* for a proposal that has gone stale because you edited the document while it was
  running.

  There is **no partial apply.** Accepting individual hunks was refused on 2026-07-25
  (`00_Foundation/01_VISION_AND_SCOPE.md#refused-on-2026-07-25-with-reasons`): it needs conflict
  handling between accepted and rejected hunks for a benefit nobody asked for, and the proposal is
  already reviewable in full before anything is applied. The mockup's Partial button has been removed.
- **Discard** — drops the proposal; the transcript keeps a record that it was discarded (DD-55).

After Apply, the app may optionally run **Format** on the applied region (reusing the callable Format
transform, F8) to normalize the result; this is a setting, not automatic in a way that would surprise
the user.

- **EC-LLM-22 — Selection-scoped Apply replaces only the selected range.** Applying a **Selection**-scoped
  proposal writes only over the selected range (`replace-range`) via the F3/F7 document-command seam — never
  the whole buffer — while a **Whole document**-scoped proposal uses `replace-all`; either way nothing
  reaches disk until the normal save/autosave path runs (DD-42, DD-43).
- **EC-LLM-6 — Edit no longer applies (buffer changed).** If the buffer changed between proposal and
  Apply (the user typed, or applied another proposal) so the diff's anchor/base text no longer matches,
  the app **does not blindly overwrite**: it detects the mismatch, marks the proposal **stale**, and
  offers to **re-run** the action against the current buffer or to apply as a best-effort with the
  hunk-review view. A stale Selection proposal whose range no longer exists is likewise flagged, not
  force-applied.

## Cancellation

A run is **cancellable** and cancellation is checked **each iteration** (DD-47). The sidebar shows a
Cancel affordance while Busy; cancelling stops the loop at the next iteration boundary.

- **EC-LLM-5 — Cancelled mid-tool.** If the user cancels while a tool call or provider request is in
  flight, the loop terminates at the next checkpoint: any in-flight local tool result is discarded, the
  provider request is abandoned, the single-flight gate is released, and the transcript records the run
  as **cancelled**. No partial edit is applied. The assistant returns to **Ready**.

## Streaming

Streaming is an optional **UX enhancement**, never required for correctness (DD-49). When the provider
supports it, assistant text **streams** into the chat bubble token-by-token; tool-call decisions and
`propose_edit` results are surfaced when the model emits them. When streaming is unavailable or
disabled, the assistant posts the complete message on turn completion (non-streaming fallback). A
run's correctness (tool loop, proposals, apply) is identical either way.

- **EC-LLM-20 — Streaming interrupted.** If a stream is interrupted mid-flight (connection drop, provider
  abort), the transcript still finalises to a **consistent** state: whatever text arrived is committed as
  the assistant message (or the run falls back to a non-streaming completion), never leaving a corrupt or
  half-rendered bubble (DD-49). Correctness never depends on streaming having completed.

## Limits

Hard limits keep the agent bounded and the app responsive (DD-40, DD-47):

- **Max tool iterations** — default **8**, configurable in **AI Context** settings (mockup: "Max agent
  tool iterations"). Hitting it terminates the loop (EC-LLM-1).
- **Run timeout** — a wall-clock cap per run, default **120 s**
  (`17_PROVIDERS_MODELS_SETTINGS.md#ranges-and-defaults`); exceeding it cancels the loop like a user
  cancel and surfaces a timeout error (DD-48).

  **This budget dominates.** The three bounds multiply: iterations × attempts × per-attempt timeout.
  At the defaults that is 8 × 4 × 60 s ≈ **32 minutes** of one click holding the gate, if nothing
  pre-empts it. The run budget is what pre-empts it, and every attempt's deadline is
  `min(perAttemptTimeout, timeRemainingInRunBudget)` (ADR-0034).
- **No-progress detection** — the loop stops if the model requests the **same tool with the same
  arguments twice in a row**. An iteration cap alone does not help here: a small model that calls
  `read_document` identically will do it eight times and spend the whole budget learning nothing.
- **Consecutive validation failures** — the loop ends on the **second consecutive** argument-validation
  failure. A single failure returns an error observation **with the schema echoed back** and consumes
  one iteration. For a small model, malformed arguments are the normal case rather than an exception,
  so ending the run on the first one would make the assistant unusable.
- **Single in-flight inference, app-wide** — a process-wide single-flight gate allows **at most one**
  LLM run at a time; runs are serialized, never parallel (DD-47; reuses the F5 gate).

### When the model cannot call tools

Tool support is a property of the **model**, not the provider kind (ADR-0034), and on a local-first
default most installed models do not have it.

When `Test tools` has established that the selected model cannot call tools — or a run discovers it —
the assistant **runs a single-shot path** instead of failing: the scope goes in, edited text comes back,
and it is presented as the same reviewable proposal. Actions that genuinely need to read other files are
disabled, with the reason on the row.

Without this the failure is not graceful. Ollama returns HTTP 400 about tools, and unless it is
recognised the classification is `upstream`, which is retryable — so the user gets four identical
failures. LM Studio and llama.cpp are worse: they frequently **accept the request, ignore the `tools`
array and return prose**, which the loop reads as a final answer. The user is shown the model narrating
what it would like to read.

Edge cases:

- **EC-LLM-23 — Model does not support tool calls.** Recognised as `tools_unsupported` (non-retryable),
  and the run continues on the single-shot path. Never four retries of the same 400.
- **EC-LLM-24 — Invalid tool arguments.** An error observation with the schema echoed back; one
  iteration consumed; the run ends only on the second consecutive failure.
- **EC-LLM-25 — The model repeats a tool call identically.** The loop stops rather than spending the
  remaining iterations.
- **EC-LLM-26 — A proposal was truncated** (`finish_reason == "length"`). Reported as "the model ran out
  of room to answer — raise Max output tokens", never as "no applicable edit" and never as a generic
  tool failure.
- **EC-LLM-27 — Tool output is untrusted content.** A workspace file returned by a tool is delimited and
  framed as inert data exactly as the primary input is (DD-76). A note containing instructions is
  content, not a command.
- **EC-LLM-4 — Provider busy.** A second run requested while one is in flight is refused with a **Busy**
  error (`apperr.Busy()`); the UI keeps the first run and shows a "one request at a time" notice rather
  than queueing silently (DD-47).
- **EC-LLM-7 — Provider unreachable / timeout.** A run whose provider request times out or cannot
  connect is classified and, if retryable, retried with backoff (honouring `Retry-After`), then surfaced
  through the standard Result-envelope + toast path if it still fails (DD-48;
  `17_PROVIDERS_MODELS_SETTINGS.md`). The gate is released either way.
- **EC-LLM-19 — Rate-limited (429).** A run whose provider returns `429 Too Many Requests` is classified
  as a **retryable** rate-limit error and retried with backoff, honouring any `Retry-After` header, up to
  the retry budget; if it still fails it surfaces through the standard Result-envelope + toast path. The
  gate is released either way (DD-48). Distinct from EC-LLM-7's connect/timeout failures.
